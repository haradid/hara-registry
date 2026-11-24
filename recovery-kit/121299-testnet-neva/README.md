# 121299 — HARA Testnet: the NevaCloud slice (Host B)

Chain ID `121299` ("HARA Testnet"). **3 validators, quorum 3 of 3 — zero fault tolerance**: if any
one validator is down, no blocks are sealed. 5 s blocks. Free gas (the gateway's `gasPriceGuard`
rejects non-zero gas prices). `target-gas-limit` 10 G. Besu `profile=ENTERPRISE`, SNAP sync with
BONSAI trie-log pruning, `tx-pool=sequenced`, `discovery-enabled=false` (static peers only).
Domains `*.mampang.haratoken.app`.

**Quarterly wipe:** cron `0 3 1 1,4,7,10 *` UTC on Host A (`scripts/ops/cleanup_quarterly_reset.sh`)
resets the chain on 1 Jan / 1 Apr / 1 Jul / 1 Oct at 03:00 UTC. The gateway database survives
the reset; chain data and deployed contracts do not.

Host addresses are written as `<TESTNET_HOSTB_IP>` / `<TESTNET_HOSTA_IP>` placeholders (this
repository is mirrored publicly). The names match `../hosts.env.example`; values are in the private
Blockchain repo (`tesnet_server/docs/ARCHITECTURE.md`). The copies under `scripts/`, `host-a-deps/`
and `docs-ref/` were redacted the same way — **fill the placeholders before running any script**
(notably `HOSTB_IP` in `scripts/ops/cleanup_quarterly_reset.sh` and the enode in
`scripts/validator3/config/static-nodes.json`).

## What is on NevaCloud Host B (being replaced)

Host B `<TESTNET_HOSTB_IP>` — 3 vCPU / 3.8 GB, root login, SSH port 22:

| Component | Container / unit | Ports |
|---|---|---|
| validator3 — sealer + failover RPC | `scripts/validator3/docker-compose.yml` | Besu RPC `5797`, WS `5798`, P2P `30305` |
| gateway API | `hara-tesnet-gateway` (Express) | `:4000` / `:4001` |
| dashboard (includes explorer pages) | `hara-tesnet-gateway-dashboard` (Next.js) | `:4002` |
| Postgres | `hara-tesnet-gateway-postgres` | `127.0.0.1:5432` |
| Redis | `hara-tesnet-gateway-redis` | internal |
| forced-command target for the quarterly reset | `validator3_reset_remote.sh` (**host-only**, E15) | SSH |

Losing Host B leaves 2 of 3 validators — below quorum — and the chain halts; every
`*.mampang.haratoken.app` endpoint dies with it. See `../00-PRE-TEARDOWN-EXTRACTION.md` §0.

## What stays on AWS Host A — and Host B depends on it

Host A `<TESTNET_HOSTA_IP>` (SSH port **4422**): validator1 (primary RPC behind the gateway) +
validator2 + **Caddy** (TLS for every `*.mampang.haratoken.app` name, reverse-proxying to Host B's
gateway/dashboard) + netstats + the quarterly-reset cron. That is why `host-a-deps/` is included:
its Caddyfile and netstats compose must be edited when Host B's address changes.

## What is in this directory

| Path | Content | Source |
|---|---|---|
| `scripts/validator3/` | compose, `config/config.toml`, `config/genesis.json`, `config/static-nodes.json`, `.env.example` | `tesnet_server/validator3/` |
| `scripts/gateway/` | gateway + dashboard app, `docker-compose.yml`, `db/`, `.env.example` | `tesnet_server/gateway/` |
| `scripts/ops/*.sh` | `01_generate_node_key.sh`, `02_derive_address_and_genesis.sh`, `03_first_deploy.sh`, `cleanup_quarterly_reset.sh`, `install_cron.sh`, `health_check.sh`, `hara-block-health-watch.sh` | `tesnet_server/scripts/` |
| `scripts/config/genesis.json.template` | genesis template (`"chainId": 121299`) filled by `02_derive_address_and_genesis.sh` | `tesnet_server/config/` |
| `host-a-deps/caddy/`, `host-a-deps/netstats/` | Host A pieces that reference Host B | `tesnet_server/{caddy,netstats}/` |
| `docs-ref/` | ARCHITECTURE, CHANGELOG, CLEANUP_POLICY, DOMAIN_AND_PORTS, GATEWAY_FEATURES, SETUP_GUIDE, BACKLOG, SOURCE-README, `server_access-README.md`, `CREDENTIALS.txt.example`, `access.txt.example`, `QA/` | `tesnet_server/` |

## Faucet

`0x5b701b7c9ef5d641e9270a6f19ed9be9b6a1830b`, 10 HARA per claim, one claim per 24 h. Its private
key is `FAUCET_PRIVATE_KEY` in the gateway `.env` (E15). After a quarterly reset the genesis
allocation refunds it.

## Flags — repo configs are not ground truth

- `docs-ref/ARCHITECTURE.md` §2.3 states that **live `mem_limit` values and RPC flags differ from the
  repo**. Treat everything in `scripts/validator3/` as `repo-derived — verify before cutover` and
  prefer the extracted compose/config (E15).
- `scripts/validator3/config/genesis.json` `extraData` encodes the **pre-fix validator1 address
  `0x7ac4c91a…`**. The live set was corrected on 2026-09-11 by `qbft_proposeValidatorVote`, not by
  changing genesis, so this file does not describe the live validator set. `repo-derived — verify
  before cutover`. (A later reset reverted the live votes; see `../../doc/technical/new-ledger/`
  for the fix procedure.)
- Netstats' firewall is a `DOCKER-USER` iptables rule, not ufw (`recreate.md` §3).
- No Prometheus on the testnet: monitoring is netstats plus two log-only watchdogs.
