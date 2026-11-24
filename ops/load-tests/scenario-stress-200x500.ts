#!/usr/bin/env -S npx tsx
// scenario-stress-200x500.ts — stress test: 200 chains of 500 hops each.
//
// Total: 100,000 ERC-1155 TransferSingle events, in ~200 transactions.
//
// Strategy (key insight: REUSE wallets across chains):
//   Phase 1: derive 500 deterministic wallets (used by ALL 200 chains)
//   Phase 2a: prime 500 wallets with 1 wei native HARA (batched JSON-RPC)
//   Phase 2b: each wallet calls setApprovalForAll(relay, true)   (batched, parallel)
//
//   Phase 3: for each of 200 batchIds:
//     • mint INITIAL_LITERS to wallet[0] with that batchId
//     • executeChain(token, batchId, amount, holders[0..499]) — 499 hops in 1 tx
//
//   Phase 3 mint + executeChain pairs are submitted CONCURRENTLY using
//   the deployer's sequential nonces. Besu's QBFT orders them; blocks
//   fit many per block thanks to the huge gas limit (0x1fffffffffffff).
//
// Expected timing on a healthy 4-validator QBFT chain (2s blocks):
//   • Setup (priming + approvals): ~10-15 sec
//   • All 200 chains submit:        ~5-10 sec
//   • Block confirmation:           ~10-30 sec (depending on how Besu batches)
//   • TOTAL WALL CLOCK:             ~30-60 sec
//
// Gas budget: ~6.4M per chain × 200 = ~1.28B total. Free chain (gas price 0).
//
// Usage: ./scenario-stress-200x500.ts [CHAINS] [HOPS]
//   Defaults: 200 chains, 500 hops each.

