# NevaCloud Recovery Kit

Everything needed to **destroy every HARA NevaCloud VPS safely** and to **recreate every component,
monitoring console and backup mechanism on fresh hosts**, for all three chains that have hosts
there. The design is in
[`docs/superpowers/specs/2026-10-12-nevacloud-recovery-kit-design.md`](../docs/superpowers/specs/2026-10-12-nevacloud-recovery-kit-design.md);
the build plan in
[`docs/superpowers/plans/2026-10-12-nevacloud-recovery-kit.md`](../docs/superpowers/plans/2026-10-12-nevacloud-recovery-kit.md).

The kit contains **no secret values** and **no live host addresses**: secrets are referenced by
Vault path or file location, and live `121212` / `121299` host IPs are `<…_IP>` placeholders.
The header of `hosts.env.example` maps every placeholder to its variable (for example
`<MAINNET_V3_IP>` → `MAINNET_V3_PUBLIC_IP`, `<TESTNET_HOSTB_IP>` → `TESTNET_HOSTB_PUBLIC_IP`) or
marks it reference-only. This repository is mirrored publicly, which is why. The real addresses
live in the private Blockchain repo on Azure DevOps.

## The three chains

| Chain | Network | Domains | NevaCloud hosts (what this kit replaces) | Directory |
|---|---|---|---|---|
| `131216` | Hara Registry ledger (Besu QBFT, 4 validators, 2 s) | `rpc.ledger.haratrust.io`, `explorer.ledger.haratrust.io`, `grafana.platform.haratrust.io`, `console.platform.haratrust.io` | **all of it**: hara-v1..v4, hara-rpc-1, hara-stateless-2, hara-stateful (+ partner boxes hara-did-stg, hara-exchange-stg, halal-passport-prod) | [`131216-ledger/`](131216-ledger/) |
| `121212` | HARA Registry mainnet (Besu 26.6.1 QBFT, 7 validators, 5 s) | `rpc.registry.haratoken.app`, `dashboard.registry.haratoken.app`, `explorer.registry.haratoken.app` | validator3, validator4, validator5, `call` node, gateway host | [`121212-mainnet-neva/`](121212-mainnet-neva/) |
| `121299` | HARA Testnet (Besu QBFT, 3 validators, 5 s, quarterly reset) | `*.mampang.haratoken.app` | Host B (validator3 + gateway + dashboard + Postgres + Redis) | [`121299-testnet-neva/`](121299-testnet-neva/) |

## Order of use

1. **[`00-PRE-TEARDOWN-EXTRACTION.md`](00-PRE-TEARDOWN-EXTRACTION.md)** — the STOP gate (§0: destroying the
   NevaCloud validators first halts mainnet at 4 of 7, and leaves testnet at 2 of 3 with no fault
   tolerance) and the extraction checklist E1–E19. Nothing is destroyed before E19 is signed off.
   [`secrets-inventory.md`](secrets-inventory.md) says where each secret lives.
2. **Fill `hosts.env` outside the repo:** `mkdir -p ~/hara-ops && cp recovery-kit/hosts.env.example ~/hara-ops/hosts.env`,
   replace every `<SUPPLY:…>` and `<…_IP>` placeholder, then `set -a; . ~/hara-ops/hosts.env; set +a`.
   Keep it at `~/hara-ops/hosts.env`, not inside the clone: it holds live addresses, the repo is public,
   and `tools/verify-kit.sh` fails on any `*.env` or public IP it finds under `recovery-kit/`.
3. **Per chain, `recreate.md`:** [`131216-ledger/recreate.md`](131216-ledger/recreate.md),
   [`121212-mainnet-neva/recreate.md`](121212-mainnet-neva/recreate.md),
   [`121299-testnet-neva/recreate.md`](121299-testnet-neva/recreate.md). Each directory's `README.md`
   is the host/role map; `131216-ledger/monitoring.md` covers the consoles.
4. **Restore data:** [`131216-ledger/backup-restore.md`](131216-ledger/backup-restore.md) for the
   ledger's seven backup stores; mainnet/testnet gateway databases come from the E14/E15 dumps.

