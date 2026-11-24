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

Never let the number of **live, signing** validators drop below ⌈2N/3⌉ of the *current* set size N. "5" is only right while N = 7: adding all three replacements first makes N = 10 and the quorum **7**, so destroying old hosts with 5–6 live would halt the chain while you believe you are inside the rule.

| Set size N | Quorum ⌈2N/3⌉ |
|---|---|
| 7 | 5 |
| 8 | 6 |
| 9 | 6 |
| 10 | 7 |

Prefer **add one, confirm, remove one** so N stays at 7–8 and the quorum at 5–6. The same procedure (add, confirm, then remove) was carried out successfully on the testnet on 2026-09-11 (`121299-testnet-neva/docs-ref/CHANGELOG.md`).

### 121299 testnet (`*.mampang.haratoken.app`) — HALTS

**Summary:** chain 121299 has 3 validators and NevaCloud Host B carries 1; destroying it leaves **2 of 3**. The quorum is **2** (⌈2·3/3⌉), so the two remaining validators keep sealing — but with **zero margin**: one more fault, or a restart of validator1 or validator2, halts the chain, and every proposer turn of the missing validator times out, so blocks slow down. (The source docs say "quorum 3 of 3"; that is a misdiagnosis — the testnet ran for weeks on 2 effective signers of 3, see `121299-testnet-neva/docs-ref/CHANGELOG.md`, and the 2026-09-10 halt happened when it dropped to **1**.)

| NevaCloud host | Role | Consequence of loss |
|---|---|---|
| Host B `<TESTNET_HOSTB_IP>` | validator3 (1 of 3) | 2 of 3 remain; quorum is **2** → still sealing, **no fault tolerance left**, slower blocks (timed-out proposer turns) |
| Host B (same box) | gateway `:4000/:4001`, dashboard `:4002`, Postgres, Redis | every `*.mampang.haratoken.app` endpoint dies |

Options: the same add-before-remove procedure (stand up the new validator3 first, vote it in with validator1 + validator2, vote the old one out), **or** accept the degraded chain plus the gateway outage. The testnet is disposable and is wiped every quarter anyway; if the next quarterly reset is close, rebuilding the whole testnet on the new Host B at reset time is the cheaper path. Because 2 of 3 is still a voting majority, a replacement validator with a **new** key can be voted in even after Host B is gone.

### 131216 ledger (`*.ledger.haratrust.io`) — FULL OUTAGE

The entire chain and every service run on NevaCloud, so teardown is a full outage of the ledger, its explorer, Grafana and the Strata console. Before destroying:

- Notify partners: hara-did / Atlas (on hara-did-stg `103.67.244.109`), and the Gapura / Aurum facades (designed, **not yet deployed** — nothing to migrate).
- Halal Passport (`<HALAL_PASSPORT_PROD_IP>`) is a **production application on Polygon Amoy (chainId 80002)**, not a HARA chain. Confirm with its owner before destroying that host; it is not covered by any runbook in this kit.

---

## §1 Setup on the operator laptop

Everything extracted is piped straight into `age` so no plaintext secret ever touches disk.

**Why the helpers check the decrypted size, not the file size:** `age` encrypting *empty* input still
writes a ~200-byte ciphertext, so `test -s` passes when `ssh` failed, the remote path was wrong, or
`sudo cat` errored — and the operator would tick Done on an empty extract. The helpers therefore
check every pipeline stage (`set -o pipefail` + `PIPESTATUS`) **and** decrypt the result to prove it
has content.

