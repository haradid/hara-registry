# 121299 testnet — recreate Host B on a new VPS

Source `../hosts.env` (`TESTNET_*`). Extraction item E15 (`../00-PRE-TEARDOWN-EXTRACTION.md`)
holds the authoritative `nodekey3`, gateway `.env`, database dump, `validator3_reset_remote.sh`
and the forced-command `authorized_keys` line. Sections 1–4 are
**`repo-derived — verify before cutover`**: `docs-ref/ARCHITECTURE.md` §2.3 says the live
`mem_limit` values and RPC flags differ from the repo copies.

Fill every `<TESTNET_HOSTB_IP>` / `<TESTNET_HOSTA_IP>` placeholder in the copied files before use.

Decide first: migrate live (add-before-remove, §1) or rebuild at the next quarterly reset
(1 Jan / Apr / Jul / Oct, 03:00 UTC) and accept the interim outage.

---

## 1. validator3 on the new Host B   `repo-derived — verify before cutover`

1. New host: Docker, `ufw` (SSH 22 from operator IPs; 30305 from Host A; 5797/5798 from Host A only).
2. Copy `scripts/validator3/` to the host. Edit `config/static-nodes.json`: validator3's own enode
   gets the new public IP, Host A's two enodes stay. **Also update Host A's `static-nodes.json`**
   for validator1 and validator2 with validator3's new enode (restart them one at a time — with
   quorum 3 of 3 the chain pauses while any validator restarts).
3. Identity:
   - **Same key:** restore `nodekey3` (E15) into the data dir → same address, rejoins automatically.
   - **New key:** `scripts/ops/01_generate_node_key.sh`, then the address is
     `keccak256(uncompressed pubkey)[12:]` (`besu public-key export-address`), **not** `pubkey[:20]` —
     the wrong derivation is what put `0x7ac4c91a…` into genesis. Vote it in from validator1 and
     validator2 (`qbft_proposeValidatorVote(<addr>, true)` on both — 2 of 3 is a majority), confirm
     with `qbft_getValidatorsByBlockNumber("latest")`, then vote the old validator3 out from the same
     two nodes. Quorum math: the interim set of 4 needs 3 online, so sealing continues as long as
     the new node is synced and signing (whether or not the old Host B is still up). **Remove-first
     is the dangerous order:** a set of 3 with 2 online is below quorum and the chain halts until the
     new node is voted in — and voting needs blocks, so you would be stuck. If Host B was already
     destroyed before the vote, expect exactly that halt at 2 of 3 until a replacement validator3 with
     the **same** `nodekey3` is back online.
4. `docker compose up -d`. Settings to keep: `profile=ENTERPRISE`, `sync-mode=SNAP` with BONSAI
   trie-log pruning, `tx-pool=sequenced`, `discovery-enabled=false`, `target-gas-limit` 10 G,
   `min-gas-price=0`, RPC on `5797`, WS `5798`, P2P `30305`.
5. **If SNAP sync loops** (the node never leaves "waiting for peers"/pivot), switch to
   `--sync-mode=FULL` — the 2026-09-22 lesson in `docs-ref/CHANGELOG.md`. Raise `mem_limit` to the
   value recorded in the CHANGELOG for Host B, not the repo default.
- **Verify:** `curl -s localhost:5797 -X POST -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'`
  tracks Host A; `qbft_getValidatorsByBlockNumber("latest")` lists exactly 3 addresses including
  validator3's; `scripts/ops/hara-block-health-watch.sh` shows all three as `miner` in rotation.

## 2. Gateway + dashboard   `repo-derived — verify before cutover`

1. `scripts/gateway/docker-compose.yml` — compose project `hara-tesnet-gateway`; containers
   `hara-tesnet-gateway`, `hara-tesnet-gateway-dashboard`, `hara-tesnet-gateway-postgres`,
   `hara-tesnet-gateway-redis`.
2. Restore the `.env` (E15: `FAUCET_PRIVATE_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`,
   `POSTGRES_PASSWORD`). Primary RPC is **Host A** `<TESTNET_HOSTA_IP>:5797`; secondary is
   **`host.docker.internal:5797`** (validator3 on the same box); `gateway/src/proxy/rpcHealth.ts` fails
   over between them.
3. Restore the database: `age -d -i ~/.config/age/hara-backups.txt testnet-gateway.sql.age | docker exec -i hara-tesnet-gateway-postgres psql -U hara_gw`
   (API keys, users, faucet claims).
4. Firewall: the ufw rule allows `4000`–`4002` **only from Host A** (Caddy proxies everything);
   nothing else is public.
- **Verify:** from Host A `curl -s http://<new-host-b>:4000/health`; after §3,
  `curl -s https://rpc.mampang.haratoken.app/v1/public -X POST -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'`
  → `0x1d9d3` (121299); an existing testnet key authenticates on `/v1/<key>`.

## 3. Host A changes (AWS — outside NevaCloud scope but required)   `repo-derived — verify before cutover`

1. `host-a-deps/caddy/Caddyfile`: point the `rpc.`, `dashboard.`, `explorer.`, `netstats.mampang`
   upstreams that reference Host B at the new address; `docker compose -f host-a-deps/caddy/docker-compose.yml restart`.
2. ufw **and** the AWS security group: allow `5797`/`5798` and `30305` from the new Host B IP;
   remove the old one.
3. Netstats: its firewall is a **`DOCKER-USER`** iptables chain managed by
   `netstats-firewall-restrict.service`, not ufw — ufw rules do not apply to Docker-published ports.
   Update that unit's allow-list with the new Host B IP and restart it
   (`host-a-deps/netstats/docker-compose.yml`, `hara-netstats-patch.js`).
4. `static-nodes.json` on validator1/validator2 (see §1.2).
- **Verify:** `https://netstats.mampang.haratoken.app` shows three nodes; Caddy logs show 200s to
  the new upstream.

## 4. Quarterly reset coordination   `repo-derived — verify before cutover`

`scripts/ops/cleanup_quarterly_reset.sh` runs on **Host A** (cron `0 3 1 1,4,7,10 *` UTC, installed
by `scripts/ops/install_cron.sh`). It SSHes to Host B as `root` with the key
`keys/automation/hara-quarterly-reset-key`, whose `authorized_keys` entry on Host B carries a
**forced command** restricted to `stop|wipe|start|status`, implemented by
`validator3_reset_remote.sh` on Host B. After the reset it runs the post-reset validator-set check.

1. Restore `validator3_reset_remote.sh` on the new Host B (E15 — it exists in **no repository**) and
   make it executable; restore the forced-command line into `/root/.ssh/authorized_keys`.
2. On Host A, set `HOSTB_IP` in `scripts/ops/cleanup_quarterly_reset.sh` to the new address
   (`TESTNET_HOSTB_PUBLIC_IP`). The script's pre-flight **aborts if Host B is unreachable**, so an
   unupdated IP means the reset silently does nothing on the next 1 Jan / Apr / Jul / Oct.
3. Test with the read-only phase before the next run: `ssh -i keys/automation/hara-quarterly-reset-key root@<new-host-b> status`.
4. Keep `config/genesis.json.template` and the staged `genesis.next.*.json` (if present) in sync
   between Host A and Host B; the reset promotes the staged genesis on Host B first.

## 5. Monitoring

Netstats only (`host-a-deps/netstats/`). `scripts/ops/hara-block-health-watch.sh` (systemd timer,
5 min) and `hara-mem-watch` are **log-only** — reinstall the timer on the new Host B and read
`journalctl -u hara-block-health-watch`. There is no Prometheus, no Alertmanager and no paging on
the testnet.
