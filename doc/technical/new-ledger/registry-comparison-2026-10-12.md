# Old Hara Registry vs New HARA Ledger: Technical Comparison

**Date:** 2026-10-12
**Old:** Hara Registry, chainId **131216** (`hara-ledger` repo; NevaCloud, `*.ledger.haratrust.io`)
**New:** HARA Ledger mainnet **121212** (`dattabot/Blockchain@mainnet-final`, `mainnet_production/`) and testnet **121299** (`@testnet-final`, `tesnet_server/`)
**Method:** Both codebases were read in full; nothing was built or deployed. The new testnet was also probed live and benchmarked (§6). The old registry was **unreachable** on 2026-10-12: `rpc.ledger.haratrust.io` resolves to `103.169.206.239`, but TCP connections time out. So its numbers below are the recorded benchmarks, not a fresh run.

---

## 1. Verdict

- **The old registry is the better platform.** It has Vault key custody, a private WireGuard mesh, CI security gates, encrypted off-host backups with point-in-time restore (PITR) and passing drills, its own smart contracts (post-quantum anchoring and traceability), services (signer/indexer/rpc-cache/anchor-worker), SDKs in three languages, partner facades and an operations console.
- **The new mainnet is the better network.** It has 7 validators across AWS, Azure and NevaCloud (survives 2 failures, versus 1), a newer EVM (Shanghai, Besu 26.6.1), separate write/call/archive RPC pools with a dedicated archive node and Blockscout, and an API-key gateway with quotas, metering and a faucet. It is already carrying production traffic (~100–160k tx/day).
- **The new mainnet inherits serious operational gaps:**
  - Its live configuration (compose, HAProxy, Prometheus) is **not in git**, and several people edit it directly on the hosts.
  - **No database backups.**
  - **No CI.**
  - Public HAProxy ports bypass the gateway's rate limits.
  - NevaCloud hosts accept root login with a password.
  - Validator keys are kept in a text file.
  - Alerting is dormant.

**Recommendation for a migration:** keep the new network's topology and access layer. Port over the old registry's custody, backup, CI, IaC and private-network practices before anything critical depends on the new mainnet.

---

## 2. Component matrix

| Area | Old 131216 | New mainnet 121212 | Better |
|---|---|---|---|
| Consensus | QBFT, 4 validators, f=1, single provider | QBFT, **7 validators, f=2**, 3 clouds | **New** |
| Block period / timeout | 2 s / 4 s | 5 s / 10 s | Different goals: old has lower latency, new is more WAN-tolerant |
| Gas limit | ~9e15 (`0x1fffffffffffff`) | 10 G | Tie; neither is the bottleneck, block import CPU is |
| EVM | London (no PUSH0; contracts pinned to London) | **Shanghai** (PUSH0) | **New** |
| Besu | 26.4.0 | **26.6.1** (testnet runs the 26.6.0-RC1 release candidate) | New (mainnet) |
| Sync / storage | RPC nodes FULL sync; no trie-log limit | SNAP + BONSAI + trie-log limit of 512 → only a **~43-minute self-resync window**; FOREST archive | Different goals: new saves disk, old avoids the resync trap |
| Tx pool / JVM tuning | Tuned under load and recorded (layered pool, 8 s selection time, pinned heaps, Vert.x pool) | Mainnet values not in the repo; OOM loops (validator7 killed 107×); undocumented `cpus: 0.7` caused 15 s gaps | **Old** |
| Private network | **WireGuard mesh** `10.43.0.0/24` | SSH tunnels + public IPs | **Old** |
| RPC routing | HAProxy read/write split + rpc-cache | HAProxy **write/call/archive pools**, body-aware ACL, archive rate limiter | **New** |
| Edge | Caddy auto-TLS | nginx + certbot, Route53 | Tie |
| Smart contracts | **7 production contracts** (PQ anchoring, traceability, registries, governance, ERC-1155) + 57 Foundry tests + Echidna | None (QA fixtures only) | **Old** |
| Services | **signer, broadcaster, indexer, rpc-cache, anchor-worker (ML-DSA PQ)** | API gateway only | **Old** |
| API access layer | Open `/read` `/write`, no keys | **API keys (hashed), Redis rate limits + daily quota, usage metering, faucet with whitelist** | **New** |
| SDKs / partners | **TS/Py/Go SDKs**, Gapura + Aurum facades, RFC 6962 verifier | None | **Old** |
| Explorer | Blockscout 6.10 (on the services host) | **Blockscout 7.0.2 on a dedicated archive node** | **New** |
| Key custody | **Vault** (but validators use the dev root token) | Keys and seed phrases in a local text file; faucet keys in env vars | **Old** |
| Secrets in git | Only the public anvil dev key | Live-format API key + admin/Grafana logins committed | **Old** |
| Exposure (open issues) | `/write` unauthenticated; DEBUG/TRACE on public read nodes; new boxes not yet hardened | HAProxy 5797/5799 public with no key; `call` node ufw off; root+password SSH with ~22k failed logins/day | Old (neither is clean) |
| CI / supply chain | **CodeQL, gitleaks, Slither, Echidna, Trivy gate, cosign** | **None** | **Old** |
| Observability | **Prometheus, Grafana, Loki, Tempo, Alertmanager**, Strata console | Prometheus, Grafana, netstats, log-only watchdog | Old on depth; **neither** pages a human |
| Backup / DR | **age-encrypted, off-host S3, Postgres PITR (≤5 min recovery point), drills passing** | **No Postgres backup**; archive disk full in ~2 weeks with no alert | **Old** |
| IaC / reproducibility | Compose per tier, cloud-init, bring-up scripts, local simulation, runbooks; repo ≈ live | Live compose/haproxy/prometheus **not in git**; edited live | **Old** |
| Production proof | Partner integrations; stress-tested | **Real production volume**, 78-minute soak test, chaos tests | **New** |