```bash
set -o pipefail
export AGE_RECIPIENT="age1fcdr3qk0wuzxy0ynmzj3d28d8m8pfe489wpk6udstzcyccj7l45sjla6e3"   # public key; private half = ~/.config/age/hara-backups.txt
AGE_KEY="$HOME/.config/age/hara-backups.txt"
OUT="$HOME/hara-ops/teardown-$(date +%F)"; mkdir -p "$OUT"; chmod 700 "$OUT"
_check() {  # usage: _check <name> <ssh-status> <age-status>  — fails on any stage error or an empty decrypt
  local n="$1" s="$2" a="$3" bytes
  if [[ "$s" -ne 0 || "$a" -ne 0 ]]; then echo "FAILED: $n (ssh=$s age=$a)"; rm -f "$OUT/$n.age"; return 1; fi
  bytes="$(age -d -i "$AGE_KEY" "$OUT/$n.age" | wc -c)"
  if [[ "$bytes" -eq 0 ]]; then echo "EMPTY: $n (remote produced no bytes)"; rm -f "$OUT/$n.age"; return 1; fi
  echo "ok: $n ($bytes bytes)"
}
grab() {  # usage: grab <ssh-target> <remote-path> <name>   — never prints the file
  ssh "$1" "sudo cat '$2'" | age -r "$AGE_RECIPIENT" > "$OUT/$3.age"
  _check "$3" "${PIPESTATUS[0]}" "${PIPESTATUS[1]}"
}
dumpdb() {  # usage: dumpdb <ssh-target> <pg-container> <db-user> <name>
  ssh "$1" "sudo docker exec $2 pg_dumpall -U $3" | age -r "$AGE_RECIPIENT" > "$OUT/$4.sql.age"
  _check "$4.sql" "${PIPESTATUS[0]}" "${PIPESTATUS[1]}"
}
# Prove you can decrypt BEFORE you rely on any of it:
echo probe | age -r "$AGE_RECIPIENT" | age -d -i "$AGE_KEY"
```

Expected output of the last line: `probe`. If it fails, stop: every file below would be unreadable.
Every `grab`/`dumpdb` prints `ok: <name> (<bytes> bytes)`; any `FAILED:` or `EMPTY:` line means the
item is **not** extracted and the row stays unticked.

---

## §2 Extraction checklist

Paths marked † are `repo-derived — verify before cutover`: confirm each with `ls` on the host before running `grab`. Tick **Done** only after the **Verify** column succeeded.

