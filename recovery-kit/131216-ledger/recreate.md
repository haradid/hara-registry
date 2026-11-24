# 131216 ledger — recreate on new VPSes

Numbered steps follow the Bring-up order in `README.md`. Each step gives the host, the
command (exact script path in this repo), what it produces, and how to verify it. Source
`../hosts.env` first (`set -a; . recovery-kit/hosts.env; set +a`). Extraction items (E-numbers)
are in `../00-PRE-TEARDOWN-EXTRACTION.md`.

Steps marked **`repo-derived — verify before cutover`** were written from the repository and
could not be confirmed against a live host while building this kit; read the script header
before running it.

Decide first: **same chain** (keep chain ID 131216 state, genesis and validator keys — needs
the E11 Vault snapshot, the genesis from E18, and ideally validator data from E18) or **fresh
chain** (new genesis, new keys, same chain ID but a new network from block 0; every contract
address changes and partners must re-anchor).

---

## 1. Provision hosts

- **Host:** every new VPS (hara-v1..v4, hara-rpc-1, hara-stateless-2, hara-stateful).
- **Command:** attach `deploy/ops/cloud-init.yaml` in the provider console **after replacing the placeholder SSH public key**; or on a booted box run `sudo bash deploy/ops/bootstrap-newbox.sh`. Then per operator: `sudo bash deploy/ops/add-operator.sh <name> "<ssh-pubkey>"`. On validators: `sudo bash deploy/ops/setup-swap.sh`.
- **Produces:** hardened host with Docker, the `hara` user, operator keys.
- **Verify:** `ssh <host> 'docker --version && id hara && sudo ufw status'`.

## 2. WireGuard mesh

- **Host:** operator laptop, then every host.
- **Command:** `bash deploy/ops/wg-bootstrap.sh` (generates per-peer keys and `wg0.conf`, assigns the mesh IPs in `README.md`). To keep the partner peer unchanged, reuse the extracted `wg0.conf` (E6) for hara-did-stg, or add it with `deploy/ops/wg-add-peer.sh`.
- **Produces:** `/etc/wireguard/wg0.conf` on each host, `wg-quick@wg0` enabled.
- **Verify:** `sudo wg show` on each host lists every peer with a recent handshake; from hara-stateful `for i in 11 12 13 14 21 25; do ping -c1 -W1 10.43.0.$i; done` all succeed. Mesh is `10.43.0.0/24`; if anything mentions `10.42.0.x` as a host, you are reading the stale `deploy/topology.md`.

## 3. hara-stateful — Vault, AppRoles, secrets   `repo-derived — verify before cutover`

- **Host:** hara-stateful (`10.43.0.40`).
- **Command:**
  ```bash
  docker compose -f deploy/platform/docker-compose.secrets.yml up -d
  bash deploy/ops/vault-raft-init.sh            # prints unseal keys + root token ONCE — store per E5, never in the repo
  # unseal with 3 of the 5 keys (vault operator unseal ×3)
  bash deploy/ops/vault-approle-bootstrap.sh    # AppRoles haraledger-{validator,signer,anchor,snapshot}
  bash deploy/ops/secrets-bootstrap.sh init     # writes each role .env from Vault
  ```
  Then **either** `scp` each generated role `.env` to its host (`deploy/{chain,rpc,services,platform,data}/.env`), **or**, for a same-chain rebuild, restore the extracted E7 `.env` files and the E11 Vault snapshot (`vault operator raft snapshot restore <file>`) so chain identity, validator keys and signer keys are unchanged.
- **Produces:** unsealed Vault with `secret/haraledger/*`, role `.env` files.
- **Verify:** `vault status` shows `Sealed false`; `vault kv list secret/haraledger` lists `validators/`, `signer-keys/`, `anchor/`, `admin-keys/`.

## 4. hara-stateful — data tier

- **Host:** hara-stateful.
- **Command:** `bash deploy/ops/bringup-stateful.sh` (Postgres 16, Redis 7, MinIO via `deploy/data/docker-compose.yml` + `docker-compose.minio.yml`). For a restore of previous data follow `backup-restore.md` **before** services connect.
- **Produces:** data stores listening on the mesh IP only.
- **Verify:** `docker compose -f deploy/data/docker-compose.yml ps` all `healthy`; `pg_isready -h 10.43.0.40`.

## 5. Validators

- **Host:** hara-v1..v4.
- **Fresh chain:** run the init container from `deploy/chain/init/` (`deploy/chain/init/init.sh` → `besu operator generate-blockchain-config` from `deploy/chain/qbft-config.json`, keys into Vault `secret/haraledger/validators/{1..4}`, `genesis.json` into the shared genesis volume). This is a **new network**: new genesis, new validator addresses, every contract redeployed in step 9.
- **Same chain:** `genesis.json` is **not in the repo** (`deploy/chain/genesis/` holds only `.gitkeep`); restore it from E18 together with `static-nodes.json`, and restore the Vault snapshot (step 3) so `validators/{1..4}` hold the original keys. Optionally restore validator data from `snapshot-validator.sh` archives (E18) to avoid a full resync.
- **Command:** `bash deploy/ops/bringup-validators.sh` (uses `deploy/chain/docker-compose.validator-only.yml` with `VALIDATOR_ID` per host; image `hara-registry-node` built from `deploy/chain/node/Dockerfile`, E10).
- **Verify:** on each validator `curl -s -X POST localhost:8545 -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'` increases every ~2 s; `qbft_getValidatorsByBlockNumber("latest")` lists 4 addresses; for a same-chain rebuild the block number continues from the pre-teardown height.

