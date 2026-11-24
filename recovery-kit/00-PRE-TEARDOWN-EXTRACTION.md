# 00 — Pre-teardown: STOP gate and extraction checklist

**Read this file in full before destroying any NevaCloud VPS.** It is load-bearing: two of
the three chains halt if their NevaCloud nodes disappear before the validator set has been
migrated, and several secrets exist on those hosts only.

Host addresses of the live `121212` / `121299` networks appear here as `<MAINNET_*_IP>` /
`<TESTNET_*_IP>` placeholders (this repository is mirrored publicly). The names are the
variables in `hosts.env.example`; the current values are in the private Blockchain repo on
Azure DevOps (`mainnet_production/docs`, `tesnet_server/docs`).

---

## §0 STOP — what dies if you destroy NevaCloud first

QBFT needs more than two thirds of the validator set to seal a block: quorum = ⌈2N/3⌉.
A validator-set change needs votes from **more than half** of the *current* validators.

### 121212 mainnet (`*.registry.haratoken.app`) — HALTS

**Summary:** chain 121212 has 7 validators and NevaCloud carries 3 of them; destroying them leaves **4 of 7**, below the quorum of **5**, so the chain stops sealing until the set is migrated.

| NevaCloud host | Role | Consequence of loss |
|---|---|---|
| validator3 `<MAINNET_V3_IP>` | QBFT validator (1 of 7) | set drops to 6 — still sealing |
| validator4 `<MAINNET_V4_IP>` | QBFT validator (1 of 7) | set drops to 5 — still sealing |
| validator5 `<MAINNET_V5_IP>` | QBFT validator (1 of 7) | **4 of 7 remain; quorum is 5 → the chain halts** |
| `call` `<MAINNET_CALL_IP>` | read pool + write-failover behind validator1 HAProxy (`call_frontend` / `rpc_tx` backup) | read pool degraded; write failover gone |
| gateway host `<MAINNET_GATEWAY_IP>` | public gateway + dashboard + Postgres + Redis behind `rpc.registry.haratoken.app` / `dashboard.registry.haratoken.app` | every public endpoint and every API key dies |

Required action, **add-before-remove**:

1. Stand up the replacement validators on the new hosts (see `121212-mainnet-neva/recreate.md`), with new keys unless E12 preserved the old ones.
2. From a **majority of the current validators**, call `qbft_proposeValidatorVote(<newAddress>, true)` for each new node. Wait until each address appears in `qbft_getValidatorsByBlockNumber("latest")`.
3. Only then vote each NevaCloud validator out with `qbft_proposeValidatorVote(<oldAddress>, false)`, one at a time, confirming the set after each.

Never let the **active** validator count drop below 5. The same procedure (add, confirm, then remove) was carried out successfully on the testnet on 2026-09-11 (`121299-testnet-neva/docs-ref/CHANGELOG.md`).

### 121299 testnet (`*.mampang.haratoken.app`) — HALTS

**Summary:** chain 121299 has 3 validators and NevaCloud Host B carries 1; destroying it leaves **2 of 3**, below the quorum of **3** (zero fault tolerance), so the chain stops sealing.

| NevaCloud host | Role | Consequence of loss |
|---|---|---|
| Host B `<TESTNET_HOSTB_IP>` | validator3 (1 of 3) | **2 of 3 remain; quorum is 3 → the chain halts** |
| Host B (same box) | gateway `:4000/:4001`, dashboard `:4002`, Postgres, Redis | every `*.mampang.haratoken.app` endpoint dies |

Options: the same add-before-remove procedure (stand up the new validator3 first, vote it in, vote the old one out), **or** accept the outage. The testnet is disposable and is wiped every quarter anyway; if the next quarterly reset is close, rebuilding the whole testnet on the new Host B at reset time is the cheaper path.

### 131216 ledger (`*.ledger.haratrust.io`) — FULL OUTAGE