| # | Item | Lives at | Extract with | Verify | Done |
|---|---|---|---|---|---|
| E1 | `ops/secrets.txt` — master index: Vault unseal 3-of-5, S3 keys, Blockscout `SECRET_KEY_BASE`, console basic-auth, deployer keys | laptop `hara-ledger/ops/secrets.txt` (gitignored); † `/opt/hara/hara-ledger/ops/secrets.txt` on hara-stateless-2 | `age -r "$AGE_RECIPIENT" < ops/secrets.txt > "$OUT/secrets.txt.age"`; also mirror into the password manager | decrypt-and-count only: `age -d -i ~/.config/age/hara-backups.txt "$OUT/secrets.txt.age" \| wc -l` | ☐ |
| E2 | age private key — without it every backup is unreadable | laptop `~/.config/age/hara-backups.txt` only | confirm it is in the password manager **and** on an offline USB | the §1 probe decrypts | ☐ |
| E3 | `backup.env` (`BACKUP_AGE_RECIPIENT`, `RCLONE_TARGET`, `VAULT_APPROLE_*`) | † `/opt/hara/hara-ledger/deploy/ops/backup.env` on hara-stateful and hara-v1..v4 | `grab hara-stateful /opt/hara/hara-ledger/deploy/ops/backup.env backup.env-stateful` — repeat per host | one `ok:` line per host (decrypted bytes > 0) | ☐ |
| E4 | rclone remote `nevacloud-s3` | path from `ssh hara-stateful 'sudo rclone config file'` | `grab hara-stateful <that path> rclone.conf`. If Nevacloud Object Storage is also being left, copy the buckets first (E17) | decrypt-and-count | ☐ |
| E5 | Vault init output (`vault-init-keys-v2.json`: 5 unseal keys + root token) | laptop `~/hara-ops/` + password manager | confirm both copies exist; AppRole `role_id`/`secret_id` pairs are in the E3/E7 env files | `age -d … \| wc -c` > 0 | ☐ |
| E6 | WireGuard keys `/etc/wireguard/wg0.conf` | every 131216 host + hara-did-stg | `grab <host> /etc/wireguard/wg0.conf wg0-<host>`. Optional: new hosts can get new keys from `deploy/ops/wg-bootstrap.sh`; extract only to keep the partner peer (hara-did-stg) unchanged | one `ok:` line per host | ☐ |
| E7 | Per-role `.env` | † `/opt/hara/hara-ledger/deploy/{platform,data,services,chain,rpc}/.env` on their hosts. Laptop holds **partial** gitignored copies; the host copies are authoritative | `grab <host> <path> env-<role>-<host>` | decrypt-and-count per file | ☐ |
| E8 | Blockscout env (`SECRET_KEY_BASE`; `INDEXER_DISABLE_INTERNAL_TRANSACTIONS_FETCHER=true`, host-only and gitignored) | † `deploy/services/blockscout/envs/common-blockscout.env` under `/opt/hara/hara-ledger` on hara-stateless-2 | `grab hara-stateless-2 <path> blockscout.env` | decrypt-and-count | ☐ |
| E9 | DNS zones `haratrust.io` and `haratoken.app` | DNS provider (Cloudflare; see `deploy/edge/cfedit-apiconsole.py`) | export both zones. Needed records: `rpc.ledger`, `explorer.ledger`, `trace.ledger` (hosts the API console), `grafana.platform`, `console.platform` (131216); `rpc.registry`, `dashboard.registry`, `explorer.registry`, `netstats.registry`, `grafana.registry`, `health.registry` (121212); `rpc.mampang`, `dashboard.mampang`, `explorer.mampang`, `netstats.mampang` (121299) | every record listed is present in the export | ☐ |
| E10 | Locally built images not on GHCR: `hara-registry-node`, `hara-alert-sink` | hara-v1..v4 / hara-stateless-2 Docker daemons | optional `docker save <image> \| zstd \| age -r …`; otherwise rebuild from `deploy/chain/node/Dockerfile` and `deploy/platform/alert-sink/Dockerfile` | `docker load` on a scratch box, or Dockerfiles present in repo | ☐ |
| E11 | Vault data — final Raft snapshot | hara-stateful | `ssh hara-stateful 'sudo systemctl start hara-snapshot-vault.service'` (unit name per `deploy/ops/install-backup-timers.sh`; confirm with `systemctl list-units 'hara-*'`) | new object in `hara-backups-vault` with today's date | ☐ |
| E12 | Mainnet NevaCloud validator3/4/5 config **and node key** — host-only, no compose exists in any repo | containers `hara-mainnet-validator{3,4,5}` on `<MAINNET_V3_IP>` / `<MAINNET_V4_IP>` / `<MAINNET_V5_IP>` | per host: `ssh <ip> "sudo docker inspect hara-mainnet-validatorN --format '{{json .Mounts}}'"` to find the config/data dirs, then `grab` `docker-compose.yml`, `config.toml`, `static-nodes.json` and the node `key` file | 4 `ok:` lines per validator; the `key` decrypts to 64 hex chars (`age -d -i "$AGE_KEY" "$OUT/<name>.age" \| wc -c` → 64 or 65) | ☐ |
| E13 | Mainnet `call` node (`hara-mainnet-call`, `sync-mode=FULL`) | `<MAINNET_CALL_IP>` — reached with a **password, not a key** (ARCHITECTURE.md) — security gap, rotate on rebuild | same procedure as E12 | as E12 (`ok:` lines, key decrypts to 64 hex) | ☐ |
| E14 | Mainnet gateway host | `<MAINNET_GATEWAY_IP>` | `grab` the gateway `.env` — it holds **`FAUCET_PRIMARY_PRIVATE_KEY` / `FAUCET_SECONDARY_PRIVATE_KEY`** (they control the prefunded faucet balance), `JWT_SECRET`, `TURNSTILE_SECRET_KEY`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`. Then `dumpdb <MAINNET_GATEWAY_IP> hara-gateway-postgres hara_gw mainnet-gateway` (users / api_keys / usage / faucet_claims). Also `ssh <ip> 'sudo tar -C / -cz etc/nginx etc/letsencrypt' \| age -r "$AGE_RECIPIENT" > "$OUT/gateway-nginx-tls.tgz.age"`. The co-hosted `hara-status` app belongs to a teammate — coordinate before teardown | `ok:` lines for the `.env` and the dump; `age -d -i "$AGE_KEY" "$OUT/gateway-nginx-tls.tgz.age" \| tar -tz \| head` lists `etc/nginx/`; the decrypted `.env` contains `FAUCET_PRIMARY_PRIVATE_KEY=` (`age -d … \| grep -c FAUCET_PRIMARY_PRIVATE_KEY=` → 1) | ☐ |
| E15 | Testnet Host B | `<TESTNET_HOSTB_IP>` | `grab` validator3 `nodekey3`; `grab` the gateway `.env` (`FAUCET_PRIVATE_KEY`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD`); `dumpdb <TESTNET_HOSTB_IP> hara-tesnet-gateway-postgres hara_gw testnet-gateway`; `grab` † `scripts/validator3_reset_remote.sh` (host-only, in no repo) and the `authorized_keys` line carrying the forced command for `hara-quarterly-reset-key` | 5 `ok:` lines; `nodekey3` decrypts to 64 hex chars; the `.env` contains `FAUCET_PRIVATE_KEY=` | ☐ |
| E16 | Partner boxes: hara-did-stg (`103.67.244.109`, HaraDID + Atlas), hara-exchange-stg (`<EXCHANGE_STG_IP>`), halal-passport-prod (`<HALAL_PASSPORT_PROD_IP>`) | their deploy code lives in their own Azure repos (PRODUCT HARA OS: hara-did, hara-atlas, hara-exchange; PRODUCT HALAL PASSPORT: halal-passport) | **their owners** extract their `.env` files and DB dumps. Flag Cloud_2 audit C-001: halal-passport exposes Postgres `:5432` and MinIO `:9000/9001` publicly — close on rebuild | written confirmation from each owner | ☐ |
| E17 | Final off-host backup pass for 131216 | hara-stateful and hara-v1..v4 | `systemctl start` every `hara-snapshot-*.service`, then `bash deploy/ops/s3-readback-check.sh`. **Known blocker: Nevacloud S3 `GetObject 403`** — the credential is write-only, so readback is unproven. Until a read-capable credential proves the objects are retrievable, **do not destroy hara-stateful**. If Nevacloud Object Storage is also being left: `rclone sync nevacloud-s3:<bucket> <new-remote>:<bucket>` for all 7 `hara-backups-*` buckets | `s3-readback-check.sh` exits 0 | ☐ |
| E18 | 131216 chain identity + validator chain data. **`genesis.json` and `static-nodes.json` are not in the repo** (`deploy/chain/genesis/` holds only `.gitkeep`; `init.sh` generates them into a volume) — a same-chain rebuild needs them. Chain data itself is optional (chains re-sync from peers while ≥1 healthy node remains) | hara-v1..v4 genesis/shared volumes (`docker inspect` the validator container for the mount paths) | `grab hara-v1 <genesis-volume>/genesis.json genesis-131216.json` and `grab hara-v1 <shared-volume>/static-nodes.json static-nodes-131216.json`; data via `deploy/ops/snapshot-validator.sh`. Mainnet/testnet have no snapshot tooling and rely on peers | `age -d … genesis-131216.json.age \| grep -c '"chainId": 131216'` = 1; snapshot object present | ☐ |
| E19 | **Sign-off** | — | tick every row above; decrypt-test **every** file, not a sample: `for f in "$OUT"/*.age; do printf '%s %s\n' "$(age -d -i "$AGE_KEY" "$f" \| wc -c)" "$f"; done` — no line may start with `0`; copy `$OUT` to **two** separate places (password-manager attachment + offline media) | both copies verified by re-running the loop on each copy | ☐ |

### Teardown order (only after E19)

1. Partner apps (E16 owners confirmed).
2. 131216 services (hara-stateless-2, hara-rpc-1).
3. 131216 chain (hara-v1..v4), then hara-stateful **last** and only once E17 readback is proven.
4. Mainnet NevaCloud nodes — **only after the §0 votes have completed** and `qbft_getValidatorsByBlockNumber("latest")` no longer lists them.
5. Testnet Host B — after the §0 vote, or at the quarterly reset (the chain keeps sealing at 2 of 3 with no margin; the gateway endpoints are down until the new Host B is up).
