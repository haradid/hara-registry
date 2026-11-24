# HARA Registry — Third-Party Integration Manual

| | |
|---|---|
| **Audience** | Engineering teams at partner organisations integrating an application with HARA Registry: wallets, back-office systems, traceability or credential platforms, auditors' tooling. |
| **Covers** | HARA Registry **Mainnet** (chain ID `121212`) and **Testnet** (chain ID `121299`). |
| **Version** | 2.0 — 2026-11-23. Replaces the June 2026 *Developer & Third-Party Integration Manual*, which described the previous chain (see [Appendix A](#appendix-a--migrating-from-the-previous-hara-registry-chain-131216)). |
| **Verification** | Endpoints, error responses, client version and block cadence in this document were checked against the live networks on 2026-11-23. Items marked *documented* come from HARA's operations documentation and were not re-tested. |

HARA Registry is HARA's credential-ledger layer: a permissioned Hyperledger Besu network (QBFT consensus) that gives partner applications a tamper-evident, gas-free place to record and verify attestations, provenance events and other evidence. HARA operates the network and the access gateway; the authoritative judgments recorded on it (certification decisions, compliance findings, asset assessments) remain with the mandated authority that issues them. The Registry makes those judgments portable, provable and tamper-evident — it does not make them.

---

## 1. Networks at a glance

| | **Mainnet** | **Testnet** |
|---|---|---|
| Chain ID | `121212` (`0x1d97c`) | `121299` (`0x1d9d3`) |
| Purpose | Production. Data is permanent. | Development and integration testing. **Fully reset every quarter** (see §11). |
| JSON-RPC (API key) | `https://rpc.registry.haratoken.app/v1/<API_KEY>` | `https://rpc.mampang.haratoken.app/v1/<API_KEY>` |
| JSON-RPC (no key, throttled) | `https://rpc.registry.haratoken.app/v1/public` | `https://rpc.mampang.haratoken.app/v1/public` |
| WebSocket | `wss://rpc.registry.haratoken.app/v1/<API_KEY>` (or `/v1/public`) | `wss://rpc.mampang.haratoken.app/v1/<API_KEY>` (or `/v1/public`) |
| Explorer (web) | `https://explorer.registry.haratoken.app` | `https://explorer.mampang.haratoken.app` |
| Network status | `https://health.registry.haratoken.app/status` · `https://netstats.registry.haratoken.app` | `https://netstats.mampang.haratoken.app` |
| Faucet | `https://dashboard.registry.haratoken.app/faucet` — allow-listed wallets only | `https://dashboard.mampang.haratoken.app/faucet` — open |
| Client | Hyperledger Besu `26.6.1` | Hyperledger Besu `26.6.1` |
| Consensus | QBFT, 7 validators (tolerates 2 faulty) | QBFT, 3 validators |
| Block time | 5 s | 5 s |
| Finality | Immediate on inclusion (QBFT; no reorganisations) | Immediate on inclusion |
| Gas price | **0** — enforced by the gateway | **0** — enforced by the gateway |
| Block gas limit | 10,000,000,000 | 10,000,000,000 |
| EVM | Shanghai (`PUSH0` available); London fee market with `baseFee = 0` | Shanghai |
| Native unit | HARA (18 decimals). Not required to pay for gas. | HARA |

---

## 2. Recommended integration path

1. **Request access** (§3). You receive an API key for the testnet first; a mainnet key follows once your integration has been exercised on the testnet.
2. **Build and test on the testnet** against the conventions in §5–§7. Everything that works on the testnet works unchanged on the mainnet except the chain ID, the host name and the key.
3. **Deploy your contracts** to the testnet (§8), then to the mainnet with the same artefacts.
4. **Complete the pre-production checklist** (§13) before switching production traffic to the mainnet.
5. **Operate** with the behaviours in §11 in mind — in particular receipt polling, nonce handling and WebSocket reconnection.

---

## 3. Access and API keys

### 3.1 Getting a key

API keys are **issued by HARA**; there is no self-service registration. Request a key through your HARA integration contact (§14) with:

- organisation name and a technical contact;
- the network(s) you need (testnet first);
- expected request rate and daily volume, so the key can be sized correctly;
- for mainnet, the wallet address(es) that should receive native HARA from the faucet, if any (§9).

The key is shown to HARA's administrator once at creation time and is then given to you through the agreed channel. HARA stores only a hash of the key and cannot recover it; a lost key is revoked and replaced.

### 3.2 Key format and handling

- Format: `hara_live_` followed by 32 hexadecimal characters (42 characters in total). Testnet keys use the same format.
- The key is part of the URL path (`/v1/<API_KEY>`). Treat it as a secret: use it from server-side code only, keep it out of browsers, mobile apps, logs, repositories and screenshots. Access logs on your side should mask the path.
- Keys are per application. Ask for separate keys for separate services or environments so that limits and revocation stay independent.
- Status is `active` or `revoked`. Revocation is immediate.

### 3.3 Limits

| | Keyed endpoint (defaults) | Public endpoint (`/v1/public`) |
|---|---|---|
| Requests per second | **10** per key | **1** per source IP |
| Requests per day (UTC) | **100,000** per key | **50** per IP (mainnet) · **100** per IP (testnet) |
| Counting unit | One HTTP request, or one WebSocket message. **A JSON-RPC batch counts as one request.** | Same |
| HTTP and WebSocket | Share the same bucket | Share the same bucket |

- Default limits are raised on request; production integrations routinely run far above the defaults. State your expected peak rate when you ask.
- The public endpoint exists for a first "hello world" call and for status probes. It is not suitable for an application.
- Exceeding a limit returns HTTP `429` with JSON-RPC error `-32005` (exact bodies in §12). Back off for the number of milliseconds given in `data.retryAfter`.

---

## 4. Connecting

Replace `<API_KEY>` with your key and use the testnet host while developing.

### 4.1 curl

```bash
# Chain ID → 0x1d97c (121212) on mainnet, 0x1d9d3 (121299) on testnet
curl -s -X POST "https://rpc.registry.haratoken.app/v1/<API_KEY>" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'

# Latest block number
curl -s -X POST "https://rpc.registry.haratoken.app/v1/<API_KEY>" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

### 4.2 TypeScript (viem)

```ts
import { createPublicClient, createWalletClient, defineChain, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const haraRegistry = defineChain({
  id: 121212,                       // 121299 for testnet
  name: "HARA Registry",
  nativeCurrency: { name: "HARA", symbol: "HARA", decimals: 18 },
  rpcUrls: { default: { http: [`https://rpc.registry.haratoken.app/v1/${process.env.HARA_API_KEY}`] } },
});

const publicClient = createPublicClient({ chain: haraRegistry, transport: http() });
const account = privateKeyToAccount(process.env.SIGNER_KEY as `0x${string}`);
const walletClient = createWalletClient({ chain: haraRegistry, account, transport: http() });

console.log(await publicClient.getBlockNumber());
```

### 4.3 TypeScript (ethers v6)

```ts
import { JsonRpcProvider, Network, Wallet } from "ethers";

const network = Network.from({ name: "hara-registry", chainId: 121212 });
const provider = new JsonRpcProvider(
  `https://rpc.registry.haratoken.app/v1/${process.env.HARA_API_KEY}`,
  network,
  { staticNetwork: network },        // avoids a chain-ID round-trip on every call
);
const signer = new Wallet(process.env.SIGNER_KEY!, provider);
```

### 4.4 Python (web3.py)

```python
import os
from web3 import Web3

w3 = Web3(Web3.HTTPProvider(f"https://rpc.registry.haratoken.app/v1/{os.environ['HARA_API_KEY']}"))
assert w3.eth.chain_id == 121212          # 121299 on testnet
print(w3.eth.block_number)
```

### 4.5 Go (go-ethereum)

```go
client, err := ethclient.Dial("https://rpc.registry.haratoken.app/v1/" + os.Getenv("HARA_API_KEY"))
if err != nil { log.Fatal(err) }
id, _ := client.ChainID(context.Background())   // 121212
head, _ := client.BlockNumber(context.Background())
```

---

## 5. Transaction rules

### 5.1 Gas price must be zero

The network is gas-free. The gateway decodes every `eth_sendRawTransaction` payload and rejects any transaction whose gas price is above zero **before it reaches a node**:

```json
HTTP 400
{"jsonrpc":"2.0","id":7,"error":{"code":-32000,
 "message":"Transaction rejected: gasPrice must be 0 on this network (gas-free chain). Got 1 wei."}}
```

- Legacy (type 0) transactions: set `gasPrice = 0`.
- EIP-1559 (type 2) transactions: set `maxFeePerGas = 0` and `maxPriorityFeePerGas = 0`. The gateway checks `maxFeePerGas`; the network has `baseFee = 0`. HARA's own tooling and documentation use **legacy transactions**, which are the proven path; prefer them unless your stack requires type 2, and validate type 2 on the testnet first.
- Set `gas` (the gas limit) explicitly. Wallet libraries that call `eth_estimateGas` work, but a fixed limit per contract method is faster and avoids load on the read pool (§6.3).

### 5.2 Chain ID

Always sign with the correct chain ID (`121212` mainnet, `121299` testnet). Replay protection is enforced; a transaction signed for the wrong chain is rejected by the node.

### 5.3 No native balance is required

Because gas is free, a wallet with a zero HARA balance can deploy contracts and send transactions. You only need HARA for transactions that *transfer value*. Some client libraries pre-check `balance ≥ gas × gasPrice`; with `gasPrice = 0` that check passes.

### 5.4 Nonce handling

Blocks are produced every 5 s, so an application that sends more than one transaction per block must manage nonces itself:

- **Recommended:** read the nonce once with `eth_getTransactionCount(address, "pending")` at start-up, then increment a local counter per transaction. This is how HARA's reference clients submit hundreds of transactions into a single block.
- **Acceptable:** query `"pending"` immediately before each send.
- **Do not** query `"latest"` before each send: transactions already in the pool are not counted and the next one is rejected as `nonce too low` or ends up queued.

Transactions from one sender are included in nonce order. A gap (a missing nonce) blocks everything behind it until it is filled.

### 5.5 A transaction hash is not confirmation

`eth_sendRawTransaction` returning a hash means the node accepted the transaction into its pool. Treat it as pending until `eth_getTransactionReceipt` returns a receipt, then check the status:

```ts
async function confirm(hash: `0x${string}`, resend: () => Promise<`0x${string}`>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const deadline = Date.now() + 30_000;          // ~6 blocks
    while (Date.now() < deadline) {
      const r = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
      if (r) {
        if (r.status !== "success") throw new Error(`reverted in block ${r.blockNumber}`);
        return r;
      }
      await new Promise((f) => setTimeout(f, 2_500));
    }
    hash = await resend();   // same nonce, same payload — replaces the pending tx if it was lost
  }
  throw new Error("not mined after 3 submissions");
}
```

- A receipt with `status = 0x0` (`"reverted"`) means the transaction was included but your contract call failed. Always check it.
- If no receipt appears within about six blocks, **re-sign and resubmit the same nonce**. If the original was mined meanwhile, the resubmission is rejected as `nonce too low` or `already known`, which is harmless.
- Never give up on a nonce silently: every nonce you have used must end as mined or explicitly replaced.

### 5.6 Batching

- JSON-RPC batch arrays are accepted on both HTTP and WebSocket and count as **one request** against your limits.
- Keep batches to **100 items or fewer** and under **5 MB**; larger bodies are rejected.
- If one item in a batch is a transaction with a non-zero gas price, the whole batch is rejected (§5.1).
- Keep transaction-lifecycle calls (`eth_sendRawTransaction`, `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_getTransactionCount`) in their own batches, separate from `eth_call` / `eth_estimateGas`. Lifecycle-only batches are routed to the freshest node (§6.3).

---

## 6. JSON-RPC surface

### 6.1 Available through the gateway

Standard Ethereum JSON-RPC: the `eth_*` read and filter methods, `eth_sendRawTransaction`, `net_*`, `web3_*`, and `eth_subscribe` / `eth_unsubscribe` over WebSocket.

### 6.2 Not available

Node-administration, consensus-internals, transaction-pool and tracing namespaces are not exposed to third parties: `admin_*`, `qbft_*`, `txpool_*`, `debug_*`, `trace_*`, `miner_*`, `personal_*`. Calling one returns:

```json
{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"Method not available on this endpoint: debug_traceTransaction"}}
```

If your use case needs execution traces (for example an auditor's tool), raise it with HARA; access is arranged case by case.

### 6.3 Read freshness and routing

Requests are routed to different node pools behind the gateway:

- **Transaction lifecycle** (`eth_sendRawTransaction`; batches consisting only of `eth_getTransactionReceipt`, `eth_getTransactionByHash`, `eth_getTransactionCount`) → the write node, which is always at the chain head.
- **Historical state** (`eth_call`, `eth_getBalance`, `eth_getCode`, `eth_getStorageAt`, `eth_getTransactionCount` with an explicit block number more than ~500 blocks old) → the archive node, which keeps full history.
- **Everything else** (`eth_call` at `latest`, `eth_estimateGas`, `eth_getLogs`, `eth_getBlockByNumber`, …) → the read pool.

Under heavy `eth_estimateGas` / `eth_call` load the read pool can lag the head by several blocks. Consequences for your design:

- Never infer "not mined" from a read-pool query; use the lifecycle calls, kept in their own batches.
- Reads at `latest` may be a few blocks behind the newest receipt you have seen. If you need read-after-write consistency, read at the receipt's `blockNumber` or later.
- Prefer fixed gas limits over `eth_estimateGas` in high-volume paths.

### 6.4 Logs

`eth_getLogs` is available. Request **ranges of at most 1,000 blocks** per call and page through larger ranges; very large ranges are rejected by the node. For live tailing use a WebSocket `logs` subscription (§7) backed by periodic `eth_getLogs` reconciliation.

---

## 7. WebSocket subscriptions

```ts
import { createPublicClient, webSocket } from "viem";

const ws = createPublicClient({
  chain: haraRegistry,
  transport: webSocket(`wss://rpc.registry.haratoken.app/v1/${process.env.HARA_API_KEY}`),
});

const unwatch = ws.watchBlockNumber({ onBlockNumber: (n) => console.log("head", n) });
// or: ws.watchContractEvent({ address, abi, eventName, onLogs })
```

- `eth_subscribe` supports `newHeads` and `logs`. Each message counts against your limits exactly like an HTTP request.
- **The gateway does not fail over an open socket.** If the upstream node restarts, your socket is closed with code `1011` (`Upstream error`). Reconnect with exponential back-off and **re-create every subscription**; subscription IDs do not survive a reconnection.
- Close code `4029` means the key's daily quota is exhausted; the socket will not be re-accepted until the UTC day rolls over.
- Rate-limit violations on a socket return an error frame (`-32005`) without closing the connection.
- Send a lightweight call (for example `eth_blockNumber`) every 30–60 s if your network path drops idle connections.
- After any reconnection, run an `eth_getLogs` reconciliation over the blocks you may have missed.

---

## 8. Deploying and verifying contracts

### 8.1 Compiler settings

The EVM is **Shanghai**. Any Solidity 0.8.x release works; `evm_version = "shanghai"` (the default for solc ≥ 0.8.20) or earlier is fine. Contracts compiled for London (no `PUSH0`) also run unchanged.

**Foundry**

```toml
[profile.default]
solc_version = "0.8.26"
evm_version  = "shanghai"

[rpc_endpoints]
hara_testnet = "https://rpc.mampang.haratoken.app/v1/${HARA_API_KEY}"
hara_mainnet = "https://rpc.registry.haratoken.app/v1/${HARA_API_KEY}"
```

```bash
forge create src/MyRegistry.sol:MyRegistry \
  --rpc-url hara_testnet --private-key "$DEPLOYER_KEY" \
  --legacy --gas-price 0 --broadcast
```

**Hardhat**

```ts
networks: {
  haraTestnet: { url: `https://rpc.mampang.haratoken.app/v1/${process.env.HARA_API_KEY}`, chainId: 121299, gasPrice: 0 },
  haraMainnet: { url: `https://rpc.registry.haratoken.app/v1/${process.env.HARA_API_KEY}`, chainId: 121212, gasPrice: 0 },
}
```

### 8.2 Gas budget

The block gas limit is 10 billion, so contract size and single-transaction gas are rarely a constraint. For predictable inclusion keep individual transactions below ~30 million gas and spread very large bursts over several blocks: a block that is much heavier than usual delays the next one while the validators import it.

### 8.3 Verification and explorer

Use the explorer (§1) to inspect blocks, transactions and addresses. Source verification and programmatic explorer APIs are not part of the third-party surface at the time of writing; for machine access to chain data, use JSON-RPC (§6).

---

## 9. Faucet and native HARA

Gas is free, so you need native HARA only to move value or to satisfy tooling that insists on a positive balance.

| | Mainnet | Testnet |
|---|---|---|
| Who can claim | Wallets on HARA's allow-list only. Ask your HARA contact to add your operational wallets. | Anyone |
| Amount | 2 HARA per claim (*documented*) | 10 HARA per claim |
| Cooldown | 24 h per address | 24 h per address and per source IP |
| Human check | Required | Not required |

Claims are processed one at a time; allow a few seconds for the transaction to be mined before checking the balance.

---

## 10. Design guidance for registry workloads

These patterns come from HARA's own traceability and credential systems on this network and are recommended for any partner building similar workloads.

**One business event, one transaction.** Record each attestation or custody event as one contract call that emits one event. Downstream systems (yours and HARA's) index events, not storage reads.

**Make dependent steps atomic.** When several transfers depend on each other (A→B then B→C), do not pre-sign them and send them as separate transactions: inclusion order inside a block is not guaranteed and the later steps revert. Put the whole chain in one contract call (a relay/batch function that performs all hops), or wait for each receipt before sending the next step.

**Idempotency keys.** Give every write a deterministic identifier (for example the hash of the source record) and have the contract reject duplicates. Combined with the resubmission rule in §5.5 this makes retries safe.

**Hashes on-chain, documents off-chain.** Record content hashes, identifiers and status transitions on the Registry. Keep documents, personal data and geometry in your own systems. The chain is permanent and public to all participants.

**Status is a sequence of events, not an overwrite.** Model `issued → suspended → revoked` as appended events so that the full history stays verifiable.

**Role separation.** Keep the key that deploys contracts separate from the keys that write day-to-day events, and keep both separate from your API key. Rotate signing keys through contract roles (for example OpenZeppelin `AccessControl`) rather than redeploying.

**The authority stays the authority.** The Registry records that a mandated body issued, suspended or revoked something, and lets anyone verify that record later. Present it that way in your product: HARA Registry provides the evidence trail; the certification or compliance decision is the issuing authority's.

---

## 11. Operational characteristics

- **Block cadence.** Nominal 5 s. During a consensus round change a block can take 15 s or longer; design time-outs around block *count*, not seconds.
- **Finality.** A transaction in a block is final; there are no reorganisations. One confirmation is enough.
- **Validators.** The mainnet runs seven validators across several cloud providers and tolerates two faulty validators without interruption.
- **Status.** `https://health.registry.haratoken.app/status` shows per-component health with 30-day history; `netstats.registry.haratoken.app` shows live block propagation.
- **Maintenance and incidents.** Announcements are made through your HARA integration contact (§14). No formal uptime SLA is published at the time of writing; ask for the current operating-level statement if your deployment requires one.
- **Testnet resets.** The testnet is wiped back to block 0 at **03:00 UTC on 1 January, 1 April, 1 July and 1 October**. Contracts, balances and history are deleted; API keys and faucet eligibility survive. Re-deploy your contracts after each reset and never rely on testnet addresses in configuration that outlives a quarter.
- **Testnet explorer.** Lightweight: address pages show only recent blocks. Use `eth_getLogs` for history.
- **Gateway activity logs** are retained by HARA for operational purposes (30 days on the testnet).

---

## 12. Error reference

| HTTP | JSON-RPC `code` | `message` (abridged) | Meaning | Action |
|---|---|---|---|---|
| 401 | `-32600` | `Invalid or revoked API key` | Key unknown or revoked | Check the key; contact HARA |
| 429 | `-32005` | `Rate limit exceeded` + `data.retryAfter` (ms) | Per-second limit | Back off `retryAfter` ms; request a higher limit |
| 429 | `-32005` | `Daily quota exceeded` | Daily quota (resets 00:00 UTC) | Wait or request a higher quota |
| 429 | `-32005` | `Rate limit exceeded on the public endpoint — register a free API key …` | Public endpoint throttle | Use your API key |
| 400 | `-32000` | `Transaction rejected: gasPrice must be 0 on this network …` | Non-zero gas price in a raw tx | Set gas price / `maxFeePerGas` to 0 |
| 400 | `-32600` / `-32700` | `Batch size …` / `Parse error` | Malformed request or oversized batch | Fix the payload; ≤ 100 items, ≤ 5 MB |
| 200 | `-32601` | `Method not available on this endpoint: …` | Namespace not exposed | See §6.2 |
| 502 | `-32603` | `Upstream RPC connection error` | Node unreachable for ~30 s | Retry with back-off; check status page |
| 200 | `-32000` / `-32003` | `nonce too low`, `already known`, `replacement transaction underpriced` | Node-level transaction pool responses | Usually harmless after a resubmission; see §5.4–5.5 |
| WS close `1011` | — | `Upstream error` | Upstream socket lost | Reconnect, resubscribe |
| WS close `4029` | — | `Daily quota exceeded` | Key quota exhausted | Wait for UTC rollover |

---

## 13. Pre-production checklist

- [ ] Integration exercised end-to-end on the testnet, including a full quarterly-reset re-deployment drill.
- [ ] Separate API keys per service and environment; keys stored in a secrets manager, absent from code, logs and client-side bundles.
- [ ] Transactions signed with the correct chain ID; gas price / `maxFeePerGas` fixed at 0; gas limits set explicitly.
- [ ] Nonce management uses `"pending"` plus a local counter (§5.4).
- [ ] Every transaction is tracked to a receipt, `status` is checked, and unmined nonces are resubmitted (§5.5).
- [ ] Reads that must be fresh use the lifecycle calls or a block number ≥ the last receipt (§6.3).
- [ ] `eth_getLogs` paged at ≤ 1,000 blocks; WebSocket client reconnects, resubscribes and reconciles (§7).
- [ ] Rate-limit handling honours `retryAfter`; the agreed rate limit covers your peak plus retries.
- [ ] Mainnet operational wallets allow-listed for the faucet if you transfer value.
- [ ] Monitoring subscribed to the status page; an escalation path to HARA agreed.
- [ ] Contract roles reviewed: deployer, writer and admin keys are distinct and recoverable.

---

## 14. Support and change management

- **Integration contact.** Access requests, limit changes, faucet allow-listing, trace access and incident escalation go through the HARA integration contact assigned to your organisation at onboarding.
- **Changes to this surface.** Chain ID, gas-free operation, block time and the JSON-RPC surface described here are stable. Gateway limits and the method allow-list may be tightened for security; HARA will notify partners ahead of changes that affect compatible clients.
- **This document.** Maintained in the HARA Registry repository at `doc/guides/hara-registry-third-party-integration-manual.md`. Report inaccuracies through your integration contact.

---

## Appendix A — Migrating from the previous HARA Registry chain (131216)

The HARA Registry network described in documentation dated before July 2026 — chain ID `131216`, endpoints under `*.ledger.haratrust.io`, Besu 26.4, 2-second blocks — **has been decommissioned**. Its DNS names no longer resolve. Nothing from it is reachable or carried over. Integrations built against it need the following changes:

| | Previous chain (131216) — retired | Current mainnet (121212) |
|---|---|---|
| RPC | `https://rpc.ledger.haratrust.io/read/` and `/write/` (no key) | `https://rpc.registry.haratoken.app/v1/<API_KEY>` (one URL for reads and writes) |
| WebSocket | `wss://rpc.ledger.haratrust.io/ws` | `wss://rpc.registry.haratoken.app/v1/<API_KEY>` |
| Authentication | None | API key issued by HARA; rate limits and quotas |
| Chain ID | `131216` | `121212` |
| Block time | 2 s | 5 s |
| EVM | London only (`PUSH0` unsupported) | Shanghai |
| Pre-funding | ≥ 1 wei required before a wallet's first tx | Not required |
| Transaction type | Legacy only | Legacy recommended; type 2 with zero fees accepted by the gateway |
| Platform contracts (`HaraPalmOil`, `TraceabilityBatchRelay`, `PQAnchorRegistry`, `ContractRegistry`, …) | Deployed at fixed addresses | **Not deployed on 121212.** Partners deploy their own contracts (§8); ask HARA about shared registries before building against one |
| Traceability REST API (`trace.ledger.haratrust.io`) | Available (HTTP Basic) | Not available; index events from JSON-RPC (§6.4, §7) |
| Explorer | Blockscout with `/api/v2` | Web explorer only (§8.3) |
| SDKs `@hara/registry-sdk`, `hara-registry` (Python), Go module | Targeted 131216 by default | Not yet updated for 121212; use viem / ethers / web3.py / go-ethereum directly as in §4 |

All contract addresses, chain parameters and endpoint URLs published for 131216 are void.

---

## Appendix B — Notes for HARA before publication *(remove from the partner-facing copy)*

1. **Support channel.** §14 refers to an "integration contact". Insert the actual partner support address or portal before publishing; none is defined in the operations documentation today.
2. **Key provisioning.** The public endpoint's error text still says "register a free API key", but keys are admin-issued only. Either add a request form/mail link to the dashboard or change the message to match §3.1.
3. **Faucet (mainnet).** Confirm the Turnstile site key includes `dashboard.registry.haratoken.app`; the backlog notes it may not, which would block claims.
4. **Testnet documentation drift.** The testnet access guide still mentions a captcha and allow-list that the deployed faucet does not implement; align one or the other.
5. **Explorer.** `explorer.registry.haratoken.app` currently serves a lightweight web explorer, while the architecture docs describe Blockscout with `/api/v2`. Decide which is the supported partner surface and update §8.3 accordingly.
6. **Platform contracts.** If HARA intends to offer shared registries (anchoring, contract registry) on 121212, publish their addresses and ABIs here; today none are deployed or documented.
7. **SDKs.** `sdk/typescript`, `sdk/python`, `sdk/go` still default to chain 131216 and the retired hosts; re-target or archive them before pointing partners at them.
8. **Operating-level statement.** No SLA or maintenance-window policy exists in writing; partners will ask.