---

## 3. Where the old registry is better (ranked)

1. **Key custody and secrets.** Vault-backed keys versus a text file, with no credentials committed to git.
2. **Backup/DR.** Encrypted off-host backups, PITR and recovery drills, versus nothing for the gateway database.
3. **CI and supply-chain security.** Six gates plus image signing, versus none.
4. **Reproducibility.** The repo matches the live system and there is a simulation environment, versus live-edited configs that are not in git.
5. **Application platform.** Contracts, PQ anchoring, signer/indexer/rpc-cache, SDKs, partner facades and the console. The new stack has none of these.
6. **Private networking.** A WireGuard mesh, versus SSH tunnels and public IPs.
7. **Documented Besu tuning.** Tuning derived from load tests, versus OOM loops and undocumented CPU caps.

## 4. Where the new ledger is better (ranked)

1. **Fault tolerance.** 7 validators (f=2) across 3 cloud providers, versus 4 validators (f=1) on one provider.
2. **Productized access layer.** API keys, quotas, metering, faucet and activity log.
3. **RPC tiering.** Write/call/archive pools and a dedicated FOREST archive node with Blockscout 7.
4. **Newer EVM and client.** Shanghai and Besu 26.6.1.
5. **Production validation.** Real traffic, a soak test and chaos tests.

---

## 5. Performance: recorded benchmarks, normalized

Raw "TPS" figures on the two sides measure **different workloads**, so they cannot be compared directly. The old "361 TPS" counts ERC-1155 **transfer events** (400 txs × 499 dependent hops), not transactions. Gas per second is the fairest common unit.

| Metric | Old 131216 (2 s blocks) | New (5 s blocks) |
|---|---|---|
| Heaviest verified run | 200×500 `executeChain`: **99,800 events, 400/400 status 1, 2.75 B gas, 276.4 s** → 361 events/s, ~1.45 tx/s, **~10 M gas/s** (limited by the script waiting for receipts after each chunk) | No dependent-transfer (`executeChain`) workload has ever been run on the new stack |
| Simple-tx inclusion rate | Never measured (old benchmarks are all traceability workloads) | cloud_1 Counter via gateway: **201.7 tx/s** (nonceGuard off), ~80 tx/s with nonceGuard; VMware lab Counter direct: **490 tx/s** |
| Realistic SDK workload | — | cloud_1 "Subject" contract (~472k gas): **8.85–10.46 tx/s** (~4.2 M gas/s) on Azure B2s |
| Burst gas in one block | **316 M gas / 47 tx in one 2 s block** (~158 M gas/s) | **346 M gas / 809 tx in one 5 s block** (~69 M gas/s), followed by an empty-block stall on 26.6.0-RC1 |
| Read latency | — | Mainnet gateway: p50 21 ms (c20, sustained) to 103 ms (soak test); testnet c200: 10,000/10,000 OK, p99 ~4.8 s |
| Mainnet production load | — | ~89–162k tx/day (≈1–1.9 tx/s average), 441k requests/day, 0 errors |
| Fault test | — | VMware lab: 1 validator down halted the chain for 8+ min; testnet: validator1 killed → ~70/450 tx failed during the ~10 s before failover |

