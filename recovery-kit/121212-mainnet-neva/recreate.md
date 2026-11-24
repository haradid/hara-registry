# 121212 mainnet — recreate the NevaCloud slice on new hosts

Read `../00-PRE-TEARDOWN-EXTRACTION.md` §0 first: the three NevaCloud validators are 3 of 7 and
must be **added before they are removed**. Source `~/hara-ops/hosts.env` (`MAINNET_*`). Extraction items
E12–E14 hold the authoritative compose/config/key files; everything below marked
**`repo-derived — verify before cutover`** was reconstructed from `docs-ref/` and the Blockchain
repo, not confirmed on a live host.

Recommended order: §1 validators (one at a time, vote in, confirm) → §2 `call` + validator1
re-plumbing → §3 gateway host + DNS → §4 health watch → only then vote the old validators out
and destroy the old hosts.

---

## 1. Validators v3 / v4 / v5 on new hosts   `repo-derived — verify before cutover`

**Primary path:** restore the extracted `docker-compose.yml`, `config.toml`, `static-nodes.json`
and node `key` (E12) into the same directory layout the compose file mounts, then
`docker compose up -d`. The list below is the fallback if an extraction is missing.

Besu settings in use (from `docs-ref/ARCHITECTURE.md` and the CHANGELOG entries):

