# HARA Ledger (new) — Prioritized Improvement Plan

**Scope:** the **new** HARA Ledger: mainnet **121212** (`dattabot/Blockchain@mainnet-final`, `mainnet_production/`) and testnet **121299** (`@testnet-final`, `tesnet_server/`).
**Date:** 2026-10-12
**Inputs:**
- Full read of both branches (configs, gateway source, BACKLOG, STATUS, QA records).
- Live read-only probe of the testnet, plus today's throughput ramp (§10).
- The 2026-10-12 old-vs-new comparison (`registry-comparison-2026-10-12.md`).

**Ground rules for every item below**
- **Chain writes are operator-signed.** Validator votes, contract calls and key operations are run by an operator holding the keys. Nothing here assumes automation holds them.
- **Config first.** Every config change lands in git first (see MN-11), then reaches hosts. No more live-only edits.
- **Testnet before mainnet.** Where possible, rehearse a change on testnet before applying it to mainnet.
- **Placeholders.** Host-specific values appear as `<VAR>`. IPs are the ones recorded in `mainnet_production/docs/ARCHITECTURE.md` and must be re-verified before use.

---

## 1. Priority at a glance

**Scoring**
- **Importance:** 5 = active risk of outage, data loss or compromise; 1 = nice-to-have.
- **Speed impact:** measured or estimated effect on throughput, latency, block cadence or read freshness.
- **Effort:** S < 1 day; M = 1–3 days; L = 1–2 weeks.
- Priority is set by importance first, then speed impact, then effort.

