# NevaCloud Recovery Kit — Design Spec

> **Public-copy note.** Public IPs of the live `121212` / `121299` hosts and of the partner production boxes are written as `<…_IP>` placeholders here, because this repository is mirrored publicly. The values live in the private Blockchain repo on Azure DevOps (`mainnet_production/docs`, `tesnet_server/docs`) and go into the kit's `hosts.env`, which is never committed.

**Date:** 2026-10-12
**Status:** Approved design (conversational), pending spec review → implementation plan
**Author:** operator + Claude
**Location of deliverable:** `recovery-kit/` at the root of the `hara-ledger` repo

---

## 1. Purpose & success criteria

The operator is about to **destroy all NevaCloud VPSes** across every HARA chain and
needs a single, versioned kit that makes the teardown safe and the rebuild possible —
on fresh VPSes, potentially at a different provider or different IPs.

**Success =** with this kit (plus the off-host secrets it tells you to extract first),
the operator can:
1. Extract everything host-only **before** destroying anything, so nothing
   irrecoverable is lost (Vault unseal keys, age key, S3 creds, etc.).
2. Stand each NevaCloud component back up, in the correct order, on new hosts — chain
   nodes, services, **monitoring consoles**, and the **backup mechanism** — by filling
   in one variables file and following per-host runbooks.
3. Restore state (chain data, Postgres/PITR, Vault, MinIO) from the off-host backups.

**Non-success / out of scope:** this is **not** a live migration tool and does not touch
running hosts (no SSH, repo-artifacts only). It documents the NevaCloud slice of each
chain plus cross-cloud dependencies — it does not recreate the AWS/Azure hosts of the
mainnet/testnet.

## 2. Context — the three chains and their NevaCloud footprint

Assembled from two repos (no live access):
- `hara-ledger` (this repo) — the **131216** "Hara Registry" ecosystem: `deploy/`, `chain/`, `services/`, `console/`.
- `dattabot/Blockchain` (cloned read-only at `C:\Projects\claude_projects\_external\blockchain*`) — `cloud_2/` (131216 audit), `mainnet_production/` (121212), `tesnet_server/` (121299).

| Chain | NevaCloud hosts in scope | Source of scripts |
|---|---|---|
| **131216** ledger (`ledger.haratrust.io`) | hara-stateful (.40), hara-rpc-1 (.21), hara-stateless-2 (.25), hara-v1..v4 (.11–.14), hara-did-stg (.50), hara-exchange-stg, halal-passport-prod | `hara-ledger/deploy/**` (already `.env`-parameterized) |
| **121212** mainnet | validator3/4/5, rpc2/call (`<MAINNET_CALL_IP>`), gateway host `<MAINNET_GATEWAY_IP>` | `Blockchain/mainnet_production/**` (copied into kit) |
| **121299** testnet | Host B `<TESTNET_HOSTB_IP>` (validator3 + gateway + dashboard + pg + redis) | `Blockchain/tesnet_server/**` (copied into kit) |

Mesh truth: **`10.43.0.0/24`** (WireGuard, cross-host). `10.42.0.0/24` is the per-host
Docker bridge only. `deploy/topology.md`'s older 6-host/`10.42.x` layout is **stale** and
must be flagged wherever it would mislead a rebuild.

## 3. Deliverable structure

```
recovery-kit/
├── README.md                     # orientation: 3 chains, NevaCloud hosts, destroy→recreate flow, how to use the kit + hosts.env
├── 00-PRE-TEARDOWN-EXTRACTION.md # ⚠ BEFORE destroying anything: extract the host-only items (§5), verify backups readable off-host
├── hosts.env.example             # central variables (hostnames, public IPs, mesh IPs/subnet, domains, S3) — drives every runbook
├── secrets-inventory.md          # every secret by REFERENCE (Vault path / file location) — never a value
├── MANIFEST.md                   # every kit file, its source repo path, and "repo-derived — verify vs host" flags
├── 131216-ledger/
│   ├── README.md                 # host-role matrix + exact bring-up ORDER
│   ├── recreate.md               # cloud-init → WG mesh → Vault raft init+unseal → secrets-bootstrap → data → validators → rpc → services → obs → edge → contracts/anchor-worker
│   ├── monitoring.md             # Grafana+dashboards, Prometheus targets, Loki/Tempo/Alertmanager, Blockscout, HAProxy stats, Strata console, api-console
│   ├── backup-restore.md         # age+rclone+S3+PITR: what/where/cadence, restore recipes, drills
│   └── scripts-manifest.md       # references deploy/ops + deploy/chain + deploy/* scripts with purpose + invocation order (NOT copied — single-sourced in this repo)
├── 121212-mainnet-neva/
│   ├── README.md                 # NevaCloud vs AWS/Azure host split; cross-cloud deps (HAProxy/SSH tunnels on AWS validator1)
│   ├── recreate.md               # recreate a NevaCloud validator / the call node / the gateway box
│   └── scripts/                  # COPIED from Blockchain/mainnet_production (start scripts, compose, genesis, static-nodes, health-watch)
├── 121299-testnet-neva/
│   ├── README.md                 # Host B role, Caddy-on-Host-A dependency, quarterly-reset Host A↔B coordination
│   ├── recreate.md
│   └── scripts/                  # COPIED from Blockchain/tesnet_server (deploy, cleanup_quarterly_reset, health scripts, gateway compose)
```

