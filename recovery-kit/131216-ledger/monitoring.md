# 131216 ledger — monitoring consoles

All consoles run on hara-stateless-2 (`10.43.0.25`) from `deploy/platform/docker-compose.obs.yml`
unless noted, scrape over the WireGuard mesh, and are fronted by Caddy (`deploy/edge/Caddyfile`).
Because scrape targets are mesh IPs and the mesh plan is unchanged, no monitoring config needs
editing for a rebuild on new public IPs.

| Console | What it is | Config (repo path) | Host / port | Fronted by |
|---|---|---|---|---|
| **Grafana** | dashboards + datasources | `deploy/platform/grafana/provisioning/datasources/prometheus.yml`, `…/datasources/tempo.yml`, `…/dashboards/dashboards.yml` | hara-stateless-2 `:3000` | Caddy at `grafana.platform.haratrust.io` |
| Grafana dashboards | `besu-overview.json` (chain health, peers, block time), `fleet-overview.json` (node_exporter fleet), `indexer.json`, `rpc-cache.json`, `rpc-tier.json` (HAProxy + rpc-write/read) | `deploy/platform/grafana/provisioning/dashboards/*.json` | — | — |
| **Prometheus** | metrics store + scraper | `deploy/platform/prometheus/prometheus.yml`, `alert_rules.yml` | hara-stateless-2 `:9090` (mesh only) | not exposed |
| **Alertmanager** | alert routing | `deploy/platform/alertmanager/alertmanager.yml` | `:9093` | not exposed |
| **alert-sink** | custom webhook receiver (`hara-alert-sink` image, built locally — E10) | `deploy/platform/alert-sink/sink.mjs`, `Dockerfile` | container | not exposed |
| **Loki + Promtail** | logs | `deploy/platform/loki/loki-config.yml`, `deploy/platform/promtail/promtail-config.yml` | `:3100` | Grafana datasource |
| **Tempo** | traces | `deploy/platform/tempo/tempo.yaml` | `:3200` | Grafana datasource |
| **Blockscout** | explorer, BE 6.10.1 / FE v1.37.1 | `deploy/services/docker-compose.yml`, `deploy/services/blockscout/*` | hara-stateless-2 `:4000` (BE) | Caddy at `explorer.ledger.haratrust.io` |
| **HAProxy stats** | RPC tier pool health | `deploy/rpc/lb/haproxy.cfg` (`bind *:8404`) | hara-rpc-1 `10.43.0.21:8404` | mesh only (`/stats`) |
| **Strata console** | fleet console: `console/` SPA + `console/server` API + per-host `console/agent` on `:8911` | `deploy/services/docker-compose.console.yml`, `deploy/ops/install-console-agent.sh` | hara-stateless-2; agents on every host `:8911` (mesh) | Caddy at `console.platform.haratrust.io` behind `basic_auth` (user `hara`, hash from E1) |
| **API console** | static interactive JSON-RPC/REST console | `api-console/` served from the trace-site mount | `/api-console/*` on the edge | Caddy, same origin as `trace.ledger.haratrust.io` |

## Prometheus scrape jobs (from `deploy/platform/prometheus/prometheus.yml`)

| Job | Targets | Notes |
|---|---|---|
| `besu-validators` | `10.43.0.11:9545` … `10.43.0.14:9545` | Besu metrics via metrics proxy (`install-metrics-proxies.sh`) |
| `besu-rpc-write` | `10.43.0.21:9545` | |
| `besu-rpc-read` | `10.43.0.21:9546`, `10.43.0.21:9547` | |
| `haproxy` | `10.43.0.21:8404` | stats exporter |
| `node` | `:9100` on `.40`, `.21`, `.25`, `.11`–`.14` | node_exporter (`install-node-exporter.sh`) |
| `indexer` | `indexer:9100` | same-host container name |
| `blockscout` | `blockscout:4000` | same-host container name |
| `vault` | `10.43.0.40:8200` | **commented out** in the file — enable if you want Vault seal/health metrics |

Alert rules: `deploy/platform/prometheus/alert_rules.yml`. Routing: Alertmanager → alert-sink.
If alerts must reach a human, wire alert-sink to a notifier; today it only records.

## Rebuild notes

- Grafana admin password and datasource secrets come from `deploy/platform/.env` (E7).
- Dashboards are file-provisioned, so they reappear on first start; no export/import needed.
- Blockscout re-indexes from genesis on a fresh chain. On a same-chain rebuild with restored
  Postgres it resumes.
- The console agents must be reinstalled on every new host (`install-console-agent.sh`); the
  console API discovers them by mesh IP.