| Setting | Value |
|---|---|
| image | `hyperledger/besu:26.6.1` |
| network | `--network-id 121212`, `--genesis-file` = `scripts/config/genesis.json`, `static-nodes.json` from `scripts/config/` (**add the new node's enode and remove the old one, on every validator**) |
| sync | `--sync-mode=SNAP`, `--bonsai-limit-trie-logs-enabled=true`, `--bonsai-historical-block-limit=512`, `--data-storage-format=BONSAI` |
| gas | `--min-gas-price=0` (chain is `zeroBaseFee`) |
| p2p | `--p2p-port=30303`, `--discovery-enabled=false` (static peers only) |
| rpc | validators expose RPC only to validator1's SSH tunnel; keep `--rpc-http-host=127.0.0.1` |
| resources | `mem_limit: 3072m` minimum (v3/4/5 were raised to 3072m on 2026-10-09 after OOM kills). **No `cpus:` cap** — a `cpus: 0.7` cap caused 15 s block gaps (root cause found 2026-10-12) |
| restart | `unless-stopped`; container name `hara-mainnet-validatorN` so the health watch and HAProxy docs still match |

**Identity — this decides whether the chain keeps sealing:**

- **Same key** (E12 `key` restored into the data dir) → same validator address → the node rejoins
  the set automatically once it is synced. Nothing to vote.
- **New key** → the address is `keccak256(uncompressed 64-byte pubkey)[12:]` — **not** the first 20
  bytes of the pubkey. The wrong derivation broke the testnet faucet and validator1 in 2026-08/09.
  Derive it with Besu itself: `besu public-key export-address --node-private-key-file=key`.
  Then, from a **majority of the current validators** (4 of 7): `qbft_proposeValidatorVote(<newAddress>, true)`.
  Confirm with `qbft_getValidatorsByBlockNumber("latest")` **before** voting any old validator out
  (`qbft_proposeValidatorVote(<oldAddress>, false)`). Keep the number of live, signing validators
  ≥ ⌈2N/3⌉ of the **current** set size N at every step — 5 of 7, 6 of 8, 6 of 9, 7 of 10. "≥ 5" is
  only right while N = 7; if you add all three replacements before removing any old node, N = 10
  and the quorum is 7. Safest: add one, confirm, remove one, so N stays 7–8.

**512-block SNAP window:** a node more than 512 blocks (about 43 min) behind cannot self-resync
with the trie-log limit above; follow `docs-ref/RUNBOOK_VALIDATOR_SNAP_STUCK_RECOVERY.md`
(wipe the data dir and re-SNAP, keeping the `key`).

**Verify:** `eth_blockNumber` on the new node tracks validator1 within a few blocks;
`qbft_getValidatorsByBlockNumber("latest")` lists its address; the health watch (§4) shows it as
`miner` in the round-robin within 7 × 5 s.

## 2. `call` node and the validator1 re-plumbing   `repo-derived — verify before cutover`

- `hara-mainnet-call`: same image; `--sync-mode=FULL`, **trie-log limiting off** (it serves historical
  reads for the `call_frontend` pool). Not a validator — no vote. Restore from E13 or build from the
  table above with those two changes. Replace the password SSH login with key auth while you are there.
- On **validator1** (`<MAINNET_V1_AWS_IP>`, AWS — out of NevaCloud scope but required):
  1. Add the new `call`/v3/v4/v5 addresses to the SSH-tunnel definitions (the HAProxy pools reach
     every node through local tunnels).
  2. Add each new address to the **`permitopen`** list of the tunnel key in `authorized_keys` on
     the *target* node side / the tunnel config. A missing `permitopen` entry cross-contaminated the
     pools on 2026-09-15 (`docs-ref/QA/STRESS_TEST_RESULTS.md`): requests meant for one backend
     landed on another.
  3. Edit `/opt/hara-mainnet/config/haproxy.cfg` (host-only): backends for `call_frontend` (5799) and
     the `rpc_tx` backup; reload HAProxy; check the stats page shows the new backends UP.
  4. Allow the new IPs in validator1's firewall / security group for the tunnel port.
- **Verify:** `curl` through validator1's `call_frontend` returns `eth_chainId` `0x1d97c` (121212);
  the HAProxy stats page shows the new backends green and the old ones removed.

## 3. Gateway host   `repo-derived — verify before cutover`

1. New host: Docker + nginx + certbot. Clone or copy `scripts/gateway/`.
2. `scripts/gateway/docker-compose.yml` brings up `hara-gateway`, `hara-gateway-dashboard`,
   `hara-gateway-postgres`, `hara-gateway-redis`; all ports bind to `127.0.0.1`, nginx fronts them.
3. Restore the `.env` from E14 (never recreate the faucet keys — they control the prefunded faucet
   balance) and set `HAPROXY_HOST=<MAINNET_V1_AWS_IP>` (`MAINNET_HAPROXY_HOST`) so the gateway reaches
   the pools on validator1. Allow the new gateway IP in validator1's firewall.
4. Restore the database: `age -d -i ~/.config/age/hara-backups.txt mainnet-gateway.sql.age | docker exec -i hara-gateway-postgres psql -U hara_gw`
   (users, `api_keys`, usage counters, `faucet_claims` — without this every partner key stops working).
5. nginx + TLS: restore `/etc/nginx` and `/etc/letsencrypt` from E14, or issue new certificates
   after DNS. Point `rpc.registry.haratoken.app` and `dashboard.registry.haratoken.app` at the new IP (E9).
6. Coordinate the co-hosted `hara-status` app with its owner.
- **Verify:** `curl -s https://rpc.registry.haratoken.app/v1/public -X POST -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'`
  → `0x1d97c`; an existing partner API key authenticates on `/v1/<key>`; the dashboard logs in with the restored admin.

## 4. Health watch

`scripts/hara-block-health-watch.sh` runs on validator1 as a systemd timer every 5 minutes and
checks that every expected validator appears as `miner` in the last N blocks and that the average
block time stays under the threshold. After the set changes, update its expected-validator list
(or `NODE_ADDRESS`-style variables in the unit) so the new addresses are watched and the old ones
are not reported as missing. It is **log-only**: tail `journalctl -u hara-block-health-watch` after
each step in §1.

## 5. After cutover

- Vote out the old NevaCloud validators one by one (§1), confirming the set after each.
- Re-point Prometheus on validator1 to the new `call`/v3/v4/v5 targets.
- Update `docs-ref/ARCHITECTURE.md` in the Blockchain repo with the new hosts, and consider wiring
  Alertmanager to a notifier (today nothing alerts).
