# Secrets inventory (by reference)

**Never copy values into this kit — this file lists where each secret lives, not what it is.**

Placeholder tokens used throughout the kit: `<FROM-VAULT:path>`, `<FROM-FILE:path>`,
`<SUPPLY:description>`. Addresses (40-hex) are public and may be written; a 64-hex value is a
key or a hash and is never written here. Extraction items (E-numbers) refer to
`00-PRE-TEARDOWN-EXTRACTION.md` §2.

## 131216 ledger (`*.ledger.haratrust.io`)

| Secret | Used by | Lives at (Vault path or file) | Extraction item |
|---|---|---|---|
| Validator keypairs 1–4 | Besu validators (`deploy/chain/init/init.sh` writes them) | `secret/haraledger/validators/{1..4}` | E11 (Vault snapshot) |
| Deployer key | contract deploys, `bringup-phase7.sh` | `secret/haraledger/signer-keys/deployer` | E11 |
| Anchor-worker signer (`0x1083b82AB0F9dC35827edAdf5f7B489cBE10C433`) | anchor-worker service | `secret/haraledger/signer-keys/anchor-worker` | E11 |
| Anchor material | anchor-worker / PQ anchor flow | `secret/haraledger/anchor/*` | E11 |
| Platform admin (`0x944b237097A03E1e8CdE8A0F46605506319EC329`) | admin role on platform contracts | `secret/haraledger/admin-keys/admin-2026-05-27`; laptop copy `~/hara-ops/admin-2026-05-27.json` — **flagged for shredding** in state-09 | E11 (then shred the laptop copy) |
| AppRole credentials | `haraledger-{validator,signer,anchor,snapshot}` | `role_id` / `secret_id` pairs inside the E3 and E7 env files | E3, E7 |
| Vault unseal keys (3-of-5) + root token | Vault operator | `vault-init-keys-v2.json` in laptop `~/hara-ops/` + password manager | E5 |
| age private key | every backup restore | laptop `~/.config/age/hara-backups.txt` | E2 |
| Master secrets index | everything above, S3 keys, Blockscout `SECRET_KEY_BASE`, console basic-auth | `ops/secrets.txt` (gitignored) | E1 |
| `backup.env` (`BACKUP_AGE_RECIPIENT`, `RCLONE_TARGET`, `VAULT_APPROLE_*`) | snapshot timers | `/opt/hara/hara-ledger/deploy/ops/backup.env` on hara-stateful, hara-v1..v4 | E3 |
| rclone remote `nevacloud-s3` (S3 access/secret) | snapshot timers, `s3-readback-check.sh` | rclone config file on hara-stateful | E4 |
| Per-role `.env` | compose stacks platform / data / services / chain / rpc | `/opt/hara/hara-ledger/deploy/<role>/.env` on each host | E7 |
| Blockscout `SECRET_KEY_BASE` | Blockscout backend | `deploy/services/blockscout/envs/common-blockscout.env` on hara-stateless-2 (host-only) | E8 |
| WireGuard private keys | mesh peers (incl. hara-did-stg) | `/etc/wireguard/wg0.conf` per host | E6 |
| Console basic-auth (user `hara`) | Caddy in front of `console.platform.haratrust.io` | `ops/secrets.txt` | E1 |
| Gapura / Aurum facade keys (`ANCHOR_ROLE` signers, ML-DSA-65 seeds) | partner facades — **not yet deployed** | intended for Vault; nothing exists on any host yet | — |

## 121212 mainnet (`*.registry.haratoken.app`)

| Secret | Used by | Lives at | Extraction item |
|---|---|---|---|
| Validator node keys v3 / v4 / v5 | QBFT identity of each NevaCloud validator | Besu data dir `key` file inside each `hara-mainnet-validator{3,4,5}` container mount — **host-only** | E12 |
| `call` node key | `hara-mainnet-call` identity (not a validator) | its data dir `key` file — host-only | E13 |
| `FAUCET_PRIMARY_PRIVATE_KEY`, `FAUCET_SECONDARY_PRIVATE_KEY` | gateway faucet (controls the prefunded balance of faucet `0xb43BC9a81Bb1BA5Db272968956F9E4427b025137`) | gateway `.env` on the gateway host | E14 |
| `JWT_SECRET` | gateway auth / dashboard sessions | gateway `.env` | E14 |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | faucet bot protection | gateway `.env` (+ Cloudflare dashboard) | E14 |
| `BOOTSTRAP_ADMIN_PASSWORD` | first admin login | gateway `.env` | E14 |
| `POSTGRES_PASSWORD` | gateway ↔ `hara-gateway-postgres` | gateway `.env` | E14 |
| Gateway database (users, `api_keys`, usage, `faucet_claims`) | every issued partner API key | `hara-gateway-postgres` | E14 (`dumpdb`) |
| TLS certificates | nginx on the gateway host | `/etc/letsencrypt` | E14 |
| HAProxy config + SSH tunnel keys | validator1 (AWS) pools over SSH tunnels to NevaCloud nodes | `/opt/hara-mainnet/config/haproxy.cfg` and `~/.ssh` on validator1 — **host-only, out of NevaCloud scope** but must be updated for the new IPs | — (see `121212-mainnet-neva/recreate.md` §2) |
| `call` host password | SSH to `<MAINNET_CALL_IP>` (password auth, no key) | operator password store | E13 — replace with key auth on rebuild |

## 121299 testnet (`*.mampang.haratoken.app`)

| Secret | Used by | Lives at | Extraction item |
|---|---|---|---|
| `nodekey3` | validator3 QBFT identity on Host B | validator3 data dir on Host B | E15 |
| `FAUCET_PRIVATE_KEY` | testnet faucet `0x5b701b7c9ef5d641e9270a6f19ed9be9b6a1830b` | gateway `.env` on Host B | E15 |
| `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, `POSTGRES_PASSWORD` | gateway / dashboard / Postgres on Host B | gateway `.env` on Host B | E15 |
| Gateway database | issued testnet API keys, faucet claims | `hara-tesnet-gateway-postgres` on Host B | E15 (`dumpdb`) |
| `hara-quarterly-reset-key` (SSH keypair) | `cleanup_quarterly_reset.sh` on Host A → forced command on Host B | private half on Host A `keys/automation/`; public half in Host B `authorized_keys` with the forced-command prefix | E15 (the `authorized_keys` line) — Host A side is out of NevaCloud scope |
| `validator3_reset_remote.sh` | forced command target on Host B (`stop\|wipe\|start\|status`) | Host B `scripts/` — **host-only, in no repo** | E15 |

## Known plaintext secrets already committed in `dattabot/Blockchain` — rotate; never copied here

These were found while reading the Blockchain repo. They are **not** copied into this kit, and
each should be treated as compromised and rotated on rebuild:

| Where (branch-relative) | What |
|---|---|
| `docs/08_reference.md`, `deploy.sh` (chain 1212 prototype) | validator private keys + VM password |
| `shared_doc_tesnet_and_prod/PROD_ACCESS_AND_GUIDE.md` | admin and Grafana credentials |
| `shared_doc_tesnet_and_prod/TESNET_ACCESS_AND_GUIDE.md` | admin credentials, QA API key |
| `cloud_2/ARSITEKTUR.md` | root SSH password, `HX_NODE_PRIVKEY` |

The copies in `121212-mainnet-neva/docs-ref/` and `121299-testnet-neva/docs-ref/` were taken
only from `mainnet_production/` and `tesnet_server/` and were secret-scanned by
`tools/verify-kit.sh`; none of the files above is included.