**Takeaways:**
- Sustained gas throughput is the same order of magnitude on both sides (~4–10 M gas/s in realistic runs).
- The old chain has about **2× the burst gas per second** (2 s blocks, larger heaps).
- No benchmark has ever pushed the new **mainnet** to saturation; it runs at ≈1–2 tx/s in production.
- The two numbers most worth producing are a matched `executeChain` run on the new chain and a saturating Counter run.

## 6. Live testnet benchmark (2026-10-12)

**Live probe (read-only, public endpoint):**
- Besu `26.6.0-RC1`, chainId 121299, head block ~97,600 (consistent with the Oct 1 quarterly reset)
- Read latency from Indonesia: p50 **55 ms** (min 45 ms)
- Gas limit 10 G

**Finding: the testnet has run at half speed since the Oct 1 reset.**
- The average block interval is **10.0 s** against a designed 5 s. Proposers alternate between V2 and V3 with gaps of 15 s, 5 s, 15 s, 5 s.
- The live validator set (`qbft_getValidatorsByBlockNumber`) is `[V2, V3, 0x7ac4c91a…]`. The third address is a **phantom**: V1's old, wrongly derived address, for which no node holds a key. V1's real address `0x4bbab2e3…` is **not** a validator.
- **Cause:** the 2026-09-11 fix was applied only through live `qbft_proposeValidatorVote` calls and was never written into `genesis.json`. The quarterly reset preserves `genesis.json`, so the reset undid the fix.
- **Consequences:**
  - Every phantom turn costs a 10 s round timeout.
  - Consensus now depends on **both** V2 and V3, so there is zero crash tolerance.
  - **It will happen again at every reset (next: Jan 1)** until the genesis `extraData` is corrected.
- **Fix (operator):**
  1. Correct `extraData` in `tesnet_server/validator*/config/genesis.json`.
  2. Restore V1 live with add-then-remove votes from **V2 and V3**. V1's own vote no longer counts, and V2's RPC is disabled.