## 6. hara-rpc-1 — RPC tier

- **Host:** hara-rpc-1 (`10.43.0.21`).
- **Command:** `docker compose -f deploy/rpc/docker-compose.yml up -d` (rpc-write + rpc-read ×2 + HAProxy + autoheal). Confirm `--sync-min-peers=2` is present in `deploy/rpc/scripts/start-rpc.sh` (the chain has only 4 validators; the Besu default of 5 would never sync).
- **Produces:** HAProxy on `:8545` (write/read routing), stats on `:8404`.
- **Verify:** `curl -s http://10.43.0.21:8404/stats` shows all backends UP; `eth_blockNumber` through `:8545` matches the validators.

## 7. hara-stateless-2 — services   `repo-derived — verify before cutover`

- **Host:** hara-stateless-2 (`10.43.0.25`).
- **Command:** `bash deploy/ops/bringup-stateless.sh` (signer, broadcaster, indexer, rpc-cache, Blockscout BE 6.10.1 / FE v1.37.1). Restore the Blockscout backend env (E8) and **re-apply `INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true`** in `deploy/services/blockscout/envs/common-blockscout.env`; it is host-only and gitignored, and without it the internal-transactions fetcher hangs the rpc-read Vert.x event loop.
- **Produces:** services on the mesh; Blockscout indexing from block 0 (or resuming on a same-chain rebuild with restored Postgres).
- **Verify:** `docker compose -f deploy/services/docker-compose.yml ps` all healthy; Blockscout `curl -s localhost:4000/api/v2/stats` returns a growing `total_blocks`.

## 8. Observability

- **Host:** hara-stateless-2, plus every host for exporters.
- **Command:** `docker compose -f deploy/platform/docker-compose.obs.yml up -d`; on every host `sudo bash deploy/ops/install-node-exporter.sh`; on hara-rpc-1 and validators `sudo bash deploy/ops/install-metrics-proxies.sh`.
- **Produces:** Prometheus, Grafana (dashboards provisioned), Loki/Promtail, Tempo, Alertmanager → alert-sink. See `monitoring.md`.
- **Verify:** Prometheus `/targets` shows every job in `deploy/platform/prometheus/prometheus.yml` UP (mesh IPs unchanged, so no edits needed).

## 9. Edge

- **Host:** hara-stateless-2.
- **Pre-req:** DNS A-records (E9) for `rpc.ledger`, `explorer.ledger`, `grafana.platform`, `console.platform` → `LEDGER_STATELESS2_PUBLIC_IP`, otherwise ACME fails.
- **Command:** `docker compose -f deploy/edge/docker-compose.yml up -d` with `deploy/edge/Caddyfile`; ACME email `LEDGER_ACME_EMAIL`.
- **Verify:** `curl -s https://rpc.ledger.haratrust.io -X POST -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'` returns `0x2008a` (131216); explorer and Grafana load over TLS.

## 10. Phase 7 — contracts + anchor-worker

- **Host:** laptop (deploys) + hara-stateless-2 (anchor-worker).
- **Command:** `bash deploy/ops/bringup-phase7.sh`. **Same-chain rebuilds skip the contract deploys** (addresses already exist on chain); only restart the anchor-worker with its Vault signer (`secret/haraledger/signer-keys/anchor-worker`, seeded by `deploy/ops/seed-anchor-key.sh`).
- **Verify:** anchor-worker logs show a successful anchor transaction; the registry contract responds to a read call.

## 11. Backup timers   `repo-derived — verify before cutover`

- **Host:** hara-stateful and hara-v1..v4.
- **Command:** `sudo bash deploy/ops/backup-setup.sh` (rclone remote `BACKUP_S3_REMOTE`, `backup.env` from E3), then `sudo REPO=/opt/hara/hara-ledger bash deploy/ops/install-backup-timers.sh <roles>`. **Pass roles explicitly on hara-stateful** (`vault postgres postgres-basebackup postgres-wal redis minio drill`): the script auto-detects by `hostname -s`, which returns `localhost` on that host and aborts.
- **Verify:** `systemctl list-timers 'hara-*'` shows every timer with a next run; after the first run `bash deploy/ops/s3-readback-check.sh` **must exit 0** — on the old provider it failed with GetObject 403 (`backup-restore.md`).

## 12. Console

- **Host:** hara-stateless-2 (+ agents on every host).
- **Command:** `docker compose -f deploy/services/docker-compose.console.yml up -d --build`; on every host `sudo bash deploy/ops/install-console-agent.sh` (agent on `:8911`, mesh only). Caddy basic_auth credentials come from E1.
- **Verify:** `https://console.platform.haratrust.io` prompts for basic auth and then shows every host green.
