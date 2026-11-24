# Testnet Server — Setup Guide

> **⚠️ Ini adalah runbook bootstrap-dari-nol** (cara menyalakan testnet pertama kali di 1
> server kosong) — bukan gambaran topologi saat ini. Sejak load-splitting 2026-09-10,
> validator3+gateway sudah pindah ke host kedua, dan node `rpc1` yang disebut di bawah
> sudah di-retire (RPC sekarang langsung di validator1, dengan failover ke validator3).
> Untuk topologi & status LIVE saat ini, baca `docs/ARCHITECTURE.md` dan `docs/CHANGELOG.md`
> dulu — dokumen ini tetap berguna untuk memahami urutan bootstrap awal & alasan desainnya.

Topologi awal (saat bootstrap pertama kali): **3 validator QBFT + 1 node RPC, semua di 1
server** (2 vCPU / 4GB RAM / 50GB disk). Lihat root `README.md` untuk kenapa 3 validator,
bukan 1 (temuan bootstrap Besu).

## Perbedaan desain dari `cloud_1`

- **4 proses Besu di 1 server** (cloud_1 punya 6 VM terpisah: 3 validator + 2 RPC +
  1 archive). Di sini semua di-mesh lewat `127.0.0.1` karena satu mesin yang sama.
- **Chain ID/network ID berbeda** (`121299`, bukan `1212`) supaya tidak ada kemungkinan
  tertukar dengan chain produksi.
- **Private key (`keys/nodekey1/2/3`, `nodekey_rpc1`) disimpan TERPISAH dari `data/`
  masing-masing node.** Disengaja: ada reset penuh tiap 3 bulan (lihat
  `docs/CLEANUP_POLICY.md`), key tidak boleh ikut terhapus — kalau ikut terhapus, alamat
  validator baru tidak akan cocok lagi dengan `extraData` di genesis lama dan chain
  berhenti produksi blok.
- **Tanpa Prometheus/Grafana/HAProxy lokal** — RAM 4GB dibagi 4 proses Besu, tidak cukup
  untuk stack itu juga. Hanya `node-exporter` (host metrics, di `rpc1/`) yang jalan. Kalau
  butuh dashboard, arahkan Grafana yang sudah ada di `cloud_1/monitoring` untuk scrape
  target baru: `<TESTNET_SERVER_IP>:9100` (node-exporter) dan `:9545`-`:9548` (metrics
  Besu tiap node).
- **Heap kecil per node** (`512MB` validator, `768MB` rpc1) — total ~2.3GB heap supaya OS +
  Docker + node-exporter tetap kebagian RAM di mesin 4GB. Sudah terverifikasi stabil
  (tidak OOM) selama beberapa menit continuous block production saat testing.
- **`sync-mode="SNAP"` + `bonsai-limit-trie-logs-enabled=true`** di semua node — sama
  seperti cloud_1. SNAP baru bisa dipakai (dan trie-log pruning ikut aktif) setelah
  masalah bootstrap 3-validator ketemu; single-node sempat butuh FULL sebagai workaround
  yang ternyata tidak pernah benar-benar berhasil.

## Kenapa bukan cukup 1 atau 2 validator (ringkasan temuan 2026-08-26)

| Konfigurasi | Hasil |
|---|---|
| 1 validator, FULL/SNAP, berbagai sync-min-peers | Stuck permanen di block 0x0 — tidak ada peer yang bisa "lebih maju" di chain yang baru genesis |
| 1 validator, P2P dimatikan total | Mining coordinator tidak pernah start sama sekali |
| 1 validator + 1 peer non-validator asli | Peer tidak dianggap "berguna" (sama-sama height 0) |
| 2 validator asli, saling static-peer | QBFT round berjalan (`Moved to round 2/3`) tapi tidak pernah finalize blok |
| **3 validator asli, saling static-peer** | **Blok mulai diproduksi, stabil ~5 detik/blok** |

Root cause pastinya belum sepenuhnya jelas (kemungkinan terkait bagaimana Besu menentukan
"initial sync selesai" untuk BFT — perlu jumlah peer/validator tertentu yang belum
terdokumentasi resmi), tapi hasil empirisnya konsisten dan sudah diverifikasi jalan.

## Langkah setup (jalankan di server, setelah server tersedia)

1. **Isi kredensial akses**
   - `cp access.txt.example access.txt` → isi IP, user, port.
   - `cp CREDENTIALS.txt.example CREDENTIALS.txt` → isi setelah step 3.

2. **Install Docker + Docker Compose plugin** (biasanya sudah terpasang di image cloud
   modern — cek dulu dengan `docker --version && docker compose version`).

3. **Generate key & genesis** — dijalankan LANGSUNG di server:
   ```bash
   cd tesnet_server
   bash scripts/01_generate_node_key.sh
   bash scripts/02_derive_address_and_genesis.sh
   ```
   Ini membuat `keys/nodekey1`, `nodekey2`, `nodekey3`, `nodekey_rpc1`, `faucet_key`,
   `keys/addresses.txt`, dan `config/genesis.json` yang disalin ke ke-4 node plus
   `static-nodes.json` mesh per node. Salin isi `keys/addresses.txt` ke `CREDENTIALS.txt`.

4. **Backup `keys/` ke luar server** (mis. secrets manager, encrypted local copy).

5. **Isi `.env` di SETIAP node** (`validator1`, `validator2`, `validator3`, `rpc1`):
   ```bash
   for n in validator1 validator2 validator3 rpc1; do cp $n/.env.example $n/.env; done
   # edit tiap .env: P2P_HOST = IP publik server (sama untuk semua)
   ```

6. **Isi `rpc1/config/config.toml`** — ganti placeholder `<TESTNET_SERVER_PUBLIC_IP>` di
   baris `host-allowlist` dengan IP publik server. Deploy script menolak jalan kalau ini
   belum diganti (fail-closed by design).

7. **Buka firewall/NSG**
   - `30303-30306/tcp+udp` — p2p ke-4 node (kalau server ini juga mau di-peer dari
     testnet server lain nanti)
   - `5797/tcp`, `5798/tcp` — RPC HTTP/WS (di `rpc1`) — **batasi hanya ke IP tepercaya**
   - `9545-9548/tcp`, `9100/tcp` — metrics — batasi ke IP monitoring saja
   - `22/tcp` (atau port SSH custom) — batasi ke IP kantor/VPN kalau memungkinkan

8. **Deploy**
   ```bash
   bash scripts/03_first_deploy.sh
   bash scripts/health_check.sh
   ```

9. **Pasang cron cleanup** (lihat `docs/CLEANUP_POLICY.md` untuk detail sebelum jalan ini)
   ```bash
   bash scripts/install_cron.sh
   ```

## Verifikasi cepat

```bash
curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  http://127.0.0.1:5797
```
Block number harus naik terus setiap ~5 detik. Cek juga `net_peerCount` di `rpc1` — harus
`0x3` (connect ke validator1/2/3).