**Finding: dangerous RPC namespaces are exposed on the keyless public endpoint.**
- The gateway applies **no JSON-RPC method allowlist**.
- validator1 and validator3 enable `ADMIN`, `DEBUG`, `QBFT` and `TXPOOL` over HTTP. `qbft_*` reads were confirmed to pass through `/v1/public`.
- This most likely exposes `debug_trace*` (CPU-heavy, the same failure class as the old registry's Blockscout-trace hang), `admin_*` and `qbft_proposeValidatorVote` to anonymous callers. Write methods were not tested.
- **Fix:** add a method allowlist in the gateway (`eth_*` reads, `eth_sendRawTransaction`, `net_*`, `web3_*`) and drop `ADMIN`/`DEBUG` from the RPC-serving nodes.

**Throughput ramp (2026-10-12 11:03–11:09 UTC):**
- Keyed gateway endpoint, 25 senders.
- Workload: 50/50 mix of 0-value transfers and calls to an SSTORE counter, gasPrice 0.
- Steps: 5 → 20 → 50 tx/s, 60 s each, with automatic abort.
- Chain state: degraded (10 s cadence).

| Step | Included | Inclusion latency p50 / p95 | Read latency p50 / p95 |
|---|---|---|---|
| idle | — | — | 56 / 89 ms |
| 5 tx/s | 300 / 300 | 6 s / 15 s | 51 / 91 ms |
| 20 tx/s | 1,200 / 1,200 | 6 s / 15 s | 50 / 72 ms |
| 50 tx/s | 2,950 / 2,950 accepted (one 50-tx batch got HTTP 429) | 6 s / 14 s | 49 / 115 ms |

- **Chain during the run:**
  - Block interval averaged 10 s (5–15 s). Only V2 and V3 proposed.
  - Largest block: **751 tx / 17.9 M gas, 0.18% of the gas limit**.
- **Correctness:** counter slot 2,195 = 2,195 counter txs included. 20/20 sampled receipts `status=1`.
- **Conclusion:**
  - The testnet absorbed **≥ 49 tx/s of light transactions with 100% inclusion**. That is about 1.2 M gas/s, limited by the offered load, not by the chain.
  - Inclusion latency is set entirely by block cadence. Restoring the 5 s cadence (fixing the phantom validator) should roughly halve it.
  - Against the old registry's recorded 361 events/s (~1.45 tx/s, ~10 M gas/s on heavy 499-hop txs): the old chain proved more heavy-gas capacity and lower latency (2 s blocks). The new testnet has plenty of headroom for light traffic. A like-for-like `executeChain` run on the new chain is still needed.
- **Side finding:** zero-balance senders are accepted. Gas-free plus no balance check means free transaction spam, throttled only by a bypassable gateway limiter.

### Palm-oil parity run: the old registry's own workload on the new testnet (2026-10-12)

**Setup**
- Script: `ops/load-tests/scenario-stress-200x500.ts`, unmodified (`CHAINS HOPS` args). It ran on Node 24 with no TypeScript build step, through the keyed gateway.
- Contracts: `HaraPalmOil` + `TraceabilityBatchRelay`, compiled from `hara-ledger/contracts/src` with the repo's settings (solc 0.8.26, London, optimizer 200; OpenZeppelin 5.0.2). Deployed to 121299:
  - token `0xe5b70a3c…de98f`
  - relay `0x31c536a2…1ccd0`
  - the deployer holds `MINTER_ROLE` (verified)
- Every receipt was audited independently afterwards.

| Run | Phase C txs | Status 1 | Logs per `executeChain` | Transfers confirmed | Gas per `executeChain` | Gas per hop |
|---|---|---|---|---|---|---|
| Pilot 20×200 | 40 | 40/40 | 200 | 3,980 | 5,430,944 | 27,291 |
| **200×200** | 400 | **400/400** | 200 | **39,800** | 5,430,953 | 27,291 |
| **200×100** | 400 | **400/400** | 100 | **19,800** | 2,715,420 | 27,428 |

**Workload equivalence:** the new 200×100 averaged **1,444,591 gas/tx**; the old registry's 200×100 recorded **1,444,590**. Same bytecode, same work.

**Timing**

| | Old 131216 (2 s blocks, in-mesh client) | New testnet 121299 (10 s effective blocks, client over internet + gateway) |
|---|---|---|
| 200×100 total wall clock | **61.4 s → 322 transfers/s** | **350.8 s → 56 transfers/s** (5.7× slower) |
| 200×100 by phase | ~7 s A+B, ~54 s C (27 blocks × 2 s) | 43.9 s A + 39.6 s B, **266.6 s C** (27 blocks × ~10 s) |
| 200×200 total wall clock | not run on the old registry | **539.9 s → 74 transfers/s** (A 127.0 s, B 98.4 s, C 313.2 s) |
| 200×200 Phase C only | — | 39,800 transfers / 313 s = **127 transfers/s** |
| 200×500 total (reference) | 276.4 s → 361 transfers/s | not run |
| Blocks used by Phase C | 27 (1 chunk per block) | **27** (1 chunk per block, measured) |
| Fullest block during the run | up to 316 M gas (single-block burst test) | 44.7 M gas = **0.45% of the 10 G limit** |

**Why the new chain is 5.7× slower end to end on the same workload:**
1. **Block cadence explains most of it.** Phase C is chunk-then-wait (15 txs per chunk, wait for the receipt), so it costs exactly one block per chunk on both chains: 27 blocks either way. Old: 27 × 2 s. New: 27 × 10 s.
   - Of that 5×: **2× comes from the phantom-validator bug** (10 s instead of the designed 5 s).
   - **2.5× comes from the design choice** of 5 s blocks versus 2 s.
2. **Client path: Phase A+B takes 83 s versus ~7 s.** The script verifies 200 balances and 200 approvals with **sequential** reads. The old client sat inside the WireGuard mesh with direct RPC (~ms per read). Today's client reached the new chain over the internet through the rate-limited gateway (~50 ms+ per read, plus 429 retries), and every priming chunk waits for a 10 s block.
3. **Chain capacity is not the bottleneck.** The fullest block carried 8 × `executeChain` = 44.7 M gas, under 0.5% of the gas limit. Per block, the new testnet did exactly the work the client offered.

**Projected 200×100 end to end:**
- ~195 s (~100 transfers/s) after the testnet validator-set fix (5 s cadence).
- ~150 s (~130/s) with an in-network client.
- Roughly the old 61 s class only with **2 s blocks** (improvement plan MN-20) or a **larger Phase C chunk size**. The chain has room for many more `executeChain` per block, so offering bigger chunks would show its real ceiling. This was not run: it is a heavier load than approved for today.

**Update 2026-10-13: client-side fixes measured (chain unchanged, still 10 s).**
- Re-run of 200×100 with batched setup reads, one-shot setup sends, wallet reuse and 60-tx Phase C chunks (`FAST_SETUP=1 PHASE_C_CHUNK=60`).
- Result: **137.8 s / 144 transfers/s** (was 350.8 s / 56). Setup 16.8 s (was 83.4 s; **0.5 s** with reused wallets). Phase C 118.7 s in 7 blocks (was 266.6 s in 27).
- 400/400 `status=1`. Blocks carried 30 `executeChain` (86.7 M gas, 0.87% of the limit).
- **The gap to the old registry's 61.4 s is down from 5.7× to 2.2×.** What remains is block cadence plus empty blocks left between chunks by the client's 4 s receipt polling.
- Details: improvement plan §10.

---

## 7. Risks a migration onto the new mainnet inherits (top 5)

1. **Unreproducible live config.** Compose, HAProxy, Prometheus, tx-pool and RPC limits exist only on the hosts and are edited live. You can't audit or rebuild what you're migrating onto.
2. **No backups, no alerting.** No Postgres backup (users, API keys, usage). The archive disk fills around Oct 26 with no disk alert, and Alertmanager is dormant.
3. **Open network exposure.** Public HAProxy 5797/5799 with no key, `call` node firewall off, root+password SSH under constant brute force, and an unverified host-key change on validator3.
4. **Key custody.** Validator keys and seed phrases in a text file, faucet hot keys in env vars, and an API key plus admin logins committed to git. No secret scanning.
5. **Capacity and single points of failure.**
   - validator1 carries HAProxy, all the tunnels, monitoring and a sealer on 2 vCPU.
   - The single `call` node lags 20–65 s under `eth_estimateGas` bursts.
   - The 43-minute resync window has an untested runbook.
   - No dependent-transfer workload has ever been benchmarked.

## 8. What to port where

- **Old → new:**
  - Vault custody (with AppRoles, not the dev root token)
  - age + rclone + S3 backups with PITR and drills
  - The CI pipeline (Trivy, gitleaks, cosign, CodeQL, Slither, Echidna)
  - Compose/IaC kept in git (repo = live) plus the simulation environment
  - The WireGuard mesh
  - The documented Besu tuning (heaps, tx pool, FULL-sync RPC nodes)
  - The contracts/services/SDK layer, if the registry product moves over
- **Keep from new:**
  - The 7-validator multi-cloud set
  - The API-key gateway with quotas and metering
  - Write/call/archive tiering with the archive rate limiter
  - Shanghai EVM and Besu 26.6.x stable (not RC)

---
*Sources:*
- *Old: `hara-ledger` — `deploy/**`, `contracts/`, `services/`, `.github/workflows/`, `PRODUCTION-READINESS.md`, `doc/state/hara-registry-state-0{2b,3,4,8,9}.md`, `ops/load-tests/README.md`.*
- *New: `mainnet_production/docs/ARCHITECTURE.md`, `BACKLOG.md`, `docs/STATUS_TERDEPLOY_2026-08-20.md`, `QA/STRESS_TEST_RESULTS.md`, `gateway/`, `cloud_1/stress_test/SUMMARY.md`, `docs/12_capacity_planning.md`, `QA/reports/FINAL_QA_REPORT.md`, `QA/results/*`, `tesnet_server/docs/CHANGELOG.md`, `tesnet_server/validator*/config/*`.*
