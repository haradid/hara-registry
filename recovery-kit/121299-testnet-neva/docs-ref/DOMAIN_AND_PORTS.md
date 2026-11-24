# Domain & Port Mapping — mampang.haratoken.app

🟢 **LIVE**: HTTPS via Caddy + Let's Encrypt aktif untuk ketiga subdomain di bawah,
sertifikat terverifikasi valid dari luar. Sejak **2026-09-10**, gateway/dashboard pindah ke
Host B (NevaCloud) — lihat [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) untuk topologi
lengkap. Domain TIDAK berubah (DNS tetap ke Host A, Caddy yang proxy ke Host B).

## Server

- Host A (Caddy + compute): `<TESTNET_HOSTA_IP>`, SSH port `4422`, user `ubuntu`, key
  `server_access/testnet-bc-key.pem`
- Host B (gateway+dashboard+DB): `<TESTNET_HOSTB_IP>`, SSH port `22`, user `root`, key
  `server_access/testnet-new-neva`

## URL publik (final)

| URL | Proxy ke | Untuk |
|---|---|---|
| `https://rpc.mampang.haratoken.app/v1/<API_KEY>` | Host B `:4000` (HTTP) | RPC via API key |
| `wss://rpc.mampang.haratoken.app/v1/<API_KEY>` | Host B `:4001` (WS) | RPC via API key, WebSocket |
| `https://rpc.mampang.haratoken.app/v1/public` | Host B `:4000` (HTTP) | RPC tanpa API key — rate limit sangat rendah per-IP (default 1 rps / 100/hari), lihat `GATEWAY_FEATURES.md` |
| `wss://rpc.mampang.haratoken.app/v1/public` | Host B `:4001` (WS) | Sama seperti di atas, WebSocket |
| `https://dashboard.mampang.haratoken.app` | Host B `:4002` | Admin dashboard (kelola user/API key) — **belum dibatasi IP/VPN**, cuma HTTPS |
| `https://dashboard.mampang.haratoken.app/explorer` | Host B `:4002` | Block explorer (publik, tidak perlu login) — lihat `GATEWAY_FEATURES.md` |
| `https://netstats.mampang.haratoken.app` | Host A `127.0.0.1:3001` (lokal, tidak ikut pindah) | Visualisasi jaringan (eth-netstats) |
| `https://explorer.mampang.haratoken.app` | Host B `:4002` (rewrite ke `/explorer`) | 🟢 **Live sejak 2026-09-15** (DNS record ke-4 sudah ada). Sempat ada 2 bug (404 redirect-loop, lalu styling hilang) — sudah diperbaiki hari yang sama, lihat `docs/CHANGELOG.md`. Setara dengan URL `/explorer` di atas, cuma domain berbeda |

Routing HTTP vs WS di `rpc.mampang.haratoken.app` dibedakan otomatis oleh Caddy berdasarkan
header `Connection: Upgrade` / `Upgrade: websocket` (lihat `caddy/Caddyfile`) — satu domain,
satu port 443, Caddy yang mengarahkan ke backend Host B `:4000` atau `:4001`.

## Implementasi

- Reverse proxy: **Caddy** (`caddy:2-alpine`), `network_mode: host`, tetap di Host A meski
  gateway/dashboard pindah ke Host B — lihat `caddy/Caddyfile` + `caddy/docker-compose.yml`.
  Traffic Host A→Host B lewat jaringan publik, dibatasi firewall ke IP satu sama lain saja
  (lihat `docs/ARCHITECTURE.md`).
- TLS: otomatis via Let's Encrypt (ACME) di Host A, tidak perlu campur tangan manual selama
  port 80 & 443 tetap terbuka di Host A.
- DNS: 3 A record (`rpc`, `dashboard`, `netstats`.`mampang.haratoken.app`) → `<TESTNET_HOSTA_IP>`
  (Host A) — **tidak berubah** sejak migrasi gateway ke Host B.

## Status port eksternal (per 2026-09-10, setelah hardening `ufw` + migrasi)

### Host A (`<TESTNET_HOSTA_IP>`)

| Port | Service | Status eksternal | Catatan |
|---|---|---|---|
| 4422/tcp | SSH | 🟢 Open | |
| 80/tcp, 443/tcp+udp | Caddy (ACME + HTTPS) | 🟢 Open | Satu-satunya pintu masuk publik untuk rpc/dashboard/explorer/netstats |
| 30303-30305/tcp+udp | P2P antar-validator | 🟢 Open ke publik | Perlu terbuka karena masing-masing validator konek pakai IP publik-nya sendiri, bukan loopback |
| 9100/tcp, 9545-9547/tcp | node-exporter, metrics Besu | 🔴 Closed ke publik | Sengaja dibatasi (`ufw`) — kalau butuh scrape eksternal, tambah rule per-IP monitoring |
| 5797/tcp, 5798/tcp | RPC HTTP/WS Besu | 🔴 Closed ke publik, 🟢 Open khusus IP Host B (`<TESTNET_HOSTB_IP>`) | Gateway di Host B butuh ini — dibuka lewat `ufw` DAN AWS Security Group (2 lapis, lihat `docs/ARCHITECTURE.md`) |
| 4000-4002/tcp | (tidak lagi relevan di Host A — service sudah pindah) | — | |

### Host B (`<TESTNET_HOSTB_IP>`)

| Port | Service | Status eksternal | Catatan |
|---|---|---|---|
| 22/tcp | SSH | 🟢 Open | |
| 4000-4002/tcp | Gateway HTTP/WS, dashboard | 🔴 Closed ke publik, 🟢 Open khusus IP Host A | Cuma Caddy di Host A yang boleh akses — publik tetap harus lewat domain (443 di Host A) |

## Riwayat keputusan

- 2026-08-27: Sempat disiapkan Caddy + Let's Encrypt gratis via `sslip.io`
  (`<TESTNET_HOSTA_IP>.sslip.io`) sebagai solusi HTTPS cepat tanpa domain — dibatalkan karena
  user mau pasang domain asli di level infra.
- 2026-08-27 (lanjutan, hari yang sama): tim infra pasang 3 DNS record ke
  `mampang.haratoken.app`. Port 80/443 diminta dibuka tambahan (belum termasuk request
  awal). Setelah dibuka, Caddy diaktifkan ulang dengan domain asli (bukan sslip.io) —
  cert Let's Encrypt untuk ketiga domain berhasil di-obtain dan terverifikasi dari luar.
  Gateway/dashboard/netstats dikunci ke loopback-only setelah itu.
