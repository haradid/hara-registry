# HARA Ledger — Testnet Server

Environment testnet untuk development & testing. **Bukan untuk produksi** — reset penuh
tiap 3 bulan (lihat `docs/CLEANUP_POLICY.md`).

## Status

🟢 **Live**, terverifikasi end-to-end (login, buat user, generate API key, klaim faucet, RPC
HTTP+WS — semua dites lewat jalur asli, bukan shortcut).

Sejak **2026-09-10** berjalan di **2 server** (sebelumnya 1), selesai 2 fase: gateway+DB
(Fase 1) dan `validator3` (Fase 2) sama-sama pindah ke Host B. Lihat
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) untuk diagram & penjelasan lengkap topologi
saat ini, dan [`docs/CHANGELOG.md`](docs/CHANGELOG.md) untuk riwayat insiden/perbaikan yang
membentuk arsitektur ini.

✅ **Isu kritis pra-existing (mismatch key `validator1`) — DIPERBAIKI 2026-09-11.**
`validator1` sempat menandatangani dengan key yang alamatnya tidak cocok dengan genesis
sejak setup awal, jadi tidak pernah bisa jadi proposer blok yang sah — diperbaiki via QBFT
live validator vote (tanpa downtime, tanpa reset chain). Sekarang benar-benar 3-dari-3
validator berfungsi penuh, dikonfirmasi round-robin proposer bergilir sempurna ke ketiganya.
Detail lengkap proses perbaikannya: [`docs/CHANGELOG.md`](docs/CHANGELOG.md).

## Spesifikasi

| Item | Value |
|---|---|
| Host A — compute (AWS, `<TESTNET_HOSTA_IP>`) | 2 vCPU / 4GB RAM / 50GB disk — validator1(+RPC), validator2, netstats, Caddy |
| Host B — application+compute (NevaCloud, `<TESTNET_HOSTB_IP>`) | 3 vCPU / 3.8GB RAM — validator3, gateway, dashboard, Postgres, Redis |
| Chain ID / Network ID | 121299 (terpisah dari produksi 121212) |
| Consensus | QBFT, 3 validator (quorum 3 — semua harus online, benar-benar 3-dari-3 sejak 2026-09-11) |
| Block period | 5 detik |
| Gas | Free (`baseFeePerGas` = 0, `min-gas-price` = 0), block gas limit 10,000,000,000 |
| Storage format | BONSAI, trie-log limiting aktif |
| API Gateway | Infura-style: RPC via API key + `/v1/public` tanpa key (rate limit rendah), dashboard dengan faucet + activity monitor |
| HTTPS | Caddy — Let's Encrypt otomatis untuk `*.mampang.haratoken.app` |
| Pembersihan | Full chain reset tiap 3 bulan (Besu saja — gateway/netstats TIDAK ikut reset) |

## Dokumentasi

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — topologi saat ini (2 server), diagram, alasan desain
- [`docs/CHANGELOG.md`](docs/CHANGELOG.md) — riwayat insiden & perbaikan (kronologis)
- [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) — langkah setup lengkap
- [`docs/CLEANUP_POLICY.md`](docs/CLEANUP_POLICY.md) — detail kebijakan reset 3 bulanan
- [`docs/DOMAIN_AND_PORTS.md`](docs/DOMAIN_AND_PORTS.md) — URL publik, port, status firewall
- [`docs/GATEWAY_FEATURES.md`](docs/GATEWAY_FEATURES.md) — faucet, activity monitor, akses publik `/v1/public`
- [`QA/STRESS_TEST_RESULTS.md`](QA/STRESS_TEST_RESULTS.md) — hasil seluruh putaran QA/stress test
- [`BACKLOG.md`](BACKLOG.md) — item yang belum diselesaikan / sengaja ditunda

## Struktur

```
tesnet_server/
├── validator1/                # Host A, merangkap RPC (5797/5798) — lihat docs/CHANGELOG.md
├── validator2/                 # Host A, sama seperti validator1 tapi tanpa RPC
│                                 (validator3 PINDAH ke Host B sejak 2026-09-10 — source-nya
│                                  ada di server itu sendiri, /root/tesnet_server/validator3,
│                                  bukan lagi di repo lokal ini)
├── config/genesis.json.template
├── netstats/                   # eth-netstats — Host A saja; validator3 (Host B) tetap lapor ke sini lewat port 3001 dibatasi DOCKER-USER chain
├── gateway/                     # sumber disalin dari cloud_1/gateway — DEPLOY DI HOST B sejak 2026-09-10
│   ├── docker-compose.yml       # postgres + redis + gateway (proxy) + dashboard (Next.js)
│   ├── gateway/                 # Express HTTP+WS proxy + activity logger, source TS
│   ├── dashboard/                # Next.js admin: users/keys/usage/faucet/activity, source TS
│   ├── db/init/                   # SQL schema
│   └── scripts/cleanup_activity_log.sh   # cron harian, purge rpc_activity_log >30 hari
├── caddy/                      # Reverse proxy + auto-HTTPS — tetap di Host A, proxy ke Host B untuk rpc/dashboard/explorer
│   ├── docker-compose.yml
│   └── Caddyfile
├── keys/                       # nodekey1/2/3, nodekey_rpc1, faucet_key (gitignored)
├── server_access/               # kredensial SSH kedua host (gitignored) — lihat access.txt
├── access.txt, CREDENTIALS.txt  # gitignored — lihat .example untuk formatnya
└── scripts/
    ├── 01_generate_node_key.sh / 02_derive_address_and_genesis.sh / 03_first_deploy.sh
    ├── health_check.sh
    └── cleanup_quarterly_reset.sh, install_cron.sh
```
