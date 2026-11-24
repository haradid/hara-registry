# 121212 — HARA Registry mainnet: the NevaCloud slice

Chain ID `121212`, Besu `hyperledger/besu:26.6.1`, QBFT with 5 s blocks (`blockperiodseconds 5`,
`requesttimeoutseconds 10`, `epochlength 30000`), `zeroBaseFee`,
gas limit `0x2540be400` (10 G). **7 validators, quorum 5.** Domains `*.registry.haratoken.app`.
Data is permanent (no resets).

Host addresses are written as `<MAINNET_*_IP>` placeholders (this repository is mirrored
publicly). The names match the variables in `../hosts.env.example`; the current values are in
the private Blockchain repo (`mainnet_production/docs/ARCHITECTURE.md`). The copies under
`docs-ref/` and `scripts/` were redacted the same way (see `../MANIFEST.md`).

## What is on NevaCloud (being replaced)

| Host | Role | Size | Notes |
|---|---|---|---|
| validator3 `<MAINNET_V3_IP>` | QBFT validator (`hara-mainnet-validator3`) | 3 vCPU / 3.8 GB / 60 GB | mem_limit raised to 3072m on 2026-10-09 after OOMs; `cpus: 0.7` cap removed 2026-10-12 (it caused 15 s block gaps) |
| validator4 `<MAINNET_V4_IP>` | QBFT validator (`hara-mainnet-validator4`) | 3 vCPU / 3.8 GB / 60 GB | same |
| validator5 `<MAINNET_V5_IP>` | QBFT validator (`hara-mainnet-validator5`) | 3 vCPU / 3.8 GB / 60 GB | same |
| `call` `<MAINNET_CALL_IP>` | `hara-mainnet-call`: read pool member + write failover, `sync-mode=FULL` | — | reached by **password SSH** (security gap, E13) |
| gateway host `<MAINNET_GATEWAY_IP>` | gateway API + dashboard + Postgres + Redis + nginx/certbot; DNS target for `rpc.registry` and `dashboard.registry` | — | moved here from Azure validator2 on 2026-09-30; also hosts a teammate's `hara-status` app |

Destroying the three validators first drops the set to 4 of 7 — below quorum — and **halts the
chain**: read `../00-PRE-TEARDOWN-EXTRACTION.md` §0 (add-before-remove) before anything else.

## What stays on AWS / Azure — and NevaCloud depends on it

| Host | Role |
|---|---|
| validator1 `<MAINNET_V1_AWS_IP>` (AWS) | QBFT validator; **HAProxy** with 4 pools (`rpc_tx` write, `call_frontend` 5799 read, …) over local SSH tunnels to the other nodes; Prometheus 3.5.0, Grafana 12.1.0, netstats, Caddy for `grafana.registry` / `netstats.registry` |
| validator2 `<MAINNET_V2_IP>` (Azure) | QBFT validator (IP changed 2026-09-28; the gateway used to run here) |
| validator6 `<MAINNET_V6_IP>` | QBFT validator |
| validator7 `<MAINNET_V7_IP>` | QBFT validator (IP changed 2026-09-28) |
| rpc1 `<MAINNET_RPC1_IP>` | public RPC pool member |
| archive + Blockscout `<MAINNET_ARCHIVE_IP>` (AWS) | archive node + explorer at `explorer.registry.haratoken.app` |

The new NevaCloud nodes must be re-registered on validator1: SSH tunnel targets, HAProxy
backends, firewall allow-list and `permitopen` entries — see `recreate.md` §2.

## What is in this directory

| Path | Content |
|---|---|
| `scripts/config/genesis.json`, `scripts/config/static-nodes.json` | chain genesis (`"chainId": 121212`) and the enode list — the only chain files in the repo |
| `scripts/gateway/` | gateway application: `docker-compose.yml`, `gateway/` (Express/TypeScript API, `src/config.ts`), `dashboard/` (Next.js), `db/` (SQL), `.env.example` |
| `scripts/hara-block-health-watch.sh` | log-only block-production watchdog (systemd timer, 5 min) |
| `docs-ref/` | copies of `mainnet_production/docs/*` (ARCHITECTURE, runbooks, status), `SOURCE-README.md`, `BACKLOG.md`, `QA/STRESS_TEST_RESULTS.md`, `diagrams/` |

## Host-only artifacts — exist in no repository

These are host-only: they can only come from the live hosts (`../00-PRE-TEARDOWN-EXTRACTION.md` E12–E14):

- the **validator and `call` compose files**, `config.toml` and **node key files** (the validator identity);
- the gateway `.env` (faucet private keys, JWT secret, Turnstile, admin and Postgres passwords) and the gateway **database**;
- nginx vhosts and Let's Encrypt certificates on the gateway host;
- the HAProxy config on validator1 (`/opt/hara-mainnet/config/haproxy.cfg`) and its SSH tunnel keys — not NevaCloud, but it must be edited for the new IPs.

The parameter lists in `recreate.md` are a fallback reconstruction from `docs-ref/` and are
flagged `repo-derived — verify before cutover`; the extracted files are authoritative.

## Monitoring

Monitoring lives on **AWS validator1**, not on NevaCloud. Prometheus there scrapes 9
`besu-mainnet` targets (validator1–7, rpc1, `call`); the `call`, validator3/4/5 targets must be
re-pointed to the new addresses. **Alertmanager is dormant** (not wired to any notifier), so
nothing alerts on the archive host's disk (about 54 % used on 2026-10-12, projected full around
2026-10-26). External status page: `health.registry.haratoken.app`. `scripts/hara-block-health-watch.sh`
runs on validator1 as a 5-minute timer and only logs.

## Flags

- `scripts/gateway/.env.example` comments still say the gateway runs on validator2 (Azure); that
  has been stale since 2026-09-30 — the gateway runs on the NevaCloud gateway host.
- `docs-ref/STATUS_TERDEPLOY_2026-08-20.md` predates the 2026-09-28 IP changes and the gateway
  move; read `docs-ref/ARCHITECTURE.md` first.
- Historical addresses in `docs-ref/` were redacted to `<MAINNET_V2_OLD_IP>`, `<MAINNET_V7_OLD_IP>`,
  `<OLD_ARCHIVE_NEVA_IP>` (destroyed host) and `<NEVA_NET_GATEWAY_IP>`; none is needed for a rebuild.