## 4. Conventions

- **Secrets by reference only.** Never copy a secret value into the kit. Reference the
  Vault path (`secret/haraledger/...`) or the host/operator-laptop file location.
  Consistent with the existing `secrets-locations` policy.
- **Source-tagged.** Every copied/derived artifact names its origin repo path in `MANIFEST.md`.
- **Repo-derived verify flag.** Anything that could not be confirmed against a live host
  (gitignored on-host env, testnet configs known to have drifted, Blockscout `SECRET_KEY_BASE`)
  is marked **"repo-derived — verify before cutover."**
- **IP/domain abstraction.** All hardcoded IPs/domains are lifted into `hosts.env.example`;
  runbooks reference variables so a new deployment retargets by editing one file.
- **131216 copy-vs-reference:** 131216 scripts are referenced (single-sourced in `deploy/`),
  not duplicated. 121212/121299 scripts are physically copied (they live in the other repo).

## 5. Host-only items the kit must enumerate (NOT in any repo)

The pre-teardown doc's extraction checklist (highest-priority content):
1. `ops/secrets.txt` — master index (Vault unseal 3-of-5, age key ref, Nevacloud S3 keys, Blockscout `SECRET_KEY_BASE`, console basic-auth, deployer keys).
2. age private key `~/.config/age/hara-backups.txt` (operator laptop) — without it every backup is undecryptable.
3. `deploy/ops/backup.env` (host-only) — `BACKUP_AGE_RECIPIENT`, `RCLONE_TARGET`, `VAULT_APPROLE_*`.
4. rclone `nevacloud-s3` remote config + Nevacloud bucket/service-account.
5. Vault init output `vault-init-keys.json` + AppRole `role_id`/`secret_id` pairs.
6. WireGuard private keys (per host).
7. The 5 generated per-role `.env` files.
8. SSH key placeholder in `cloud-init.yaml` (must be replaced).
9. DNS A-records for the 4 hostnames (provider-side; Caddy ACME needs them).
10. Locally-built images not in GHCR: `hara-registry-node` (Besu), `hara-alert-sink`.
11. Topology drift note (`deploy/topology.md` stale IPs/host-count).

Plus the equivalent host-only items for mainnet/testnet (node keys, gateway Postgres creds,
Caddy certs) which are gitignored in the Blockchain repo.

## 6. Backup & restore coverage (131216)

Document the existing mechanism (do not re-invent): age-encrypted → rclone → Nevacloud S3,
scheduled by `install-backup-timers.sh` systemd timers. Stores: PG logical (02:00), PG base
(01:30), PG WAL / PITR (every 10 min), Redis RDB (02:30), MinIO (02:45), Validator chain data
(03:00 staggered), Vault Raft (04:00). PITR window: WAL 14d, base 21d, ≤5 min RPO. Restore
recipes + the 4 drills (`snapshot-restore-drill`, `pitr-restore-drill`,
`validator-snapshot-restore-drill`, `s3-readback-check`). Note the known
**Nevacloud S3 GetObject 403** blocker that gates readback validation. For mainnet/testnet,
document their thinner backup posture (no automated Postgres backup; chain data disposable).

## 7. Monitoring consoles coverage

Per chain, document how each console is re-provisioned:
- **131216:** Grafana (provisioned datasources + 5 dashboard JSONs), Prometheus (scrape
  targets by WG IP), Loki/Promtail, Tempo, Alertmanager + custom alert-sink, Blockscout
  BE/FE, HAProxy stats, the **Strata console** (`console/` SPA + read-only API + per-host
  agent), static `api-console/`. All fronted by Caddy (`deploy/edge/Caddyfile`) with the
  domain list.
- **121212 mainnet:** Prometheus 3.5.0 + Grafana 12.1.0 + custom netstats on AWS validator1
  (note: the monitoring hub is AWS, not NevaCloud — document the dependency), dormant Alertmanager.
- **121299 testnet:** netstats-only + log-only health/mem-watch timers.

## 8. Open risks / caveats to carry into the kit

- No live access → on-host drift is possible; the verify-before-cutover flags are the mitigation.
- Mainnet/testnet monitoring + edge live on AWS/Azure hosts; NevaCloud-only rebuild is partial
  for those chains and the runbooks say so explicitly.
- Secrets extraction is the single point of failure for recovery — the pre-teardown doc is
  the most important artifact in the kit.