The entire chain and every service run on NevaCloud, so teardown is a full outage of the ledger, its explorer, Grafana and the Strata console. Before destroying:

- Notify partners: hara-did / Atlas (on hara-did-stg `103.67.244.109`), and the Gapura / Aurum facades (designed, **not yet deployed** — nothing to migrate).
- Halal Passport (`<HALAL_PASSPORT_PROD_IP>`) is a **production application on Polygon Amoy (chainId 80002)**, not a HARA chain. Confirm with its owner before destroying that host; it is not covered by any runbook in this kit.

---

## §1 Setup on the operator laptop

Everything extracted is piped straight into `age` so no plaintext secret ever touches disk.

```bash
export AGE_RECIPIENT="age1fcdr3qk0wuzxy0ynmzj3d28d8m8pfe489wpk6udstzcyccj7l45sjla6e3"   # public key; private half = ~/.config/age/hara-backups.txt
OUT="$HOME/hara-ops/teardown-$(date +%F)"; mkdir -p "$OUT"; chmod 700 "$OUT"
grab() {  # usage: grab <ssh-target> <remote-path> <name>   — never prints the file
  ssh "$1" "sudo cat '$2'" | age -r "$AGE_RECIPIENT" > "$OUT/$3.age"
  test -s "$OUT/$3.age" || { echo "EMPTY: $3"; return 1; }
}
dumpdb() {  # usage: dumpdb <ssh-target> <pg-container> <db-user> <name>
  ssh "$1" "sudo docker exec $2 pg_dumpall -U $3" | age -r "$AGE_RECIPIENT" > "$OUT/$4.sql.age"
  test -s "$OUT/$4.sql.age" || { echo "EMPTY: $4"; return 1; }
}
# Prove you can decrypt BEFORE you rely on any of it:
echo probe | age -r "$AGE_RECIPIENT" | age -d -i ~/.config/age/hara-backups.txt
```

Expected output of the last line: `probe`. If it fails, stop: every file below would be unreadable.

---

## §2 Extraction checklist

Paths marked † are `repo-derived — verify before cutover`: confirm each with `ls` on the host before running `grab`. Tick **Done** only after the **Verify** column succeeded.

