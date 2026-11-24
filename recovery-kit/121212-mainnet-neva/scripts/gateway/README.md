# Gateway — API Key RPC + Dashboard untuk Mainnet chainId 121212

Layanan "seperti Infura" di depan 4 node RPC (write1/write2/call/archive), meniru arsitektur `cloud_1/gateway/` + fitur `/v1/public` dari `tesnet_server/gateway/`. Live di `*.registry.haratoken.app`.

## Struktur

| Folder | Isi |
|---|---|
| `gateway/` | Express app (TypeScript) — auth API key, rate-limit, routing 3-jalur (write/call/archive), proxy ke HAProxy |
| `dashboard/` | Next.js — kelola user/API key/usage, admin login (salinan langsung dari `cloud_1/gateway/dashboard/`) |
| `db/init/` | Schema Postgres (users, api_keys, usage_hourly, alert_recipients, rpc_activity_log, audit_log) |
| `docker-compose.yml` | Postgres + Redis + gateway + dashboard, 4 container |
| `.env.example` | Template — isi sesungguhnya (`.env`) ada di server (`/opt/hara-gateway/.env`), TIDAK di repo |

## Deployment Aktual

**Host:** validator2 (Azure, `<MAINNET_V2_IP>` — IP publik berubah 2026-09-28, host fisik sama, lihat `../docs/STATUS_TERDEPLOY_2026-08-20.md` §23a) — dipilih karena resource paling lega dibanding host lain, BUKAN host tempat HAProxy jalan (beda dari pola `cloud_1` yang co-locate gateway dengan HAProxy). Konsekuensinya: gateway connect ke HAProxy lewat IP publik (`<MAINNET_V1_AWS_IP>:5797` dst), bukan loopback — 1 network hop tambahan, tapi terbukti tidak masalah (lihat hasil stress test di `../docs/STATUS_TERDEPLOY_2026-08-20.md` §12). (Host ini dulu juga menampung `corp1` dan `write2`/`rpc2` — keduanya pindah ke host baru pada migrasi 2026-09-15, lihat `../docs/STATUS_TERDEPLOY_2026-08-20.md` §19; gateway sendiri TIDAK ikut pindah.)

**Path di server:** `/opt/hara-gateway/`
**Path Caddy (reverse proxy + TLS) di server yang SAMA:** `/opt/hara-caddy/` — container terpisah, bukan bagian dari `docker-compose.yml` gateway.

## Domain Publik

| URL | Untuk |
|---|---|
| `https://rpc.registry.haratoken.app/v1/<API_KEY>` | RPC HTTP dengan API key |
| `wss://rpc.registry.haratoken.app/v1/<API_KEY>` | RPC WebSocket dengan API key |
| `https://rpc.registry.haratoken.app/v1/public` | RPC HTTP tanpa API key — **rate limit sangat kecil** (1 rps / 50 per hari per IP) |
| `wss://rpc.registry.haratoken.app/v1/public` | Sama, WebSocket |
| `https://dashboard.registry.haratoken.app` | Kelola user/API key |
| `https://dashboard.registry.haratoken.app/faucet` | Klaim token whitelist-only (publik, tanpa login) |

## Halaman Dashboard (login admin, kecuali `/faucet`)

| Path | Isi |
|---|---|
| `/users`, `/users/[id]` | CRUD user + generate/revoke API key per user |
| `/api-keys` | Daftar semua API key lintas user |
| `/usage` | Ringkasan pemakaian per key (stat card + tabel hourly) |
| `/activity` | **Baru 2026-08-28** — Activity Monitor: 50 request RPC terakhir + 50 aksi admin terakhir, real-time (tabel `rpc_activity_log`/`audit_log`, dibuat awal untuk `/v1/public` tapi baru diekspos sebagai halaman sekarang) |
| `/recipients` | Kelola whitelist on-chain kontrak faucet (`HaraFaucetWhitelist`) |
| `/alert-recipients` | Kelola penerima email alert dari Alertmanager |
| `/faucet` | Halaman publik klaim faucet (Turnstile + whitelist check) |

**Tema dashboard disamakan dengan `tesnet_server/gateway/dashboard/` 2026-08-28** — sebelumnya
tanpa styling sama sekali (`system-ui` polos, warisan dari `cloud_1/gateway/dashboard/`).
Sekarang pakai `globals.css` yang sama persis (dark + neon-green, kartu/badge/tabel/tombol
pill) — file disalin langsung dari tesnet, semua halaman direstyle mengikuti class yang sama
tanpa mengubah logic/query apa pun. Brand nav dibedakan ("HARA Mainnet" vs tesnet-nya "HARA
Gateway") supaya tidak tertukar kalau kedua dashboard dibuka bersamaan.

## Arsitektur Routing (3 Jalur)

Middleware `gateway/src/tx/archiveRouter.ts` mengklasifikasi tiap request JSON-RPC dan memilih backend:

1. **`eth_sendRawTransaction`** → write pool (`rpc1`+`write2`, round-robin biasa via HAProxy — SENGAJA tidak pakai sticky-hash/nonce-lock, lihat alasan di `../docs/STATUS_TERDEPLOY_2026-08-20.md` §11)
2. **`debug_*`/`trace_*`** → archive pool (satu-satunya node dengan API itu aktif)
3. **State-trie query dengan blockTag historis eksplisit** (`eth_call`/`eth_getBalance`/`eth_getCode`/`eth_getStorageAt`/`eth_getTransactionCount` dengan block number bukan `latest`/`pending`) → archive
4. **Semua read lain** (termasuk `eth_getLogs`/`eth_getBlockByNumber` — BUKAN state-trie query jadi tidak perlu archive) → call pool

Batch JSON-RPC campuran: kalau ada 1 item yang butuh archive, seluruh batch ke archive (keputusan sadar, bukan default — lihat plan file).

**nonceGuard sengaja TIDAK diaktifkan** — sudah pernah dicoba di `cloud_1`/`tesnet_server`, terbukti bikin false-rejection di beban tinggi. Lihat memori sesi `nonce_guard_perf_lesson` untuk detail root cause.

## Kredensial & Operasional

Semua kredensial (password Postgres, JWT secret, admin dashboard) ada di `../access/GATEWAY_CREDENTIALS.md` (gitignored, TIDAK ada di repo git). API key test/QA juga dicatat di sana.

## Cara Deploy Ulang / Update

```bash
# dari mesin kerja, sync perubahan source:
scp -i <key> -P 4422 gateway/src/<file>.ts azureuser@<MAINNET_V2_IP>:/tmp/
ssh -i <key> -p 4422 azureuser@<MAINNET_V2_IP> "mv /tmp/<file>.ts /opt/hara-gateway/gateway/src/<path>/"

# di server:
cd /opt/hara-gateway
sudo docker compose build gateway   # atau dashboard
sudo docker compose up -d gateway
```

Migration DB baru (file di `db/init/00X_*.sql`) TIDAK auto-jalan kalau volume Postgres sudah ada isi (`docker-entrypoint-initdb.d` cuma jalan sekali saat volume kosong) — apply manual:
```bash
sudo docker exec -i hara-gateway-postgres psql -U hara_gw -d hara_gateway < db/init/00X_nama.sql
```

## Referensi

- Rencana desain lengkap (termasuk alasan penolakan sticky-routing/nonce-lock): `C:\Users\naufa\.claude\plans\coba-kamu-cek-dulu-fluttering-axolotl.md`
- Status deployment + hasil stress test: `../docs/STATUS_TERDEPLOY_2026-08-20.md` §11-12
- Referensi arsitektur asli: `../../cloud_1/gateway/`, `../../tesnet_server/gateway/`