## Conventions

| Convention | Meaning |
|---|---|
| `<FROM-VAULT:path>`, `<FROM-FILE:path>`, `<SUPPLY:description>` | the only placeholder tokens for secrets |
| `<MAINNET_*_IP>`, `<TESTNET_*_IP>`, `<…_SSLIP_HOST>`, `<…_OLD_IP>` | live or historical host addresses, redacted for the public mirror. Mapping to `hosts.env` variables is in the header of `hosts.env.example` (`<MAINNET_V3_IP>` → `MAINNET_V3_PUBLIC_IP`, `<MAINNET_CALL_IP>` → `MAINNET_CALL_PUBLIC_IP`, `<MAINNET_GATEWAY_IP>` → `MAINNET_GATEWAY_PUBLIC_IP`, `<MAINNET_V1_AWS_IP>` → `MAINNET_HAPROXY_HOST`, `<TESTNET_HOSTB_IP>` → `TESTNET_HOSTB_PUBLIC_IP`, `<TESTNET_HOSTA_IP>` → `TESTNET_HOSTA_PUBLIC_IP`); the rest are reference-only and have no variable. Copied testnet files also carry the upstream placeholders `<TESTNET_SERVER_PUBLIC_IP>`, `<TESTNET_SERVER_IP>`, `<HOST_A_PUBLIC_IP>` (all = Host A) |
| `repo-derived — verify before cutover` | the artifact was built from repository content and could not be checked against a live host; read it before running it |
| **referenced** vs **copied** | `131216-ledger/` references scripts in this repo's `deploy/`, `ops/`, `services/`, `console/` (single source of truth, see `131216-ledger/scripts-manifest.md`); `121212-mainnet-neva/` and `121299-testnet-neva/` hold **copies** taken with `git archive` from the `dattabot/Blockchain` branches `mainnet-final` / `testnet-final`, CRLF-normalised and secret-scanned |
| `MANIFEST.md` | every kit file → its source → its flag; `tools/verify-kit.sh` fails if a file is missing from it |

## How to re-verify the kit

```bash
bash recovery-kit/tools/verify-kit.selftest.sh          # 20/20 passed
BLOCKCHAIN_MAINNET=/path/to/Blockchain-mainnet-final \
BLOCKCHAIN_TESTNET=/path/to/Blockchain-testnet-final \
bash recovery-kit/tools/verify-kit.sh                   # verify-kit: OK
```

`verify-kit.sh` checks: every shell script parses; no CRLF in scripts/configs; no `.env`,
`.env.local` or `*.env` file in the kit; no secret-shaped value (64-hex keys, private-key blocks,
`PASSWORD=…`); no `10.42.0.x` docker-bridge address used as a host; every
`tools/required-content.txt` fact present; every referenced repo and Blockchain path exists; every
file listed in `MANIFEST.md`; no public IPv4 literal — dotted or hyphenated `sslip.io`/`nip.io` form —
outside `tools/ip-scan.allow`. CI runs gitleaks on the same tree.

## Known limits

- **No live access while building.** Everything comes from repositories as of 2026-10-12
  (hara-ledger `main`, Blockchain `mainnet-final` / `testnet-final`). Hosts may have drifted; that is
  what the verify flag and the E12–E15 extractions are for. Known host-only artifacts (validator
  compose files, node keys, gateway `.env`, HAProxy config, `validator3_reset_remote.sh`) exist in no
  repository and are **only** recoverable through `00-PRE-TEARDOWN-EXTRACTION.md`.
- **AWS/Azure hosts are out of scope** but documented where NevaCloud depends on them (mainnet
  validator1 HAProxy/monitoring, testnet Host A Caddy/netstats/cron).
- **Backups are unproven:** the Nevacloud S3 credential is write-only (`GetObject 403`); do not
  destroy hara-stateful until `deploy/ops/s3-readback-check.sh` passes against a readable credential.
- `deploy/topology.md` is stale (10.42.x, 6 hosts); use `131216-ledger/README.md`.