| # | ID | Item | Env | Importance | Speed impact | Effort | Priority |
|---|---|---|---|---|---|---|---|
| 1 | MN-01 | Archive disk fills **~Oct 24–26**: expand now + alert | MN | 5 | High: prevents loss of archive/trace/explorer | S | **P0** |
| 2 | ALL-02 | JSON-RPC lockdown: method allowlist, batch-aware rate limiting, drop ADMIN/DEBUG/QBFT on RPC nodes | MN+TN | 5 | Med–High: removes the trace-DoS path that hangs RPC nodes | S–M | **P0** |
| 3 | MN-03 | Close public HAProxy 5797–5800 (bypasses the gateway) + `call` node firewall | MN | 5 | Med: stops unmetered load on write/call pools | S | **P0** |
| 4 | MN-04 | SSH hardening on NevaCloud hosts + verify validator3 host-key change | MN | 5 | — | S | **P0** |
| 5 | TN-05 | Restore testnet validator set + fix genesis | TN | 4 | **High: 10 s → 5 s blocks (2× capacity)**, restores 1-crash tolerance | S | **P0** |
| 6 | ALL-06 | Rotate and purge credentials committed to git | MN+TN | 5 | — | S–M | **P0** |
| 7 | MN-07 | Automated, encrypted, off-host Postgres backups + restore drill | MN+TN | 5 | — | M | **P1** |
| 8 | MN-08 | Wire Alertmanager to humans; convert log-only watchdogs to alerts | MN+TN | 4 | Indirect: shorter MTTR (today's testnet degradation went unnoticed for 11 days) | M | **P1** |
| 9 | MN-09 | Remove CPU throttling; right-size validator memory | MN | 4 | **High: eliminates 15 s block gaps and OOM-restart round timeouts** | S | **P1** |
| 10 | MN-10 | Fix `call` read-pool saturation (head lag 20–65 s) | MN | 4 | **High: read freshness from 20–65 s to <1 block** | M | **P1** |
| 11 | MN-11 | Config-as-code: pull live compose/HAProxy/Prometheus into git + drift check | MN+TN | 4 | — | M | **P1** |
| 12 | TN-12 | Testnet Besu `26.6.0-RC1` → `26.6.1` stable | TN | 3 | Med: removes known RC empty-block stall | S | **P1** |
| 12b | ALL-21 | Spam resistance on a gas-free chain (zero-balance senders accepted, confirmed by benchmark) | MN+TN | 4 | High under attack: blocks/pool fill for free | M | **P1** |
| 13 | MN-13 | Remove validator1 as a single point of failure (HAProxy, tunnels and monitoring all on one 2-vCPU sealer) | MN | 4 | Med: less CPU contention on a sealer and the LB | M–L | **P2** |
| 14 | MN-14 | Validator keys and faucet hot keys into Vault (or sops+age) | MN | 4 | — | M–L | **P2** |
| 15 | MN-15 | Resync safety: widen the 43-minute SNAP window + drill the runbook | MN | 4 | — (availability) | M | **P2** |
| 16 | MN-16 | WireGuard mesh in place of SSH tunnels / public P2P | MN | 3 | Low–Med: fewer hops, no tunnel CPU | L | **P2** |
| 17 | ALL-17 | CI on Azure DevOps: gitleaks, Trivy, gateway build/tests, shellcheck | MN+TN | 3 | — | M | **P2** |
| 18 | MN-18 | gasPriceGuard fail-closed + gateway unit tests | MN+TN | 3 | — | S–M | **P2** |
| 19 | ALL-19 | Benchmark program: saturating Counter + `executeChain` parity run + nightly smoke | TN→MN | 3 | Enabler: measures every speed item | M | **P3** |
| 20 | MN-20 | Shorten block period (5 s → 3 s or 2 s) via QBFT transition | MN | 2–3 | **High: ~40–60% lower time-to-inclusion, 1.7–2.5× burst capacity** — high risk | M | **P3** |

**Suggested 30-day sequence**
- **Week 1:** all P0 items. MN-01 and MN-03 can be done today.
- **Week 2:** MN-07, MN-08, MN-09, TN-12, ALL-21.
- **Week 3:** MN-10, MN-11.
- **Week 4:** start the P2 items; run ALL-19 on the fixed testnet to set a baseline before considering MN-20.

---

## 2. P0: do this week

### MN-01 — Archive disk will fill around Oct 24–26
**Evidence:**
- Archive and Blockscout host `52.220.9.100` (AWS, FOREST+FULL, no pruning) is at ~105 of 193 GiB (54%).
- It grows ~6.5–7.8 GB/day (~45 KB per tx including Blockscout).
- That leaves ~88 GiB, roughly 12 days.
- There is no disk alert, because Alertmanager is dormant. (`mainnet_production/BACKLOG.md`)

**Speed impact:** when the disk fills, Besu and Blockscout stop writing. Every `debug_*`/`trace_*` call, historical query and explorer page then fails.

**Action plan:**
1. Expand the volume now, online.
2. Add a disk alert (also part of MN-08).
3. Plan capacity for the next 6 months.

**Implementation steps:**
1. Snapshot first (rollback point):
   `aws ec2 create-snapshot --volume-id <VOL> --description "archive pre-resize 2026-10"`
2. Resize online. 600 GiB gives about 70 days of headroom at the current rate:
   `aws ec2 modify-volume --volume-id <VOL> --size 600`
   Wait until `aws ec2 describe-volumes-modifications --volume-id <VOL>` shows `optimizing` or `completed`.
3. On the host:
   - `lsblk`, then `sudo growpart /dev/<disk> <partnum>`.
   - Then `sudo resize2fs /dev/<part>` for ext4, or `sudo xfs_growfs <mountpoint>` for xfs.
   - `df -h` to confirm.
4. Temporary guard until MN-08 lands: a cron job on the archive host that logs a warning and posts to your chat webhook when `df --output=pcent <mount>` exceeds 80%.
5. Capacity plan:
   - Record daily growth in Prometheus (`node_filesystem_avail_bytes`).
   - Set a resize trigger at 70%.
   - Decide whether Blockscout's DB belongs on its own volume.

**Verify:** `df -h` shows the new size; Besu and Blockscout keep importing (`eth_blockNumber` on the archive pool keeps advancing).
**Rollback:** the snapshot from step 1. A volume grow is effectively one-way, which is harmless.

---

### ALL-02 — JSON-RPC lockdown (method allowlist, batch-aware limits, API namespaces)
**Evidence:**
- **Neither gateway has a method allowlist.** `gateway/src/server.ts` goes straight from the raw body to `publicAccessGuard`, `gasPriceGuard`, `archiveRouter` and `httpProxy`.
- The limiter consumes **1 point per HTTP request** (`rateLimit/limiter.ts: consume(apiKeyId, 1)`). A JSON-RPC batch of N calls costs 1 point, so batches bypass both the rps limit and the daily quota.
- On testnet, validator1 and validator3 (the RPC-serving nodes) enable `["ETH","NET","QBFT","TXPOOL","WEB3","ADMIN","DEBUG"]` (`tesnet_server/validator{1,3}/config/config.toml`). `qbft_getValidatorsByBlockNumber` was **confirmed reachable on the keyless `/v1/public` endpoint** on 2026-10-12.
- That probably also exposes `debug_trace*`, `admin_*` and `qbft_proposeValidatorVote` to anonymous callers. Write methods were deliberately not tested.

**Speed impact:**
- `debug_trace*` replays whole blocks and can pin Besu's Vert.x worker threads until the HTTP listener stops accepting connections. This is exactly the RPC hang the old registry hit through Blockscout's trace fetcher.
- Uncounted batches let one key push unbounded load onto the `call` node, which already lags 20–65 s (MN-10).

**Action plan:**
1. Add a method allowlist and a batch cap in the gateway, applied before rate limiting, on both `/v1/public` and `/v1/:apiKey`, and on WS messages.
2. Charge rate-limit and quota points **per batch item**.
3. Reduce Besu's `rpc-http-api` on every RPC-serving node to what clients need. Keep `ADMIN`/`QBFT`/`DEBUG` only on a loopback-bound admin port.
4. Cap the Besu batch size as defence in depth.

**Implementation steps:**
1. New file `gateway/src/rpc/methodGuard.ts`:
   ```ts
   import { Request, Response, NextFunction } from 'express';

   const READ = [
     'eth_chainId', 'eth_blockNumber', 'eth_syncing', 'eth_gasPrice', 'eth_feeHistory',
     'eth_getBalance', 'eth_getCode', 'eth_getStorageAt', 'eth_getTransactionCount',
     'eth_call', 'eth_estimateGas', 'eth_getLogs',
     'eth_getBlockByNumber', 'eth_getBlockByHash',
     'eth_getBlockTransactionCountByNumber', 'eth_getBlockTransactionCountByHash',
     'eth_getTransactionByHash', 'eth_getTransactionReceipt',
     'net_version', 'net_listening', 'web3_clientVersion',
   ];
   export const PUBLIC_METHODS = new Set([...READ, 'eth_sendRawTransaction']);
   export const KEYED_METHODS = new Set([...PUBLIC_METHODS, 'debug_traceTransaction']); // routed to archive pool by archiveRouter
   export const MAX_BATCH = 50;

   export function methodGuard(allowed: Set<string>) {
     return (req: Request & { rpcItemCount?: number }, res: Response, next: NextFunction) => {
       let parsed: unknown;
       try { parsed = JSON.parse((req.body as Buffer).toString() || 'null'); }
       catch { res.status(400).json({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }); return; }
       const items = Array.isArray(parsed) ? parsed : [parsed];
       if (items.length === 0 || items.length > MAX_BATCH) {
         res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: `Batch size must be 1..${MAX_BATCH}` }, id: null });
         return;
       }
       for (const it of items as Array<{ method?: unknown; id?: unknown }>) {
         if (typeof it?.method !== 'string' || !allowed.has(it.method)) {
           res.status(403).json({ jsonrpc: '2.0', error: { code: -32601, message: `Method not allowed: ${String(it?.method)}` }, id: it?.id ?? null });
           return;
         }
       }
       req.rpcItemCount = items.length;
       next();
     };
   }
   ```
2. `rateLimit/limiter.ts`: add a `points` parameter.
   - `checkRpsLimit(id, limit, points = 1)` → `limiter.consume(id, points)`.
   - `checkDailyQuota(id, quota, points = 1)` → `redis.incrby(key, points)`.
3. `server.ts`: put the guard first on each route and pass the item count to the limiters.
   - Public route: `express.raw` → `methodGuard(PUBLIC_METHODS)` → `publicAccessGuard` (passing `req.rpcItemCount`) → `gasPriceGuard` → `archiveRouter` → `httpProxy`.
   - Keyed route: `express.raw` → `apiKeyAuth` → `methodGuard(KEYED_METHODS)` → limiter with `req.rpcItemCount` → … unchanged.
   - Also: `gasPriceGuard` must inspect **every** batch item, not only single requests (see MN-18).
4. `proxy/wsProxy.ts`: apply the same check per incoming WS message.
   - Allow `eth_subscribe`/`eth_unsubscribe` with `newHeads` and `logs` only.
   - Close the socket after N rejected messages.
5. Besu, on every RPC-serving node (MN: rpc1, call, archive; TN: validator1, validator3):
   - `rpc-http-api=["ETH","NET","WEB3"]`, plus `"DEBUG","TRACE"` on the **archive** node only. Archive is reached via the gateway's archive pool and the 10 rps nginx limiter.
   - `rpc-http-max-batch-size=50`.
   - Keep the default `rpc-max-logs-range` (5000) or lower it.
   - If operators need `ADMIN`/`QBFT`, run a second listener bound to `127.0.0.1`, or reach them over SSH. Never on the proxied port.
6. Release: deploy to testnet, confirm the "Verify" checks, then mainnet in a low-traffic window. `docker compose up -d --build gateway`, then a rolling restart of the Besu RPC nodes, one at a time.

**Verify:**
- `qbft_getValidatorsByBlockNumber`, `admin_nodeInfo` and `debug_traceBlockByNumber` on `/v1/public` → `-32601 Method not allowed`.
- A batch of 51 calls → `-32600`.
- A batch of 50 consumes 50 points (check the Redis key `quota:<id>:<date>`).
- Ordinary dApp traffic is unaffected: compare 24 h of gateway 4xx rates before and after.

**Rollback:** revert the gateway image tag and restore the previous `rpc-http-api` line. Both are config-only changes.

---

### MN-03 — Close the public HAProxy bypass and the `call` node exposure
**Evidence (BACKLOG, 2026-10-09, unremediated):**
- HAProxy frontends 5797 (write) and 5799 (call) on validator1 `52.77.106.39` are reachable from the internet **with no API key**, so they bypass the gateway's auth, rate limits and metering.
- On `call` (`202.155.19.177`), ufw is off and ports 9547 and 7798 are internet-reachable.

**Speed impact:** unmetered clients can saturate the write and call pools directly. That pool is the one already lagging 20–65 s (MN-10).

**Action plan:** only the gateway host (`103.143.12.68`) and the operators' bastion may reach 5797–5800. Enforce this at the cloud firewall, because Docker-published ports **ignore ufw**.

**Implementation steps:**
1. Inventory what's listening:
   - On validator1: `sudo ss -ltnp | grep -E ':(579[7-9]|5800)'`.
   - From outside: `nmap -Pn -p 5797-5800,8404,9547,7798 52.77.106.39 202.155.19.177`.
2. **AWS Security Group** on validator1 (primary control):
   - Remove `0.0.0.0/0` on 5797–5800 and 8404.
   - Add `103.143.12.68/32` and `<BASTION_IP>/32`.
3. Host layer (defence in depth). A Docker-published port skips ufw (the same issue the testnet hit with netstats), so use the `DOCKER-USER` chain:
   ```bash
   sudo iptables -I DOCKER-USER -p tcp -m multiport --dports 5797:5800,8404 -j DROP
   sudo iptables -I DOCKER-USER -p tcp -s 103.143.12.68 -m multiport --dports 5797:5800 -j ACCEPT
   sudo iptables -I DOCKER-USER -p tcp -s <BASTION_IP> -m multiport --dports 5797:5800,8404 -j ACCEPT
   ```
   Make the rules persistent with a systemd unit that re-applies them after `dockerd` restarts (the testnet's `netstats-firewall-restrict.service` is a working template).
4. `call` host (NevaCloud):
   - `sudo ufw default deny incoming`
   - `sudo ufw allow 22/tcp`
   - Allow the P2P port from the validator IPs only.
   - Allow the RPC port from validator1's tunnel source only.
   - `sudo ufw enable`
   - If 9547 and 7798 are Docker-published, add the equivalent `DOCKER-USER` rules.
   - If they are only metrics, scrape them over the tunnel or mesh instead (MN-16).
5. Update any client that was using `:5797` directly to `https://rpc.registry.haratoken.app/v1/<key>` **before** closing. Check the HAProxy logs for source IPs first.

**Verify:** the external `nmap` shows the ports filtered; the gateway path still serves; HAProxy stats show traffic only from the gateway IP.
**Rollback:** re-add the SG rule and flush the `DOCKER-USER` additions (`iptables -D …`).

---

### MN-04 — SSH hardening on NevaCloud hosts + validator3 host-key verification
**Evidence (BACKLOG, 2026-10-09):**
- NevaCloud hosts (validator3/4/5, `call`, proxy `103.143.12.68`) have `PermitRootLogin yes` and password auth.
- ~22k failed logins per day; no fail2ban.
- validator3's **SSH host key changed** and was never verified.

**Action plan:**
1. Treat the validator3 host-key change as a possible-compromise signal until it's explained.
2. Move every host to key-only, non-root access, with named operator accounts and fail2ban.

**Implementation steps:**
1. **validator3 first:**
   - Get the expected fingerprint from the NevaCloud **web console**, not over SSH: `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub`.
   - Compare it with what your client sees: `ssh-keyscan -t ed25519 116.212.73.232 | ssh-keygen -lf -`.
   - If they differ, or the host was reinstalled without a record, review it:
     - `last -a`, `journalctl -u ssh --since -30d`
     - `/root/.ssh/authorized_keys`, `/etc/passwd`
     - `crontab -l` and `/etc/cron*`
     - `docker ps -a`
     - Check whether the validator key file was read recently.
     - Then rotate that validator's node key using the add-before-remove vote procedure (as in TN-05).
2. Onboard named operators with the old registry's kit, which is already written and tested: `hara-ledger/deploy/ops/add-operator.sh` (creates a sudo user with your public key).
3. Confirm you can log in **as the operator** in a second session. Only then edit `/etc/ssh/sshd_config.d/10-hardening.conf`:
   ```
   PermitRootLogin no
   PasswordAuthentication no
   KbdInteractiveAuthentication no
   MaxAuthTries 3
   ```
   Then `sudo sshd -t && sudo systemctl reload ssh`.
4. `sudo apt-get install -y fail2ban`, then add `/etc/fail2ban/jail.d/sshd.local`:
   ```
   [sshd]
   enabled = true
   maxretry = 5
   bantime = 1h
   ```
5. Change the root password everywhere it was shared, including the one committed in `cloud_2/ARSITEKTUR.md` (see ALL-06).

**Verify:**
- `ssh root@host` is denied.
- Password auth is refused: `ssh -o PubkeyAuthentication=no …`.
- `fail2ban-client status sshd` shows bans accumulating.

**Rollback:** the NevaCloud console gives out-of-band access. Keep the console open during the change.

---

### TN-05 — Restore the testnet validator set and fix genesis (2× block rate)
**Evidence (live, 2026-10-12):**
- Average block time is **10.0 s** against the 5 s design. Proposers alternate V2 (`0x31ad…`) and V3 (`0x385c…`) with gaps of 15 s, 5 s, 15 s, 5 s.
- The live `qbft_getValidatorsByBlockNumber` returns `[V2, V3, 0x7ac4c91a…]`. `0x7ac4c91a` is V1's old, wrongly derived address; no node holds its key.
- V1's real address `0x4bbab2e3…` is **not** a validator.
- The 2026-09-11 fix (`tesnet_server/docs/CHANGELOG.md` ~L157–202) was applied only through live votes. The Oct 1 quarterly reset, which keeps `config/genesis.json`, reverted it.

**Speed impact:**
- Block cadence goes from 10 s back to 5 s: **2× block capacity** and ~2× lower time-to-inclusion.
- Consensus regains crash tolerance. Today both V2 and V3 must be up.
- **It will regress again at the Jan 1 reset** unless genesis is fixed.

**Correction (2026-10-13, from live data):**
- The chain has produced blocks for 13 days with only V2 and V3 signing. So the 3-validator quorum is **2**: Besu uses `ceil(2N/3)`. The testnet docs' "quorum 3-of-3, 0% fault tolerance" is wrong.
- That makes **remove-before-add** the safer order here. The phantom contributes nothing, so removing it first never raises the number of nodes that must be up. Adding V1 first passes through a 4-validator set that needs all of V1, V2 and V3 online.

**Prerequisite (security gate):** apply ALL-02's lockdown first. At minimum, block `qbft_*`, `admin_*` and `debug_*` in the gateway, or drop `QBFT`/`ADMIN`/`DEBUG` from V1's and V3's `rpc-http-api`.
- V1 is the public RPC backend and V3 is the failover. Once V1 is a validator, anonymous callers could cast its votes.
- Forcing a failover to V3 (e.g. by flooding `debug_trace*`) would give them V3's vote too: 2 of 3 is a majority.

**Action plan:**
1. Fix the live set now, without a reset, using votes: **remove the phantom, then add V1.**
2. Stage a corrected genesis that the next reset will use.
3. Make the reset script refuse to run if genesis and the intended validator set disagree.

**Implementation steps:**
1. **Prepare V2's RPC.** V2 runs with RPC disabled. On Host A:
   - In `validator2/config/config.toml` set `rpc-http-enabled=true`, `rpc-http-host="127.0.0.1"`, `rpc-http-port=5799`, `rpc-http-api=["ETH","QBFT"]`. Loopback only.
   - Restart V2.
   - **The chain pauses for the restart**, because V2 and V3 are both required right now. On testnet that is acceptable.
2. **Phase 1, remove the phantom.** A change needs votes from more than 50% of the current 3 validators, so 2 votes. On V2 (`127.0.0.1:5799`) and V3 (`127.0.0.1:5797` on Host B):
   ```bash
   curl -s -X POST -H 'content-type: application/json' --data \
     '{"jsonrpc":"2.0","id":1,"method":"qbft_proposeValidatorVote","params":["0x7ac4c91aa6461f0382213a8f1b0f5bc98cf20437",false]}' \
     http://127.0.0.1:<PORT>
   ```
   - Wait until `qbft_getValidatorsByBlockNumber latest` returns `[V2, V3]`.
   - Quorum stays 2 (V2 + V3), exactly today's dependency.
   - **Blocks should return to a steady 5 s immediately**, because there are no more phantom proposer turns.
3. **Phase 2, add V1.** With 2 validators you need 2 votes (V2 + V3):
   `qbft_proposeValidatorVote ["0x4bbab2e3cf13b02d481670aadc761945b442ffec", true]`
   - Wait until the set is `[V1, V2, V3]`; quorum stays 2, so 1 crash is tolerated.
   - If V1 then fails to sign, the chain keeps running on V2 + V3. Vote V1 out again and investigate.
4. On each node, `qbft_getPendingVotes`, then `qbft_discardValidatorVote <addr>` for anything left over.
5. Revert V2's RPC to disabled, or leave it loopback-only, and restart it once more.
6. **Stage the corrected genesis. Do not edit the live `genesis.json`:** Besu refuses to start an existing database against a different genesis.
   ```bash
   echo '["0x4bbab2e3cf13b02d481670aadc761945b442ffec","0x31ad5f8743e603bbdc1460f934d257b594057fc4","0x385c97cfe3a88b6b2f643bc865a07142d0c5efdd"]' > toEncode.json
   docker run --rm -v "$PWD":/w hyperledger/besu:26.6.1 rlp encode --from=/w/toEncode.json --type=QBFT_EXTRA_DATA
   ```
   Put the output into `config/genesis.next.json` as `extraData` on Host A and Host B, and commit it in the repo.
7. **Harden `cleanup_quarterly_reset.sh` (and `validator3_reset_remote.sh`):**
   - After the wipe and before start, if `genesis.next.json` exists, move it into place.
   - Add a pre-flight that decodes the genesis `extraData` validator list, compares it with an `INTENDED_VALIDATORS` list kept in git, and **aborts on mismatch**.
   - After start, check `qbft_getValidatorsByBlockNumber` and alert if it doesn't match.
8. Fix `hara-block-health-watch.sh`:
   - Also compare the live `qbft_getValidatorsByBlockNumber` result with `INTENDED_VALIDATORS`.
   - Push its warnings to alerting (MN-08). Today it is log-only, which is why this went unnoticed for 11 days.

**Verify:**
- Over 100 blocks, the average interval is about 5 s and all 3 validators appear as `miner`.
- The probe script shows `avgBlockTimeS_100 ≈ 5`.
- Run the TN-05 checklist again right after the Jan 1 reset.

**Rollback:** cast the reverse votes. Staging `genesis.next.json` changes nothing until the next reset.

---

### ALL-06 — Rotate and purge credentials committed to git
**Evidence (presence only, values not reproduced):**
- A live-format `hara_live_` API key in `QA/scripts/infra_stress.mjs`, `cloud_1/scripts/diagnose.sh` and `cloud_1/stress_test/ts/fix_nonce_gap.ts`.
- Dashboard admin and Grafana logins in `shared_doc_tesnet_and_prod/PROD_ACCESS_AND_GUIDE.md` and `TESNET_ACCESS_AND_GUIDE.md`.
- A root SSH password and `HX_NODE_PRIVKEY` in `cloud_2/ARSITEKTUR.md`.
- Validator private keys and a VM password in `docs/08_reference.md` and `deploy.sh` (the 1212 lab).
- Password patterns in Grafana and Blockscout provisioning files.

**Action plan:** **rotate first, then remove.** Deleting a file doesn't revoke a credential that is in git history and in every clone.

**Implementation steps:**
1. Rotate:
   - Revoke the API key(s) in the dashboard and issue new ones to their owners.
   - Change the dashboard admin and Grafana passwords.
   - Change the root passwords (also covered by MN-04).
   - Rotate `HX_NODE_PRIVKEY` (hara-exchange).
   - For the 1212 lab keys: retire the environment if it's not needed. If it is, generate new validator keys and redeploy.
2. Replace values in files with references, e.g. `HARA_API_KEY=${HARA_API_KEY:?set in env}`. Keep secrets only in the store chosen in MN-14.
3. Scan the full history:
   `docker run --rm -v "$PWD":/repo ghcr.io/gitleaks/gitleaks:v8.21.2 git /repo --redact`
   Fix every finding or record why it's a false positive in `.gitleaks.toml`.
4. Optional history rewrite with `git filter-repo`. Rotation is what makes you safe; a rewrite only reduces exposure, and it needs every collaborator to re-clone. Coordinate it in Azure DevOps.
5. Add gitleaks to CI (ALL-17) and as a pre-commit hook.

**Verify:** old credentials fail (old API key → 401; old passwords rejected); gitleaks reports 0 findings on `HEAD`.

---

## 3. P1: next two weeks

### MN-07 — Automated, encrypted, off-host Postgres backups
**Evidence:**
- BACKLOG: no automated Postgres backup on mainnet. That database holds users, API keys, usage and the faucet whitelist.
- The old gateway host was decommissioned with `down -v`.
- Testnet has the same gap.

**Action plan:** port the old registry's backup system (`hara-ledger/deploy/ops/`), which is proven and has passing drills:
- nightly logical dump, age-encrypted, uploaded to object storage
- weekly restore drill
- optional WAL archiving later

**Implementation steps:**
1. Create a backup age keypair on the operator workstation: `deploy/ops/backup-setup.sh`. **The private key stays off the servers.** Store it in the password manager.
2. Create an object-storage bucket with **write-only** credentials for the host and **read** credentials for operators. The old registry hit `GetObject 403` because only write credentials existed, so test reads up front.
3. On the gateway host `103.143.12.68`, a script `/opt/hara-backup/pg-backup.sh`:
   ```bash
   #!/usr/bin/env bash
   set -euo pipefail
   TS=$(date -u +%Y%m%dT%H%M%SZ)
   docker exec <pg_container> pg_dump -U <user> -Fc <db> \
     | age -r "${BACKUP_AGE_RECIPIENT:?}" > /var/backups/hara/pg-$TS.dump.age
   rclone copy /var/backups/hara/pg-$TS.dump.age "${RCLONE_TARGET:?}/postgres/"
   find /var/backups/hara -name 'pg-*.dump.age' -mtime +3 -delete
   ```
   Schedule it with a systemd timer (`OnCalendar=*-*-* 02:00:00 UTC`, `Persistent=true`). `install-backup-timers.sh` is the template.
4. Weekly restore drill, adapted from `snapshot-restore-drill.sh`:
   - Fetch the latest object.
   - `age -d`.
   - `pg_restore` into a throwaway `postgres:16` container.
   - Assert row counts for `api_keys` and `users` are greater than 0.
   - Write the result JSON and alert on failure (MN-08).
5. Optional: point-in-time recovery with `archive_mode=on`, `archive_command` shipping WAL, and a nightly `pg_basebackup` (`snapshot-postgres-wal.sh` and `-basebackup.sh`). Do this only if losing up to 24 h of usage data is unacceptable.
6. Repeat on the testnet Host B (`103.169.206.10`). Without it, the quarterly reset keeps the gateway database but nothing protects it.

**Verify:** an object appears in the bucket nightly; the drill passes; `rclone cat` of the latest object works with the operator's read credentials.

---

### MN-08 — Alerting that reaches a human
**Evidence:**
- Alertmanager is **dormant** on mainnet.
- The OOM loops (validator7 was OOM-killed 107×) were found by manually checking `RestartCount`.
- The testnet watchdogs (`hara-block-health-watch`, `hara-mem-watch`) are **log-only**.
- Today's testnet degradation (10 s blocks since Oct 1) went unnoticed for 11 days.

**Speed impact:** indirect but large. Every speed regression in this plan (CPU throttling, the `call` lag, the missing validator) persisted because nothing alerted.

**Implementation steps:**
1. Alertmanager receiver. Telegram or Slack are both built in; use what the team reads:
   ```yaml
   route: { receiver: ops, group_by: [alertname, instance], repeat_interval: 4h }
   receivers:
     - name: ops
       telegram_configs:
         - bot_token_file: /etc/alertmanager/tg_token
           chat_id: <CHAT_ID>
           parse_mode: HTML
   ```
2. Prometheus rules. Metric names are Besu's and node_exporter's; check them against `/metrics`.
   ```yaml
   groups:
   - name: hara-ledger
     rules:
     - alert: ChainStalled
       expr: increase(ethereum_blockchain_height{job="besu-mainnet"}[1m]) == 0
       for: 1m
     - alert: NodeBehindHead
       expr: max(ethereum_blockchain_height) - ethereum_blockchain_height > 6
       for: 2m
     - alert: LowPeers
       expr: ethereum_peer_count < 3
       for: 5m
     - alert: DiskFilling
       expr: node_filesystem_avail_bytes{fstype!~"tmpfs|overlay"} / node_filesystem_size_bytes < 0.20
       for: 10m
     - alert: OOMKill
       expr: increase(node_vmstat_oom_kill[10m]) > 0
     - alert: TargetDown
       expr: up == 0
       for: 2m
   ```
3. Turn the watchdog logs into metrics. Make `hara-block-health-watch.sh` write node_exporter textfile metrics instead of only log lines:
   - `hara_validator_missing_proposals{addr=…} 1`
   - `hara_avg_block_time_seconds`
   - `hara_validator_set_mismatch` (from the TN-05 check)

   Then alert on them. On testnet, run a small Prometheus+Alertmanager pair, or scrape the testnet from the mainnet Prometheus.
4. Add a gateway 5xx rate alert (from the activity log or an exported counter) and a TLS certificate expiry alert (blackbox_exporter).

**Verify:** fire a test alert (`amtool alert add test`); stop a non-validator container on testnet and confirm the page arrives within about 2 minutes.

---

### MN-09 — Remove CPU throttling and right-size validator memory
**Evidence:**
- The tip commit `e260bf0` traced 15 s block gaps to `cpus: 0.7` on validator2 (now fixed, raised to 1.8) and **validator6 (still 0.7)**. The proof: cgroup throttling and PSI ~0.9 while the hosts were only ~40% busy.
- Separately, 4 validators were OOM-looping until 2026-10-09 (validator7 107 kills). Besu with `-Xmx1152m` reaches **2.3–2.7 GB RSS**.

**Speed impact:**
- Each throttled proposal turn can cost a QBFT round timeout. A 15 s gap is 3 lost periods.
- Each OOM restart removes a validator. With f=2 that's survivable, but it slows rounds and shrinks the margin.
- Expect evenly spaced 5 s blocks and higher sustained throughput under load.

**Implementation steps:**
1. Audit all 7 validators and rpc1/call/archive. For each host:
   ```bash
   docker inspect -f '{{.Name}} cpus={{.HostConfig.NanoCpus}} mem={{.HostConfig.Memory}}' $(docker ps -q)
   CID=$(docker inspect -f '{{.Id}}' <container>)
   cat /sys/fs/cgroup/system.slice/docker-$CID.scope/cpu.stat   # nr_throttled / throttled_usec
   ```
2. Set the policy:
   - Validators get **no CPU cap**, or a cap of at least the host vCPU count minus 0.2.
   - `mem_limit` = observed peak RSS + 30%.
   - `-Xmx` at about 35–40% of `mem_limit`. Besu's off-heap usage (RocksDB, jemalloc) is large.
   - Keep jemalloc on (Besu's launcher sets it; make sure `BESU_OPTS` doesn't override `LD_PRELOAD`).
3. validator6 (corp1 `47.131.59.107`): raise `cpus` from 0.7 to host vCPU − 0.2 after the validator2 24 h observation passes. RAM is tight (3.8 GB), so either size `mem_limit` ≈ 3.2 GB / `-Xmx1152m`, or upgrade the instance.
4. Record the final values in git (MN-11). Apply with `docker compose up -d --force-recreate <svc>`, **one validator at a time**, waiting for it to propose again before moving on.

**Verify:**
- `nr_throttled` stays flat over 24 h.
- No OOM kills (`dmesg -T | grep -i oom`).
- 3-day block-interval histogram: more than 99.9% at exactly 5 s. The baseline was 54,890 of 55,001.

---

### MN-10 — Fix `call` read-pool saturation (head lag 20–65 s)
**Evidence:**
- The single `call` node (`202.155.19.177`, NevaCloud, FULL sync) hits ~285% of its 2.75-core limit during `eth_estimateGas`/`eth_call` bursts from the main consumer.
- It lags the head by 20–65 s.
- Lifecycle methods were already re-routed to rpc1 (`archiveRouter.ts`, HAProxy body ACL).

**Speed impact:** read freshness goes from 20–65 s stale to under 1 block. This is the most visible latency issue for dApps: they see stale balances and nonces and get "transaction not found".

**Action plan:**
- Scale out the read pool.
- Separate `eth_estimateGas` from general reads.
- Reduce the load at its source.

**Implementation steps:**
1. **Add a second read node, `call2`.**
   - New host: 4 vCPU / 8 GB, a different provider from `call`.
   - Bootstrap from a snapshot of `call`'s data directory, or FULL-sync from the static peers.
   - Same Besu config as `call` (in git per MN-11).
2. HAProxy `call_backend`:
   - `balance leastconn`
   - add `server call2 <tunnel/mesh>:<port> check`
   - keep the `/liveness` health check
   - add a lag-aware check, e.g. a small sidecar returning 503 when the node is more than 3 blocks behind the max.
3. **Estimate pool.** In `archiveRouter.ts`:
   - Classify `eth_estimateGas` as `estimate` and route it to a dedicated backend (initially `call2`).
   - Add an in-gateway cache: key = hash of `{to, data, from, value}`, TTL = 1 block, served from Redis.
   - The consumer repeats identical estimates heavily (BACKLOG), so expect a high hit rate.
4. **Consumer side.** Implement `PLAN_dynamic_gas_limit.md` (in the external consumer repo): use a fixed or learned gas limit per contract method instead of calling `estimateGas` on every tx.
5. Bump `call`'s resources only as a stopgap. Its cpus already went 0.35 → 2.0 → 2.75; capping it again would just move the bottleneck.

**Verify:**
- `NodeBehindHead` (MN-08) stays clear for 7 days.
- A gateway read p95 for `eth_call` under 200 ms (the soak test p50 was 103 ms).
- Estimate cache hit rate above 50%.

---

### MN-11 — Config-as-code: get the live mainnet config into git
**Evidence:**
- The mainnet repo holds only `genesis.json` and `static-nodes.json`.
- The live `/opt/hara-mainnet/docker-compose.yml`, `haproxy.cfg`, `prometheus.yml`, tx-pool and RPC limits are **not in git**. Several people edit them live (`haproxy.cfg` with no backup; `cpus: 0.7` undocumented; `call` FULL-sync "since unknown"; services marked retired by another operator).
- The testnet docs admit the repo configs no longer match live.

**Action plan:**
- Snapshot the live config into git.
- Separate secrets from config.
- Detect drift automatically.
- Allow changes only through PRs.

This also feeds the NevaCloud recovery kit.

**Implementation steps:**
1. Collect from each host, read-only:
   ```bash
   for h in <host list>; do
     ssh $h 'sudo tar -C /opt -czf - hara-mainnet --exclude="*/data/*" --exclude="*.key" --exclude=".env"' \
       > live-$h.tgz
   done
   ```
   Extract into `mainnet_production/live/<host>/`.
2. Move every secret out of what was collected:
   - `.env` files become `.env.example`, with values replaced by `CHANGE-ME` and an MN-14 reference.
   - Run gitleaks on the tree before committing.
3. Add a drift check, `scripts/drift-check.sh <host>`: `diff -r` of git against live, via `ssh … tar` of the same paths.
   - Run it nightly from the monitoring host.
   - Alert on any diff (MN-08).
4. Process:
   - All changes go through PRs in `dattabot/Blockchain`.
   - Apply with a single script, `apply.sh <host>`, that rsyncs from git and runs `docker compose up -d`.
   - Write this in the README.

**Verify:** the drift check is clean on all hosts for 7 days; one change goes end-to-end via PR → apply → drift-check clean.

---

### TN-12 — Testnet Besu `26.6.0-RC1` → `26.6.1` stable
**Evidence:**
- The testnet runs the **26.6.0-RC1** release candidate.
- The same RC stalled into empty blocks after a 1,170-tx burst on cloud_1 (`cloud_1/stress_test/SUMMARY.md` §4–5).
- Mainnet runs 26.6.1.

**Speed impact:** removes a known stall mode under burst load, and makes testnet results representative of mainnet.

**Implementation steps:**
1. Pin `image: hyperledger/besu:26.6.1` in each validator's compose/`.env` on Host A and Host B. Commit it in git.
2. Roll one validator at a time. **Do this after TN-05**, when the chain tolerates one validator down: `docker compose pull && docker compose up -d`, then wait for the node to propose again.
3. Re-run the benchmark (ALL-19) and compare.

**Verify:** `web3_clientVersion` reports `besu/v26.6.1` on all nodes; 5 s cadence holds.

---

## 4. P2: within a month

### MN-13 — Remove validator1 as a single point of failure
**Evidence:** validator1 (`52.77.106.39`, 2 vCPU / 7.6 GB) runs a **sealer**, HAProxy (all four frontends), every SSH tunnel to rpc1/call/archive, Prometheus, Grafana and netstats.

**Speed impact:**
- Block production on validator1 competes with LB and monitoring CPU.
- LB latency rises whenever the validator is importing.
- One host failure takes out both routing and monitoring.

**Implementation steps:**
1. Provision `lb1` (2–4 vCPU, a different provider). Move HAProxy and the tunnels or mesh (MN-16) there. Copy `haproxy.cfg` from git (MN-11).
2. Point the gateway's `haproxyHost` (`gateway/src/config.ts`) to `lb1`. Keep validator1 as a temporary backup target.
3. Move Prometheus and Grafana to a `mon1` host, or onto `lb1` if small. Keep 30 days of retention.
4. Optional HA: a second LB with keepalived, or two A records with health-checked failover in Route53.
5. Remove HAProxy and monitoring from validator1 and give its CPU back to Besu.

**Verify:** validator1's CPU and PSI drop; block cadence is unchanged; gateway latency is unchanged or better; stopping `lb1` fails over (if HA is configured).

---

### MN-14 — Key custody: validator keys and faucet hot keys
**Evidence:**
- Validator node keys and seed phrases are kept in a local text file (`mainnet_production/access/credentials_private_key.txt`, gitignored).
- The faucet signer keys are plain env vars.

**Implementation steps:**
1. **Minimum (this month):**
   - Encrypt the credentials file with `sops` + age (or `age` alone).
   - Keep the age key in the password manager.
   - Keep 2 offline copies in different places.
   - Delete the plaintext file.
2. **Target:** HashiCorp Vault in Raft mode on a non-validator host. The old registry's scripts are reusable as-is: `vault-raft-init.sh`, `vault-approle-bootstrap.sh`, `vault-raft-snapshot.sh`.
   - Validators fetch their key at start with an **AppRole**, not the root token. Do not repeat the old registry's dev-root-token shortcut. The old pattern is `start-validator.sh`.
   - Faucet signers read from Vault at start, or move to a Vault Transit signer.
3. Back up Vault Raft snapshots, age-encrypted and off-host (same pipeline as MN-07).
4. Document the key ceremony and the rotation procedure (add-before-remove votes) in the runbook.

**Verify:** no plaintext key on any host's disk outside the Besu data directory; a validator restart succeeds while the key exists only in Vault.

---

### MN-15 — Resync safety: widen the SNAP window and rehearse recovery
**Evidence:**
- All 7 validators and rpc1 run `sync-mode=SNAP` with `bonsai-limit-trie-logs-enabled=true` and `bonsai-historical-block-limit=512`.
- At 5 s blocks that is a **~43-minute** self-resync window. A node that falls further behind can't SNAP-recover.
- `RUNBOOK_VALIDATOR_SNAP_STUCK_RECOVERY.md` has **never been executed**.

**Implementation steps:**
1. Raise `bonsai-historical-block-limit` to 4096 on rpc1 and `call` (~5.7 h window). Measure the disk impact on one node first.
2. Keep at least one non-validator FULL-sync node (already: `call`, and `call2` after MN-10) as a guaranteed sync source.
3. Drill the runbook on testnet:
   - Stop a validator for an hour, until it is more than 512 blocks behind.
   - Follow the runbook and time it.
   - Fix the runbook.
4. Repeat the drill on a mainnet **non-validator** (rpc1) in a maintenance window.

**Verify:** the drill finishes within the documented time; the runbook gets an "exercised on <date>" stamp.

---

### MN-16 — Private network: WireGuard mesh instead of SSH tunnels and public IPs
**Evidence:** HAProxy reaches rpc1, `call` and archive through SSH tunnels, and P2P and some scrapes use public IPs. Both are fragile; for example, the 2026-09-15 tunnel missing a `permitopen` silently cross-contaminated call and write routing.

**Implementation steps:**
1. Assign a mesh subnet (e.g. `10.50.0.0/24`). Avoid the Docker bridge range, as the old registry learned.
2. Use the old registry's tooling:
   - `wg-bootstrap.sh` renders `wg0.conf` for all hosts.
   - `wg-add-peer.sh` adds hosts incrementally.
   - The README has the exact steps.
3. Move traffic onto the mesh in this order:
   1. Prometheus scrapes
   2. HAProxy → rpc1/call/archive (replaces the tunnels)
   3. Besu P2P (`p2p-host` + static-nodes on mesh IPs, rolled one node at a time)
4. Close the public P2P and metrics ports, leaving only what external peers need (none, if every validator is on the mesh).

**Verify:** the tunnels are removed; HAProxy health is green over the mesh; peer counts are unchanged.

---

### ALL-17 — CI on Azure DevOps
**Evidence:** the new repo has **no CI**. The old registry runs CodeQL, gitleaks, Slither, Echidna, Trivy and cosign.

**Implementation steps:** an `azure-pipelines.yml` with these stages:
1. **gitleaks**, as a container (`ghcr.io/gitleaks/gitleaks:v8.21.2 git . --redact --exit-code 1`).
2. **Gateway** (`mainnet_production/gateway/gateway`, `tesnet_server/gateway`):
   - `npm ci && npm run build`
   - unit tests (MN-18)
   - `docker build`
   - Trivy image scan failing on HIGH/CRITICAL, with a `.trivyignore` that records the reason for each ignored entry
3. **Shell:** `shellcheck` over `scripts/**/*.sh` and `tesnet_server/scripts/*.sh`.
4. **Config:** `haproxy -c -f` on the git copy of `haproxy.cfg` (MN-11); `promtool check rules`.
5. Branch policy on `mainnet-final` and `testnet-final`: PR plus a green pipeline required.

---

### MN-18 — gasPriceGuard fail-closed + gateway unit tests
**Evidence:**
- `tx/gasPriceGuard.ts` "returns 0n on any decode error — allow TX through if unreadable", so it fails open.
- It only checks single `eth_sendRawTransaction` requests, not batch items.
- The gateway has no tests.

**Implementation steps:**
1. On a decode error, return a JSON-RPC error (`-32602 Invalid raw transaction`) instead of passing the request through.
2. Check every batch item (this pairs with ALL-02's guard).
3. Tests (vitest or jest), covering:
   - methodGuard: allowed, denied, a batch of 51, empty batch, bad JSON
   - limiter: points per item
   - archiveRouter: tag classification
   - gasPriceGuard: 0, >0, malformed, batch

---

## 5. P3: performance program

### ALL-19 — Benchmark program
**Why:** no saturating benchmark has ever been run on the new **mainnet**, and no dependent-transfer (`executeChain`) workload has run on the new stack at all. Every speed item above needs a before/after number.

**Implementation steps:**
1. Use the harness from today's run (`bench.mjs`: ramped transfers plus a Counter contract, auto-abort, receipt and counter-slot validation) as the standard. Add it to the repo under `QA/bench/`.
2. **Parity run.** ✅ *Baseline done 2026-10-12 on the degraded chain:*
   - **200×200 and 200×100**: 800/800 Phase C txs `status=1`; gas per tx identical to the old registry (1,444,591 vs 1,444,590 at 200×100).
   - **End to end, 5.7× slower than the old 200×100.** The cause is block cadence (27 one-block chunks at 10 s versus 2 s) plus internet + gateway reads in Phase A/B. Chain capacity is not the cause: blocks were ≤ 0.45% gas-full.
   - Full numbers: `registry-comparison-2026-10-12.md` §6.

   **Remaining:** re-run after TN-05 and TN-12 to confirm the projected ~195 s; then run a capacity run with Phase C `CHUNK_SIZE` raised (e.g. 60) to find the chain's real `executeChain`-per-block ceiling. Original steps:
   - Deploy `HaraPalmOil` + `TraceabilityBatchRelay` from `hara-ledger/contracts`. London bytecode runs on Shanghai.
   - Grant `MINTER_ROLE`. The old registry's "527/648 TPS" result was all reverts because this was missing.
   - Run `ops/load-tests/scenario-stress-200x500.ts` at 20×100 with `CHAIN_ID=121299`, scaling up only while it stays clean.
   - Report events/s **and** tx/s **and** gas/s.
3. A nightly 2-minute smoke run (5 tx/s) on testnet, exported as metrics. Alert if inclusion p95 exceeds 2× the block period.
4. Before any MN-20 decision, find the testnet saturation point: increase the offered rate until inclusion falls behind, then record gas per block and CPU.

### MN-20 — Shorten the block period (5 s → 3 s, later 2 s)
**Speed impact:**
- Average time-to-inclusion drops ~40% (3 s) to ~60% (2 s).
- Burst capacity is 1.7–2.5× higher, if block import keeps up.
- The old registry ran 2 s blocks, peaking at ~316 M gas per 2 s block.

**Risk:**
- 7 validators across 3 clouds add WAN round trips to every QBFT round.
- Validators on 2 vCPU must import blocks faster.
- Wrong `requesttimeoutseconds` values cause round-change storms.

**Do this only after:** MN-09, MN-10, MN-13 and ALL-19 are done, and the benchmark shows import CPU headroom of at least 2× at the target period.

**Implementation steps:**
1. Measure inter-validator RTT. It must stay below ~1/4 of the target period.
2. On testnet, add a QBFT **transition** in genesis: `"transitions": {"qbft": [{"block": <N>, "blockperiodseconds": 3}]}`.
   - Requires a coordinated restart of all validators with the new genesis **before** block N. Besu reads transitions from the genesis file.
   - Keep `requesttimeoutseconds` at roughly ≥ 3× the period.
3. Soak on testnet for 7 days under the nightly benchmark, watching round changes, empty blocks and import time.
4. Mainnet: same procedure, with N at least 48 h ahead and every validator updated and confirmed before N.

---

## 6. Dependencies

```
MN-11 (config in git) ──► everything that changes config (ALL-02, MN-03, MN-09, MN-10, MN-13, MN-16)
MN-08 (alerting)      ──► detects regressions for all speed items; required before MN-20
TN-05 ──► TN-12 ──► ALL-19 (parity benchmark) ──► MN-20
MN-09 + MN-10 + MN-13 ──► MN-20
MN-14 (key custody)   ──► MN-04 key rotation, ALL-06 replacement secrets
```
MN-01, MN-03, MN-04, ALL-06 and TN-05 have no dependencies. Start them now.

## 7. Expected speed outcome once P0–P1 are done

| Metric | Today | After P0–P1 | Driver |
|---|---|---|---|
| Testnet block interval | 10.0 s (2 of 3 validators proposing) | 5.0 s | TN-05 |
| Testnet block capacity | 50% of design | 100% | TN-05, TN-12 |
| Testnet inclusion latency (measured 2026-10-12, 5–50 tx/s) | p50 6 s / p95 15 s | ≈ p50 3 s / p95 5–6 s | TN-05 (latency is set by cadence; blocks were ≤ 0.18% gas-full) |
| Free-transaction spam exposure | Open (zero-balance senders accepted) | Writes need a key + per-sender limits | ALL-21, ALL-02, MN-03 |
| Palm-oil 200×100 end to end (old registry: 61.4 s / 322 transfers/s) | 350.8 s / 56 transfers/s (Phase C alone: 266.6 s) | ≈ 195 s / ~100 transfers/s; old-class speed needs MN-20 (2 s blocks) or larger Phase C chunks | TN-05 (+ MN-20) |
| Mainnet block cadence | 15 s gaps on throttled validators; occasional OOM restarts | Evenly spaced 5 s | MN-09 |
| Mainnet read freshness (`call` pool) | 20–65 s behind head under estimate bursts | < 1 block | MN-10 |
| RPC hang risk from `debug_trace*` floods | Open to anonymous callers | Closed | ALL-02, MN-03 |
| Time to detect a degradation | Days (testnet: 11 days) | Minutes | MN-08 |

## 8. Live throughput evidence (testnet ramp, 2026-10-12 11:03–11:09 UTC)

**Setup**
- Harness: `bench.mjs`. Gentle ramp approved by the operator, with automatic abort.
- Target: `https://rpc.mampang.haratoken.app/v1/<key>`.
- 25 throwaway senders, gasPrice 0, legacy transactions.
- Workload: 50/50 mix of 0-value transfers (21k gas) and calls to a tiny SSTORE counter contract (~26–43k gas), sent as JSON-RPC batches of `eth_sendRawTransaction`.
- Steps: 5 → 20 → 50 tx/s, 60 s each, then a drain phase.
- Chain state during the run: the **degraded** validator set from TN-05.

| Step | Sent | Accepted | Included | Inclusion latency p50 / p95 / max | Read latency p50 / p95 / p99 |
|---|---|---|---|---|---|
| idle | — | — | — | — | 56 / 89 ms |
| 5 tx/s | 300 | 300 | **300 (100%)** | 6 / 15 / 16 s | 51 / 91 / 283 ms |
| 20 tx/s | 1,200 | 1,200 | **1,200 (100%)** | 6 / 15 / 16 s | 50 / 72 / 78 ms |
| 50 tx/s | 3,000 | 2,950 | **2,950 (100% of accepted)** | 6 / 14 / 16 s | 49 / 115 / 321 ms |

**Chain during the run:**
- 23 blocks observed. Block interval averaged **10 s** (min 5, max 15).
- Proposers were only V3 (12 blocks) and V2 (11). V1 proposed none, confirming TN-05.
- Fullest block: **751 txs / 17.9 M gas**, about **0.18% of the 10 G gas limit**.

**Correctness:**
- Counter storage slot = **2,195** = Counter txs included (2,195). ✅
- 20/20 sampled receipts `status=0x1`. ✅ No reverts were counted as throughput.

**Gateway:**
- 412 HTTP OK. **1 HTTP 429**, which rejected an entire 50-tx batch in a single response. That accounts for the 50 rejected.
- One transient **HTTP 502** (empty body) on a pre-run auth check; it was fine on retry.

**What the numbers mean:**
1. **Throughput is not the bottleneck; block cadence is.** Inclusion stayed at 100% and inclusion latency didn't change from 5 to 50 tx/s. Blocks were at most 0.18% gas-full. The ceiling is well above 50 tx/s; it was not pushed further, per the gentle-ramp approval. Every transaction waits for the next block, so latency follows the 5 s / 15 s alternation.
   - **TN-05** (restore 5 s cadence) is expected to bring p50 from ~6 s to ~3 s and p95 from ~15 s to ~5–6 s, with no other change.
   - **MN-20** (shorter period) is the next latency lever after that.
2. **Read latency holds under write load.** p50 stayed at ~50 ms from Indonesia at every step, the same as idle. The single-host gateway and validator1 RPC path has headroom at this scale.
3. **Batches bypass the rate limit as predicted (ALL-02).** About 50 tx/s went through with roughly 1 rate-limit point per second.
   - The flip side: one 429 drops an entire batch. Clients need retry-with-backoff, and ALL-02's per-item charging must come with documented batch sizes.
4. **Zero-balance senders are accepted.** The counter contract was deployed from a fresh, unfunded wallet. On a gas-free chain, anyone can submit unlimited free transactions from new addresses. The only throttle is the gateway, and it is bypassable (batches, `/v1/public`, open HAProxy ports). See the new item **ALL-21**.
5. The 4,451 benchmark transactions remain on the testnet chain. They are harmless and will be removed by the Jan 1 reset.

**Compared with the old registry (recorded benchmarks; the old chain was offline on 2026-10-12):**

| | Old 131216 (recorded) | New testnet 121299 (today, degraded) |
|---|---|---|
| Block period (design / actual) | 2 s / 2 s | 5 s / **10 s** |
| Workload | ERC-1155 `executeChain`, 499 dependent hops per tx (~6.9 M gas/tx) | 0-value transfers + SSTORE counter (~24 k gas/tx avg) |
| Headline | 361 events/s = ~1.45 tx/s, ~10 M gas/s (script-throttled) | **≥ 49 tx/s sustained, 100% included**, ~1.2 M gas/s (load-limited, not chain-limited) |
| Largest block seen | 316 M gas / 47 tx in 2 s | 17.9 M gas / 751 tx (0.18% full) |
| Inclusion latency | ~1 block (≈ 2–4 s) | p50 6 s, p95 15 s (two blocks during the 15 s gaps) |

These are **different workloads**, so tx/s and gas/s can't be compared head-to-head. The old chain proved heavy-gas capacity; this run proved the new testnet absorbs ≥ 50 light tx/s with latency set purely by block cadence. A like-for-like comparison needs the ALL-19 parity run (`executeChain` on testnet after TN-05).

---

### ALL-21 — Spam resistance on a gas-free chain *(added from the benchmark; P1)*
**Evidence:**
- The benchmark deployed and transacted from a **zero-balance** wallet, so gas price 0 combined with zero base fee means submitting a transaction costs nothing.
- Today's throttles are only gateway rate limits, which are bypassable: batch = 1 point, `/v1/public` accepts `eth_sendRawTransaction`, and HAProxy 5797 is public.

**Speed impact:** a spammer can fill blocks and the tx pool for free. That degrades inclusion latency for every legitimate user, and on the archive it also adds storage cost (~45 KB/tx).

| Importance | Speed impact | Effort | Priority |
|---|---|---|---|
| 4 | High under attack (blocks and pool fill for free) | M | **P1** |

**Action plan:** layer the controls; each one alone is bypassable.
1. Gateway policy.
2. Per-sender limits in the tx pool.
3. On mainnet, consider on-chain account permissioning.

**Implementation steps:**
1. Gateway: **remove `eth_sendRawTransaction` from `PUBLIC_METHODS`** (ALL-02), so writes require an API key.
2. Gateway: per-sender write limiting.
   - Decode the sender (`recoverTransactionAddress` with viem or ethers) in `gasPriceGuard`.
   - Apply a Redis limiter per sender address, e.g. 20 tx/s and 50k/day.
   - Apply a separate per-key write quota.
3. Besu tx pool:
   - Keep `tx-pool-limit-by-account-percentage` low (e.g. `0.02` of `tx-pool-max-size`).
   - Set `tx-pool-max-size` to bounded memory.
   - Set `tx-pool-retention-hours` ≤ 1.
4. Mainnet, optional and strongest: Besu **account permissioning**. Use `permissions-accounts-config-file` (allowlist) or `permissions-accounts-contract-enabled` with an on-chain allowlist.
   - The faucet already keeps a whitelist (`HaraFaucetWhitelist`) to build on.
   - This makes the chain permissioned for senders. Decide it as a product question.
5. Close the public HAProxy ports (MN-03). Without that, steps 1–2 can be bypassed.

**Verify:**
- An unfunded wallet's tx via `/v1/public` → `-32601`.
- A single sender over the limit via a key → 429.
- Pool size stays bounded under a synthetic flood on testnet.

---

## 9. Testnet speed: what to do, ranked (2026-10-13)

**Grounding:** the 2026-10-12 runs.
- Blocks were at most 0.45% gas-full.
- The palm-oil Phase C cost exactly one block per waited chunk.
- Wallet setup (Phase A+B) took two-thirds of the 200×200 wall clock.

Effects are cumulative estimates unless marked measured.

| # | Action | Speed effect | Effort | Plan item |
|---|---|---|---|---|
| 1 | **Fix the validator set** (remove the phantom, then add V1), after the RPC lockdown | 10 s → **5 s blocks**: inclusion p50 ~6 s → ~3 s; 200×100 Phase C ~267 s → ~135 s | S | TN-05 (+ ALL-02 first) |
| 2 | **Bigger Phase C chunks** (15 → 60) or pipelined submission | Phase C goes from 27 blocks to ~7 | S | ALL-19 (client) |
| 3 | **Faster wallet setup:** batched verification reads, one-shot sends with one wait, wallet reuse, optional skip-priming | 200×200 setup 225 s → ~20 s (first run), ~2 s (reuse) | S | ALL-19 (client) |
| 4 | **2 s blocks at the Jan 1 reset.** The testnet re-genesises anyway, so put `blockperiodseconds: 2` (and a matching `requesttimeoutseconds`) in the staged `genesis.next.json`; no QBFT transition needed | ~2.5× on top of #1 (old-registry cadence) | S | TN-05 step 6 / MN-20 |
| 5 | **Besu 26.6.0-RC1 → 26.6.1** | Removes the known post-burst empty-block stall | S | TN-12 |
| 6 | **In-region benchmark client + higher `rps_limit` key** | Reads ~50 ms → ~1 ms; no 429-dropped batches | S | ALL-19 |
| 7 | **Shorten the RPC path.** Today it's Caddy (Host A) → gateway (Host B) → V1 (Host A), two cross-cloud hops. Co-locate the gateway with its primary RPC, or read from V3 (same host as the gateway) | Lower read latency; removes the transient 502 | M | MN-13 analogue |
| 8 | **Validator headroom:** split the RPC role off V1 (or add vCPU on Host A), right-size `mem_limit`, no CPU caps | Not binding at measured load; needed for ceiling tests | M | MN-09 analogue |

Measured results for #2 + #3 are in §10.

## 10. Measured: #2 + #3 on the testnet (2026-10-13, chain still degraded at 10 s)

**Setup**
- `scenario-stress-200x500.ts` with the new opt-in flags `FAST_SETUP=1 PHASE_C_CHUNK=60`, on branch `perf/stress-scenario-fast-setup`.
- Priming was **on**, to stay comparable with the old runs.
- Same contracts and endpoint as 2026-10-12. Every receipt audited.

| 200×100 | Old registry (2 s blocks) | New testnet, old script (10-12) | **New testnet, #2 + #3 (10-13)** |
|---|---|---|---|
| Wall clock (all phases) | **61.4 s** | 350.8 s | **137.8 s** (2.5× faster than the old script) |
| Transfers/s (old formula) | **322** | 56 | **144** |
| Setup A+B | ~7 s | 83.4 s | **16.8 s**; **0.5 s** when wallets are reused (same `SEED`) |
| Phase C | ~54 s | 266.6 s (27 one-block chunks) | **118.7 s** (7 chunks, 167 transfers/s) |
| Phase C blocks used | 27 | 27 | **7** (30 `executeChain` = 86.7 M gas per block, 0.87% of the limit) |
| Receipts | 400/400 `status=1` | 400/400 | **400/400**, 100 logs each, + 300/300 token txs |

**Gap to the old registry: 5.7× → 2.2×**, with no infrastructure change.

**What's left in that 2.2×:**
- **Empty blocks between chunks.** Each 60-tx chunk filled exactly one block, but the client only notices the receipt on viem's ~4 s poll. By then the next block (5 s after a 15 s one) has been built empty, so each chunk costs ~2 blocks (~17 s average).
  - **Next quick win:** `PHASE_C_WAIT_EACH=0` (pipelined), or `pollingInterval: 500` on the public client. Expected Phase C ≈ 7 back-to-back blocks ≈ 70 s, total ≈ 90 s.
  - Pipelined submission puts up to 400 txs from one sender in the pool at once. The old Besu ~200-per-sender wall is unverified on 26.6; try it on testnet first and audit receipts.
- **Block cadence.** 10 s (degraded) → 5 s with TN-05 → 2 s at the Jan 1 reset (#4). With #1 + pipelining, 200×100 should land around 45–60 s, the old-registry class. With #4 as well, likely faster than the old registry. *(Projections, to be measured.)*

---
*Sources:* `mainnet_production/{docs/ARCHITECTURE.md, BACKLOG.md, docs/STATUS_TERDEPLOY_2026-08-20.md, QA/STRESS_TEST_RESULTS.md, gateway/gateway/src/**}`, `tesnet_server/{docs/CHANGELOG.md, validator*/config/*, scripts/*, gateway/**}`, `cloud_1/stress_test/SUMMARY.md`, `docs/12_capacity_planning.md`; old-registry tooling referenced from `hara-ledger/deploy/ops/*`, `ops/load-tests/*`; live probe of `rpc.mampang.haratoken.app` on 2026-10-12.