import {
  createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi,
  keccak256, toHex, type Hex, type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const CHAINS = Number(process.argv[2] ?? 200);
const HOPS = Number(process.argv[3] ?? 500);
const INITIAL_LITERS = BigInt(process.env.INITIAL_LITERS ?? 1000);
const RPC_WRITE = process.env.RPC_WRITE_URL ?? "http://localhost:8545/rpc/write";
const RPC_READ = process.env.RPC_READ_URL ?? "http://localhost:8545/rpc/read";
const DEPLOYER_KEY = (process.env.DEPLOYER_PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as Hex;
const TOKEN = (process.env.TOKEN_ADDRESS ?? "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853") as Address;
const RELAY = (process.env.RELAY_ADDRESS ?? "0x2279B7A0a67DB372996a5FaB50D91eAA73d2eBe6") as Address;
const CHAIN_ID = Number(process.env.CHAIN_ID ?? 131216);
const SEED = process.env.SEED ?? `stress-${Date.now()}`;
const BASE_BATCH_ID = BigInt(process.env.BASE_BATCH_ID ?? Date.now());

// ── Opt-in speedups (all off by default → reproduces the 2026-05/06 runs exactly) ──
// FAST_SETUP=1       Verification reads go out as JSON-RPC batches (READ_BATCH_SIZE per
//                    request) instead of one request per wallet; wallets that are already
//                    primed/approved are skipped (re-runs with the same SEED need ~no setup);
//                    each setup phase is submitted in one shot with a single wait.
// SKIP_PRIME=1       Skip Phase A. ONLY for chains that accept zero-balance senders (e.g. the
//                    HARA testnet 121299). On chains where Besu's SenderBalanceChecker rejects
//                    unknown accounts this re-creates validator-pool zombies — leave it off.
// PHASE_C_CHUNK=N    Phase C txs per submission (default 15).
// PHASE_C_WAIT_EACH=0  Submit Phase C chunks back-to-back and wait once at the end.
// SKIP_PHASE_C=1     Stop after setup (measures setup / wallet reuse without chain load).
const FAST_SETUP = process.env.FAST_SETUP === "1";
const SKIP_PRIME = process.env.SKIP_PRIME === "1";
const SKIP_PHASE_C = process.env.SKIP_PHASE_C === "1";
const PHASE_C_CHUNK = Number(process.env.PHASE_C_CHUNK ?? 15);
const PHASE_C_WAIT_EACH = process.env.PHASE_C_WAIT_EACH !== "0";
const READ_BATCH_SIZE = Number(process.env.READ_BATCH_SIZE ?? 50);
const SETUP_CHUNK = Number(process.env.SETUP_CHUNK ?? 500);

const ERC1155_ABI = parseAbi([
  "function setApprovalForAll(address operator, bool approved)",
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function mintBatch(uint256 batchId, address to, uint256 amount, bytes32 rspoHash, bytes32 plantationId, uint64 productionDate)",
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

const RELAY_ABI = parseAbi([
  "function executeChain(address token, uint256 batchId, uint256 amount, address[] holders) external",
]);

const deployer = privateKeyToAccount(DEPLOYER_KEY);
// retryCount/retryDelay give viem its own first line of defense against the
// rpc-write 503s that occur when it briefly falls out of sync under load.
const publicClient = createPublicClient({ transport: http(RPC_READ, { retryCount: 6, retryDelay: 2500 }) });
const writeClient = createWalletClient({ account: deployer, transport: http(RPC_WRITE, { retryCount: 6, retryDelay: 2500 }) });

// waitForTransactionReceipt internally polls getBlock/getTransactionByHash and
// will throw on a 503/HTML body (rpc-write evicted mid-sync-flip) or
// BlockNotFoundError. Wrap it so those transient states retry until an overall
// deadline instead of aborting the whole run. (2026-05-28: this is what killed
// the 200x500 run at chunk 18/27.)
async function waitForReceiptResilient(hash: Hex, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  let lastErr: any;
  while (Date.now() < deadline) {
    try {
      return await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (/503|service unavailable|not valid JSON|could not be found|timed out|not enabled|not yet in sync|sync/i.test(msg)) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw e; // genuine error (revert, bad hash) — surface it
    }
  }
  throw new Error(`waitForReceiptResilient: deadline exceeded for ${hash}: ${lastErr?.message ?? lastErr}`);
}

// Derive HOPS deterministic wallets from the seed (reused across all chains)
const wallets = Array.from({ length: HOPS }, (_, i) =>
  privateKeyToAccount(keccak256(toHex(`${SEED}-w-${i}`)) as Hex),
);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// Send a JSON-RPC batch of eth_sendRawTransaction, resilient to rpc-write's
// transient states under load (2026-05-28 findings):
//   - HAProxy 503 / HTML body  → backend briefly evicted; retry whole batch
//   - "Transaction pool not enabled (... not yet in sync)" → rpc-write flipped
//     out of sync for ~1 block; retry just the affected txs
//   - "already known" / "known transaction" → tx is already in the pool from a
//     prior attempt; treat as success (hash = keccak256 of the raw signed tx)
// Hard errors (bad nonce, revert, etc.) are returned as Error immediately.
async function batchSendRawTxs(
  url: string, txs: Hex[], maxRetries = 12,
): Promise<(Hex | Error)[]> {
  const results: (Hex | Error | null)[] = txs.map(() => null);
  let pending = txs.map((tx, i) => ({ tx, i }));

  for (let attempt = 0; attempt <= maxRetries && pending.length > 0; attempt++) {
    const body = pending.map(({ tx }, k) => ({
      jsonrpc: "2.0", id: k, method: "eth_sendRawTransaction", params: [tx],
    }));

    let arr: any[];
    try {
      const res = await fetch(url, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const ct = res.headers.get("content-type") ?? "";
      if (!res.ok || !ct.includes("json")) {
        // 503 / HTML error page — whole batch transient
        if (attempt < maxRetries) {
          process.stderr.write(`      upstream ${res.status}; retrying batch in 3s...\n`);
          await sleep(3000); continue;
        }
        throw new Error(`upstream ${res.status} ${res.statusText}`);
      }
      arr = await res.json() as any[];
    } catch (e) {
      if (attempt < maxRetries) { await sleep(3000); continue; }
      for (const { i } of pending) results[i] = e as Error;
      break;
    }

    const byId = new Map<number, any>(arr.map(r => [r.id, r]));
    const retryNext: { tx: Hex; i: number }[] = [];
    for (let k = 0; k < pending.length; k++) {
      const { tx, i } = pending[k];
      const r = byId.get(k);
      if (!r) { retryNext.push({ tx, i }); continue; }
      if (r.error) {
        const msg = String(r.error.message ?? "");
        if (/already known|known transaction/i.test(msg)) {
          results[i] = keccak256(tx);                       // already pooled → ok
        } else if (/not enabled|not yet in sync|sync target|try again/i.test(msg)) {
          retryNext.push({ tx, i });                        // transient → retry
        } else {
          results[i] = new Error(msg);                      // hard error
        }
      } else {
        results[i] = r.result as Hex;
      }
    }

    pending = retryNext;
    if (pending.length > 0 && attempt < maxRetries) {
      process.stderr.write(`      ${pending.length} tx(s) hit transient sync state, retrying in 3s...\n`);
      await sleep(3000);
    }
  }

  return results.map(r => r ?? new Error("unresolved after retries"));
}

// Batched JSON-RPC reads (FAST_SETUP): one HTTP request per READ_BATCH_SIZE calls. Through a
// rate-limited gateway over the internet this turns ~400 sequential round-trips into ~8.
async function batchRead(url: string, calls: { method: string; params: unknown[] }[]): Promise<any[]> {
  const out: any[] = new Array(calls.length);
  for (let s = 0; s < calls.length; s += READ_BATCH_SIZE) {
    const slice = calls.slice(s, s + READ_BATCH_SIZE);
    for (let attempt = 0; ; attempt++) {
      let ok = false;
      try {
        const res = await fetch(url, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(slice.map((c, k) => ({ jsonrpc: "2.0", id: k, method: c.method, params: c.params }))),
        });
        const ct = res.headers.get("content-type") ?? "";
        if (res.ok && ct.includes("json")) {
          const arr = await res.json() as any[];
          const byId = new Map<number, any>((Array.isArray(arr) ? arr : [arr]).map(r => [r.id, r]));
          if (slice.every((_, k) => byId.get(k) && !byId.get(k).error)) {
            slice.forEach((_, k) => { out[s + k] = byId.get(k).result; });
            ok = true;
          }
        }
      } catch { /* transient — retried below */ }
      if (ok) break;
      if (attempt >= 12) throw new Error(`batchRead: slice starting at ${s} failed after retries`);
      await sleep(2500);
    }
  }
  return out;
}

const balancesOf = async (idx: number[]): Promise<bigint[]> =>
  (await batchRead(RPC_READ, idx.map(i => ({ method: "eth_getBalance", params: [wallets[i].address, "latest"] }))))
    .map(h => BigInt(h));
const approvalsOf = async (idx: number[]): Promise<boolean[]> =>
  (await batchRead(RPC_READ, idx.map(i => ({
    method: "eth_call",
    params: [{ to: TOKEN, data: encodeFunctionData({ abi: ERC1155_ABI, functionName: "isApprovedForAll", args: [wallets[i].address, RELAY] }) }, "latest"],
  })))).map(h => BigInt(h) === 1n);
const noncesOf = async (idx: number[]): Promise<number[]> =>
  (await batchRead(RPC_READ, idx.map(i => ({ method: "eth_getTransactionCount", params: [wallets[i].address, "pending"] }))))
    .map(h => Number(BigInt(h)));

// Chunked submit: sends txs in groups of CHUNK_SIZE and waits for each chunk's
// last receipt before moving on. Avoids Besu's broadcast rate-limit piling up
// hundreds of pending txs from different senders (each with nonce=0) which
// causes long propagation delays. Found 2026-05-27 when 500-wallet approval
// phase stuck at 300 pending for >60s.
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 50);

async function batchSendChunked(
  url: string,
  publicClient: ReturnType<typeof createPublicClient>,
  txs: Hex[],
  label: string,
  opts: { waitBetweenChunks?: boolean; receiptTimeoutMs?: number; chunkSize?: number } = {},
): Promise<Hex[]> {
  const waitBetween = opts.waitBetweenChunks ?? true;
  const receiptTimeout = opts.receiptTimeoutMs ?? 180_000;
  const chunkSize = opts.chunkSize ?? CHUNK_SIZE;
  const allHashes: Hex[] = [];
  const totalChunks = Math.ceil(txs.length / chunkSize);
  for (let c = 0; c < totalChunks; c++) {
    const chunk = txs.slice(c * chunkSize, (c + 1) * chunkSize);
    const t0 = Date.now();
    const results = await batchSendRawTxs(url, chunk);
    const errors = results.filter((r): r is Error => r instanceof Error);
    if (errors.length) {
      console.warn(`    chunk ${c + 1}/${totalChunks}: ${errors.length} errors:`, errors.slice(0, 2).map(e => e.message));
    }
    const hashes = results.filter((r): r is Hex => !(r instanceof Error));
    allHashes.push(...hashes);
    if (waitBetween) {
      const lastHash = hashes[hashes.length - 1];
      if (lastHash) {
        await waitForReceiptResilient(lastHash, receiptTimeout);
      }
      process.stderr.write(`    ${label} chunk ${c + 1}/${totalChunks} (${chunk.length} txs) confirmed in ${Date.now() - t0}ms\n`);
    } else {
      process.stderr.write(`    ${label} chunk ${c + 1}/${totalChunks} (${chunk.length} txs) submitted in ${Date.now() - t0}ms\n`);
    }
  }
  if (!waitBetween && allHashes.length) {
    const finalT0 = Date.now();
    const lastHash = allHashes[allHashes.length - 1];
    process.stderr.write(`    ${label}: waiting for final receipt (${lastHash.slice(0, 10)}...)\n`);
    await waitForReceiptResilient(lastHash, receiptTimeout);
    process.stderr.write(`    ${label} all ${allHashes.length} txs final receipt in ${Date.now() - finalT0}ms\n`);
  }
  return allHashes;
}

(async () => {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  STRESS TEST — ${CHAINS} chains × ${HOPS} hops`);
  console.log(`  Total transfer events: ${CHAINS * (HOPS - 1)}`);
  console.log(`  Wallets reused: ${HOPS}`);
  console.log(`  Base batchId: ${BASE_BATCH_ID}`);
  console.log(`  Token: ${TOKEN}`);
  console.log(`  Relay: ${RELAY}`);
  console.log(`  Mode:  FAST_SETUP=${+FAST_SETUP} SKIP_PRIME=${+SKIP_PRIME} PHASE_C_CHUNK=${PHASE_C_CHUNK} PHASE_C_WAIT_EACH=${+PHASE_C_WAIT_EACH}`);
  console.log("═══════════════════════════════════════════════════════════════");

  const startAll = Date.now();

  // ── Phase A — Prime wallets (chunked + verified) ─────────────────────────
  // Priming materializes each wallet's account in world state. If any wallet
  // is missed, Phase B's approval tx for that sender becomes a permanent zombie
  // — SenderBalanceChecker throws on the missing account and the validator
  // pool keeps the tx forever, blocking the chain until all 4 validators are
  // simultaneously restarted. See validator-pool-zombies (memory) / 2026-05-27.
  const allIdx = wallets.map((_, i) => i);
  console.log(`\n▶ A. Priming ${HOPS} wallets with 1 wei native HARA...`);
  let depNonce = await publicClient.getTransactionCount({ address: deployer.address, blockTag: "pending" });
  const primeStart = Date.now();
  if (SKIP_PRIME) {
    console.log(`  (SKIP_PRIME=1: chain accepts zero-balance senders — priming skipped)`);
  } else {
    let toPrime = allIdx;
    if (FAST_SETUP) {
      const bals = await balancesOf(allIdx);
      toPrime = allIdx.filter(i => bals[i] < 1n);
      if (toPrime.length < HOPS) console.log(`  ${HOPS - toPrime.length} wallets already primed (reused) — skipping them`);
    }
    const primeRaws: Hex[] = [];
    for (let k = 0; k < toPrime.length; k++) {
      primeRaws.push(await deployer.signTransaction({
        type: "legacy", chainId: CHAIN_ID, nonce: depNonce + k,
        to: wallets[toPrime[k]].address, value: 1n, gasPrice: 0n, gas: 21_000n,
      }));
    }
    // All priming txs come from the deployer with sequential nonces, so in FAST_SETUP the final
    // receipt (waited for inside batchSendChunked) implies every earlier one is mined.
    if (primeRaws.length) {
      await batchSendChunked(RPC_WRITE, publicClient, primeRaws, "prime",
        FAST_SETUP ? { waitBetweenChunks: false, chunkSize: SETUP_CHUNK } : {});
    }
    depNonce += toPrime.length;

    process.stderr.write(`  verifying ${HOPS} wallet balances...\n`);
    let unfunded: number[] = [];
    if (FAST_SETUP) {
      const bals = await balancesOf(allIdx);
      unfunded = allIdx.filter(i => bals[i] < 1n);
    } else {
      for (let i = 0; i < HOPS; i++) {
        const bal = await publicClient.getBalance({ address: wallets[i].address });
        if (bal < 1n) unfunded.push(i);
      }
    }
    if (unfunded.length) {
      throw new Error(
        `Phase A incomplete: ${unfunded.length}/${HOPS} wallets unfunded ` +
        `(indices ${unfunded.slice(0, 10).join(",")}${unfunded.length > 10 ? "..." : ""}). ` +
        `Abort before Phase B to avoid creating validator pool zombies.`,
      );
    }
  }
  const primeMs = Date.now() - primeStart;
  console.log(`  ✔ ${HOPS} primed and verified in ${primeMs}ms`);

  // ── Phase B — Approve relay (each wallet nonce=0, parallel + verified) ──
  console.log(`\n▶ B. ${HOPS} senders setApprovalForAll(relay, true)...`);
  const apprStart = Date.now();
  const apprData = encodeFunctionData({ abi: ERC1155_ABI, functionName: "setApprovalForAll", args: [RELAY, true] });
  let toApprove = allIdx;
  const nonces: number[] = allIdx.map(() => 0);
  if (FAST_SETUP) {
    const approved = await approvalsOf(allIdx);
    toApprove = allIdx.filter(i => !approved[i]);
    if (toApprove.length < HOPS) console.log(`  ${HOPS - toApprove.length} wallets already approved (reused) — skipping them`);
    // A reused wallet may already have spent nonce 0; ask the chain instead of assuming it.
    const n = await noncesOf(toApprove);
    toApprove.forEach((i, k) => { nonces[i] = n[k]; });
  }
  const apprRaws: Hex[] = [];
  for (const i of toApprove) {
    apprRaws.push(await wallets[i].signTransaction({
      type: "legacy", chainId: CHAIN_ID, nonce: nonces[i],
      to: TOKEN, data: apprData, value: 0n, gasPrice: 0n, gas: 60_000n,
    }));
  }
  if (apprRaws.length) {
    // Different senders: the last hash says nothing about the others, so FAST_SETUP submits in one
    // shot and then polls the batched approval check below until every wallet is approved.
    await batchSendChunked(RPC_WRITE, publicClient, apprRaws, "approvals",
      FAST_SETUP ? { waitBetweenChunks: false, chunkSize: SETUP_CHUNK } : {});
  }

  process.stderr.write(`  verifying ${HOPS} approvals...\n`);
  let notApproved: number[] = [];
  if (FAST_SETUP) {
    const deadline = Date.now() + 180_000;
    for (;;) {
      const approved = await approvalsOf(allIdx);
      notApproved = allIdx.filter(i => !approved[i]);
      if (!notApproved.length || Date.now() > deadline) break;
      await sleep(2000);
    }
  } else {
    for (let i = 0; i < HOPS; i++) {
      const ok = await publicClient.readContract({
        address: TOKEN, abi: ERC1155_ABI, functionName: "isApprovedForAll",
        args: [wallets[i].address, RELAY],
      });
      if (!ok) notApproved.push(i);
    }
  }
  if (notApproved.length) {
    throw new Error(
      `Phase B incomplete: ${notApproved.length}/${HOPS} approvals missing ` +
      `(indices ${notApproved.slice(0, 10).join(",")}${notApproved.length > 10 ? "..." : ""}). ` +
      `Phase C would revert mid-chain — fix before retrying.`,
    );
  }
  const apprMs = Date.now() - apprStart;
  console.log(`  ✔ ${HOPS} approvals confirmed in ${apprMs}ms`);

  if (SKIP_PHASE_C) {
    console.log(`\n  SKIP_PHASE_C=1 — setup only. Setup (A+B): ${((primeMs + apprMs) / 1000).toFixed(1)}s`);
    return;
  }

  // ── Phase C — Submit all CHAINS mint+executeChain pairs concurrently ────
  console.log(`\n▶ C. ${CHAINS} chains: mint + executeChain(${HOPS - 1} hops)...`);
  const chainStart = Date.now();
  const holderAddrs = wallets.map(w => w.address);
  const allRaws: Hex[] = [];

  for (let c = 0; c < CHAINS; c++) {
    const batchId = BASE_BATCH_ID + BigInt(c);

    // Mint: deployer mints INITIAL_LITERS of batchId to wallet[0]
    const mintData = encodeFunctionData({
      abi: ERC1155_ABI, functionName: "mintBatch",
      args: [batchId, holderAddrs[0], INITIAL_LITERS,
        keccak256(toHex(`rspo-${SEED}-${c}`)),
        keccak256(toHex(`plantation-stress-${c}`)),
        BigInt(Math.floor(Date.now() / 1000))],
    });
    allRaws.push(await deployer.signTransaction({
      type: "legacy", chainId: CHAIN_ID, nonce: depNonce++,
      to: TOKEN, data: mintData, value: 0n, gasPrice: 0n, gas: 250_000n,
    }));

    // executeChain: deployer calls relay to move INITIAL_LITERS through holders[]
    const chainData = encodeFunctionData({
      abi: RELAY_ABI, functionName: "executeChain",
      args: [TOKEN, batchId, INITIAL_LITERS, holderAddrs],
    });
    allRaws.push(await deployer.signTransaction({
      type: "legacy", chainId: CHAIN_ID, nonce: depNonce++,
      to: RELAY, data: chainData, value: 0n, gasPrice: 0n,
      gas: 30_000_000n,    // generous — each hop ~15k, 500 hops ~7.5M, +overhead
    }));
  }
  console.log(`  Signed ${allRaws.length} txs in ${Date.now() - chainStart}ms`);

  // Phase C defaults to chunks of 15 with a per-chunk receipt wait. Heavy executeChain txs
  // (250+ hops) hit a per-sender ~200-deep wall in Besu's pool when submitted en
  // masse — pool maintenance can't validate them all and the higher-nonce txs get
  // silently dropped. Keeping pool depth <200 from any one sender at all times
  // works around this. Confirmed during 2026-05-27 investigation.
  // PHASE_C_CHUNK / PHASE_C_WAIT_EACH tune this: each waited chunk costs one block, so on a
  // chain with spare block capacity a bigger chunk means proportionally fewer blocks. Keep
  // PHASE_C_CHUNK well under ~200 so a single sender's pool depth stays below that wall.
  const submitStart = Date.now();
  const successHashes = await batchSendChunked(RPC_WRITE, publicClient, allRaws, "chains", {
    waitBetweenChunks: PHASE_C_WAIT_EACH,
    chunkSize: PHASE_C_CHUNK,
    receiptTimeoutMs: 600_000,
  });
  if (successHashes.length !== allRaws.length) {
    throw new Error(`Phase C: only ${successHashes.length}/${allRaws.length} txs accepted at submission`);
  }
  const phaseCMs = Date.now() - submitStart;
  console.log(`  ✔ All ${successHashes.length}/${allRaws.length} txs confirmed in ${phaseCMs}ms`);

  // Get the LAST executeChain receipt for block info
  const lastExec = successHashes[successHashes.length - 1];
  const lastReceipt = await publicClient.getTransactionReceipt({ hash: lastExec });
  console.log(`  Last tx in block ${lastReceipt.blockNumber}, gas ${lastReceipt.gasUsed}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  const totalElapsed = Date.now() - startAll;
  const totalTransfers = CHAINS * (HOPS - 1);

  // Sum gas across all executeChain receipts (every other tx)
  let totalGas = 0n;
  const sampleN = Math.min(20, successHashes.length);
  console.log(`\n▶ Fetching gas from first ${sampleN} sample receipts...`);
  for (let i = 0; i < sampleN; i++) {
    const r = await publicClient.getTransactionReceipt({ hash: successHashes[i] });
    totalGas += r.gasUsed;
  }
  const avgGasPerTx = totalGas / BigInt(sampleN);
  const estTotalGas = avgGasPerTx * BigInt(successHashes.length);

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`  STRESS TEST COMPLETE`);
  console.log(`  Chains:           ${CHAINS}`);
  console.log(`  Hops per chain:   ${HOPS} (${HOPS - 1} transfer events each)`);
  console.log(`  Total transfers:  ${totalTransfers}`);
  console.log(`  Wall clock:       ${(totalElapsed / 1000).toFixed(1)}s`);
  console.log(`  Effective TPS:    ${(totalTransfers / (totalElapsed / 1000)).toFixed(0)} transfers/s`);
  console.log(`  Setup (A+B):      ${((primeMs + apprMs) / 1000).toFixed(1)}s   Phase C: ${(phaseCMs / 1000).toFixed(1)}s`);
  console.log(`  Phase C rate:     ${(totalTransfers / (phaseCMs / 1000)).toFixed(0)} transfers/s`);
  console.log(`  Avg gas/tx:       ${avgGasPerTx}`);
  console.log(`  Est. total gas:   ${estTotalGas} (~${Number(estTotalGas) / 1e9}B)`);
  console.log(`  Last block:       ${lastReceipt.blockNumber}`);
  console.log(`  Base batchId:     ${BASE_BATCH_ID}  (chains: ${BASE_BATCH_ID}..${BASE_BATCH_ID + BigInt(CHAINS) - 1n})`);
  console.log("═══════════════════════════════════════════════════════════════");
})().catch(e => { console.error(e); process.exit(1); });