| # | Item | Lives at | Extract with | Verify | Done |
|---|---|---|---|---|---|
| E1 | `ops/secrets.txt` — master index: Vault unseal 3-of-5, S3 keys, Blockscout `SECRET_KEY_BASE`, console basic-auth, deployer keys | laptop `hara-ledger/ops/secrets.txt` (gitignored); † `/opt/hara/hara-ledger/ops/secrets.txt` on hara-stateless-2 | `age -r "$AGE_RECIPIENT" < ops/secrets.txt > "$OUT/secrets.txt.age"`; also mirror into the password manager | decrypt-and-count only: `age -d -i ~/.config/age/hara-backups.txt "$OUT/secrets.txt.age" \| wc -l` | ☐ |
| E2 | age private key — without it every backup is unreadable | laptop `~/.config/age/hara-backups.txt` only | confirm it is in the password manager **and** on an offline USB | the §1 probe decrypts | ☐ |
| E3 | `backup.env` (`BACKUP_AGE_RECIPIENT`, `RCLONE_TARGET`, `VAULT_APPROLE_*`) | † `/opt/hara/hara-ledger/deploy/ops/backup.env` on hara-stateful and hara-v1..v4 | `grab hara-stateful /opt/hara/hara-ledger/deploy/ops/backup.env backup.env-stateful` — repeat per host | `ls -la "$OUT"/backup.env-*.age` all non-empty | ☐ |
| E4 | rclone remote `nevacloud-s3` | path from `ssh hara-stateful 'sudo rclone config file'` | `grab hara-stateful <that path> rclone.conf`. If Nevacloud Object Storage is also being left, copy the buckets first (E17) | decrypt-and-count | ☐ |
| E5 | Vault init output (`vault-init-keys-v2.json`: 5 unseal keys + root token) | laptop `~/hara-ops/` + password manager | confirm both copies exist; AppRole `role_id`/`secret_id` pairs are in the E3/E7 env files | `age -d … \| wc -c` > 0 | ☐ |
| E6 | WireGuard keys `/etc/wireguard/wg0.conf` | every 131216 host + hara-did-stg | `grab <host> /etc/wireguard/wg0.conf wg0-<host>`. Optional: new hosts can get new keys from `deploy/ops/wg-bootstrap.sh`; extract only to keep the partner peer (hara-did-stg) unchanged | per-host file non-empty | ☐ |
| E7 | Per-role `.env` | † `/opt/hara/hara-ledger/deploy/{platform,data,services,chain,rpc}/.env` on their hosts. Laptop holds **partial** gitignored copies; the host copies are authoritative | `grab <host> <path> env-<role>-<host>` | decrypt-and-count per file | ☐ |
| E8 | Blockscout env (`SECRET_KEY_BASE`; `INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true`, host-only and gitignored) | † `deploy/services/blockscout/envs/common-blockscout.env` under `/opt/hara/hara-ledger` on hara-stateless-2 | `grab hara-stateless-2 <path> blockscout.env` | decrypt-and-count | ☐ |
| E9 | DNS zones `haratrust.io` and `haratoken.app` | DNS provider (Cloudflare; see `deploy/edge/cfedit-apiconsole.py`) | export both zones. Needed records: `rpc.ledger`, `explorer.ledger`, `grafana.platform`, `console.platform` (131216); `rpc.registry`, `dashboard.registry`, `explorer.registry`, `netstats.registry`, `grafana.registry`, `health.registry` (121212); `rpc.mampang`, `dashboard.mampang`, `explorer.mampang`, `netstats.mampang` (121299) | every record listed is present in the export | ☐ |
| E10 | Locally built images not on GHCR: `hara-registry-node`, `hara-alert-sink` | hara-v1..v4 / hara-stateless-2 Docker daemons | optional `docker save <image> \| zstd \| age -r …`; otherwise rebuild from `deploy/chain/node/Dockerfile` and `deploy/platform/alert-sink/Dockerfile` | `docker load` on a scratch box, or Dockerfiles present in repo | ☐ |
| E11 | Vault data — final Raft snapshot | hara-stateful | `ssh hara-stateful 'sudo systemctl start hara-snapshot-vault.service'` (unit name per `deploy/ops/install-backup-timers.sh`; confirm with `systemctl list-units 'hara-*'`) | new object in `hara-backups-vault` with today's date | ☐ |
| E12 | Mainnet NevaCloud validator3/4/5 config **and node key** — host-only, no compose exists in any repo | containers `hara-mainnet-validator{3,4,5}` on `<MAINNET_V3_IP>` / `<MAINNET_V4_IP>` / `<MAINNET_V5_IP>` | per host: `ssh <ip> "sudo docker inspect hara-mainnet-validatorN --format '{{json .Mounts}}'"` to find the config/data dirs, then `grab` `docker-compose.yml`, `config.toml`, `static-nodes.json` and the node `key` file | 4 non-empty `.age` files per validator | ☐ |
| E13 | Mainnet `call` node (`hara-mainnet-call`, `sync-mode=FULL`) | `<MAINNET_CALL_IP>` — reached with a **password, not a key** (ARCHITECTURE.md) — security gap, rotate on rebuild | same procedure as E12 | as E12 | ☐ |
| E14 | Mainnet gateway host | `<MAINNET_GATEWAY_IP>` | `grab` the gateway `.env` — it holds **`FAUCET_PRIMARY_PRIVATE_KEY` / `FAUCET_SECONDARY_PRIVATE_KEY`** (they control the prefunded faucet balance), `JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`. Then `dumpdb <MAINNET_GATEWAY_IP> hara-gateway-postgres hara_gw mainnet-gateway` (users / api_keys / usage / faucet_claims). Also `ssh <ip> 'sudo tar -C / -cz etc/nginx etc/letsencrypt' \| age -r "$AGE_RECIPIENT" > "$OUT/gateway-nginx-tls.tgz.age"`. The co-hosted `hara-status` app belongs to a teammate — coordinate before teardown | `.env.age`, `.sql.age`, `.tgz.age` non-empty; `age -d … \| tar -tz \| head` lists `etc/nginx/` | ☐ |
| E15 | Testnet Host B | `<TESTNET_HOSTB_IP>` | `grab` validator3 `nodekey3`; `grab` the gateway `.env` (`FAUCET_PRIVATE_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`); `dumpdb <TESTNET_HOSTB_IP> hara-tesnet-gateway-postgres hara_gw testnet-gateway`; `grab` † `scripts/validator3_reset_remote.sh` (host-only, in no repo) and the `authorized_keys` line carrying the forced command for `hara-quarterly-reset-key` | 5 non-empty `.age` files | ☐ |
| E16 | Partner boxes: hara-did-stg (`103.67.244.109`, HaraDID + Atlas), hara-exchange-stg (`<EXCHANGE_STG_IP>`), halal-passport-prod (`<HALAL_PASSPORT_PROD_IP>`) | their deploy code lives in their own Azure repos (PRODUCT HARA OS: hara-did, hara-atlas, hara-exchange; PRODUCT HALAL PASSPORT: halal-passport) | **their owners** extract their `.env` files and DB dumps. Flag Cloud_2 audit C-001: halal-passport exposes Postgres `:5432` and MinIO `:9000/9001` publicly — close on rebuild | written confirmation from each owner | ☐ |
| E17 | Final off-host backup pass for 131216 | hara-stateful and hara-v1..v4 | `systemctl start` every `hara-snapshot-*.service`, then `bash deploy/ops/s3-readback-check.sh`. **Known blocker: Nevacloud S3 `GetObject 403`** — the credential is write-only, so readback is unproven. Until a read-capable credential proves the objects are retrievable, **do not destroy hara-stateful**. If Nevacloud Object Storage is also being left: `rclone sync nevacloud-s3:<bucket> <new-remote>:<bucket>` for all 7 `hara-backups-*` buckets | `s3-readback-check.sh` exits 0 | ☐ |
| E18 | 131216 chain identity + validator chain data. **`genesis.json` and `static-nodes.json` are not in the repo** (`deploy/chain/genesis/` holds only `.gitkeep`; `init.sh` generates them into a volume) — a same-chain rebuild needs them. Chain data itself is optional (chains re-sync from peers while ≥1 healthy node remains) | hara-v1..v4 genesis/shared volumes (`docker inspect` the validator container for the mount paths) | `grab hara-v1 <genesis-volume>/genesis.json genesis-131216.json` and `grab hara-v1 <shared-volume>/static-nodes.json static-nodes-131216.json`; data via `deploy/ops/snapshot-validator.sh`. Mainnet/testnet have no snapshot tooling and rely on peers | `age -d … genesis-131216.json.age \| grep -c '"chainId": 131216'` = 1; snapshot object present | ☐ |
| E19 | **Sign-off** | — | tick every row above; `ls -la "$OUT"` shows every `*.age` non-empty; decrypt-test one random file: `age -d -i ~/.config/age/hara-backups.txt "$OUT/<file>" \| wc -c`; copy `$OUT` to **two** separate places (password-manager attachment + offline media) | both copies verified | ☐ |

### Teardown order (only after E19)

1. Partner apps (E16 owners confirmed).
2. 131216 services (hara-stateless-2, hara-rpc-1).
3. 131216 chain (hara-v1..v4), then hara-stateful **last** and only once E17 readback is proven.
4. Mainnet NevaCloud nodes — **only after the §0 votes have completed** and `qbft_getValidatorsByBlockNumber("latest")` no longer lists them.
5. Testnet Host B — after the §0 vote, or at the quarterly reset.
