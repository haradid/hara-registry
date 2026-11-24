# 131216 — Hara Registry ledger on NevaCloud

Chain ID `131216`, Besu QBFT, 4 validators (quorum 3), 2 s blocks, London EVM. Domains
`rpc.ledger.haratrust.io`, `explorer.ledger.haratrust.io`, `grafana.platform.haratrust.io`,
`console.platform.haratrust.io`. **Every host of this chain is on NevaCloud**, so teardown is a
full outage (see `../00-PRE-TEARDOWN-EXTRACTION.md` §0).

All deployment artifacts live in this repository and are **referenced**, not copied — see
`scripts-manifest.md`. Variables below are from `../hosts.env.example`.

## Host-role matrix

| Host | Public IP var | Mesh IP | Role | Compose / scripts |
|---|---|---|---|---|
| hara-v1 | `LEDGER_V1_PUBLIC_IP` | `10.43.0.11` | Besu QBFT validator 1 | `deploy/chain/docker-compose.validator-only.yml` with `VALIDATOR_ID=1`; `deploy/ops/bringup-validators.sh` |
| hara-v2 | `LEDGER_V2_PUBLIC_IP` | `10.43.0.12` | Besu QBFT validator 2 | same, `VALIDATOR_ID=2` |
| hara-v3 | `LEDGER_V3_PUBLIC_IP` | `10.43.0.13` | Besu QBFT validator 3 | same, `VALIDATOR_ID=3` |
| hara-v4 | `LEDGER_V4_PUBLIC_IP` | `10.43.0.14` | Besu QBFT validator 4 | same, `VALIDATOR_ID=4` |
| hara-rpc-1 | `LEDGER_RPC1_PUBLIC_IP` | `10.43.0.21` | RPC tier: rpc-write + 2× rpc-read + HAProxy 2.9 + autoheal | `deploy/rpc/docker-compose.yml`, `deploy/rpc/lb/haproxy.cfg` |
| hara-stateless-2 | `LEDGER_STATELESS2_PUBLIC_IP` (DNS target) | `10.43.0.25` | services (signer, broadcaster, indexer, rpc-cache, anchor-worker) + Blockscout + Strata console + observability + Caddy edge | `deploy/services/docker-compose.yml`, `deploy/services/docker-compose.console.yml`, `deploy/platform/docker-compose.obs.yml`, `deploy/edge/docker-compose.yml` |
| hara-stateful | `LEDGER_STATEFUL_PUBLIC_IP` | `10.43.0.40` | Vault (Raft) + Postgres 16 + Redis 7 + MinIO; backup timers | `deploy/platform/docker-compose.secrets.yml`, `deploy/data/docker-compose.yml`, `deploy/data/docker-compose.minio.yml`, `deploy/ops/bringup-stateful.sh` |
| hara-did-stg | `LEDGER_DIDSTG_PUBLIC_IP` | `10.43.0.50` | **partner** box: HaraDID + Atlas — own repos (Azure: hara-did, hara-atlas) | not in this repo; mesh peer only |
| hara-exchange-stg | `LEDGER_EXCHANGE_PUBLIC_IP` | — (not on mesh) | **partner** app — own repo (hara-exchange) | not in this repo |
| halal-passport-prod | `LEDGER_HALAL_PUBLIC_IP` | — (not on mesh) | **partner production app on Polygon Amoy**, not a HARA chain | not in this repo; confirm with owner before teardown |

Mesh: `10.43.0.0/24` is the WireGuard mesh (`wg0`). `10.42.0.0/24` is the per-host Docker
bridge and never a host address. Same-host traffic uses container names; cross-host traffic
uses mesh IPs.

## Bring-up order

1. **Provision** — `deploy/ops/cloud-init.yaml` / `deploy/ops/bootstrap-newbox.sh`, operators via `deploy/ops/add-operator.sh`, swap on validators.
2. **WG mesh** — `deploy/ops/wg-bootstrap.sh`; verify `wg show` and cross-host ping on `10.43.0.0/24`.
3. **hara-stateful** — Vault → unseal (3 of 5) → AppRoles → `secrets-bootstrap.sh init` → data tier.
4. **Validators** — same chain (restore genesis + Vault keys) or fresh chain (`deploy/chain/init`), then `bringup-validators.sh`.
5. **hara-rpc-1** — `deploy/rpc` stack; HAProxy stats on `:8404`.
6. **hara-stateless-2 services** — `bringup-stateless.sh`; Blockscout env host-only fix (E8).
7. **Observability** — `docker-compose.obs.yml` + node_exporter + metrics proxies.
8. **Edge** — Caddy; DNS A-records first (E9) so ACME succeeds.
9. **Phase 7** — contracts + anchor-worker (`bringup-phase7.sh`); same-chain rebuilds skip deploys.
10. **Backup timers** — `install-backup-timers.sh` (roles explicit on hara-stateful).
11. **Console** — Strata console + agents.

Details with commands and verify steps: `recreate.md`. Consoles: `monitoring.md`. Backups:
`backup-restore.md`.

## Flags — read before rebuilding

- `deploy/topology.md` is **stale**: it describes the pre-split layout (10.42.x addresses, 6 hosts, a host called "hara-stateless"). Do not rebuild from it; this README and `deploy/README.md` are current.
- The Cloud_2 audit found **Atlas configured to reach the RPC tier at `10.43.0.20`**, an address that does not exist. hara-rpc-1 is `10.43.0.21`. Fix the Atlas config on the partner box during the rebuild.
- Partner boxes (hara-did-stg, hara-exchange-stg, halal-passport-prod) are **not** rebuilt from this repo; their owners rebuild from their own repos and this kit only tells them what changes (new mesh peer config, new RPC address). See E16.
- Hosts listed above as NevaCloud will get new public IPs; mesh IPs and domains stay, so partner configs that use mesh IPs or domains need no change beyond the WireGuard endpoint.
