# Mainnet — Arsitektur Saat Ini (2026-09-29, diperbarui 2026-09-30)

Snapshot topologi & desain LIVE, disusun ulang dari nol lewat verifikasi langsung ke
kesembilan dari sepuluh host (SSH langsung, bukan asumsi dari dokumen lama) — satu host
(`rpc2`/`call`) belum sempat diverifikasi ulang aksesnya, ditandai di bawah. Berbeda dari
`docs/STATUS_TERDEPLOY_2026-08-20.md` (log historis berformat append-only, isinya narasi
kronologis tiap insiden sejak 2026-08-20) — dokumen ini HANYA menggambarkan kondisi
sekarang, tanpa cerita "kenapa" lengkap (untuk itu, ikuti pointer §-nya ke
STATUS_TERDEPLOY).

## Ringkasan Chain

| Item | Value |
|---|---|
| Chain ID / Network ID | `121212` |
| Consensus | QBFT, 7 validator (validator1-5 + corp1/"validator-6" + corp2/"validator-7") |
| Block time | ~5 detik |
| Gas | Gratis (`baseFeePerGas`=0, `min-gas-price`=0) |
| Besu version | `hyperledger/besu:26.6.1` (konsisten di semua node yang dicek) |
| Data | Permanen, tidak ada reset terjadwal |

## Topologi Host — 10 Host, 3 Cloud Provider

Spesifikasi (vCPU/RAM/disk) dan daftar engine per host diverifikasi langsung 2026-09-29
via `nproc`/`free -h`/`df -h`/`docker ps` di tiap host (kecuali `rpc2`/`call`, lihat
catatan di bawah tabel).

| Host (IP) | Provider | Spek (vCPU / RAM / Disk total, free) | Peran | Engine yang jalan |
|---|---|---|---|---|
| `<MAINNET_V1_AWS_IP>` | AWS | 2 / 7.6GB / 96GB (75GB free) | validator1 (sealer) + hub monitoring + tunnel ke 5 host baru | `hara-mainnet-validator1` (Besu), `hara-mainnet-haproxy` (haproxy:2.9-alpine), `hara-mainnet-prometheus` (v3.5.0), `hara-mainnet-grafana` (12.1.0), `hara-mainnet-netstats` (arm64-geo-v3), `hara-mainnet-caddy` (2-alpine), `hara-mainnet-node-exporter` (v1.9.1) |
| `<MAINNET_V2_IP>` (dulu `<MAINNET_V2_OLD_IP>`, IP berubah 2026-09-28) | Azure | 2 / 7.7GB / 123GB (97GB free) | validator2 (sealer) SAJA — stack gateway didekomisioning penuh 2026-09-30 | `hara-mainnet-validator2` (Besu; `cpus` 1.8, dinaikkan dari 0.7 pada 2026-10-12), `hara-mainnet-node-exporter` |
| `<MAINNET_V3_IP>` | NevaCloud | 3 / 3.8GB / 60GB (49GB free) | validator3 (sealer) | `hara-mainnet-validator3` (Besu), `hara-mainnet-node-exporter` |
| `<MAINNET_V4_IP>` | NevaCloud | 3 / 3.8GB / 60GB (46GB free) | validator4 (sealer) — `hara-faucet-app` lama sempat aktif lagi di sini, sudah didekomisioning permanen 2026-09-16 | `hara-mainnet-validator4` (Besu), `hara-mainnet-node-exporter` |
| `<MAINNET_V5_IP>` | NevaCloud | 3 / 3.8GB / 60GB (52GB free) | validator5 (sealer) | `hara-mainnet-validator5` (Besu), `hara-mainnet-node-exporter` |
| `<MAINNET_V6_IP>` | AWS | 2 / 3.7GB / 96GB (90GB free) | corp1 / "validator-6" (sealer) | `hara-mainnet-validator6` (Besu; **`cpus: 0.7` — masih ter-throttle, rencana dinaikkan, lihat BACKLOG**), `hara-mainnet-node-exporter` |
| `<MAINNET_V7_IP>` (dulu `<MAINNET_V7_OLD_IP>`, IP berubah lagi 2026-09-28) | Azure | 2 / 7.7GB / 123GB (118GB free) | corp2 / "validator-7" (sealer) | `hara-mainnet-validator7` (Besu), `hara-mainnet-node-exporter` |
| `<MAINNET_RPC1_IP>` | AWS | 2 / 7.6GB / 145GB (139GB free) | rpc1 (write pool) | `hara-mainnet-rpc1` (Besu) |
| `<MAINNET_CALL_IP>` | NevaCloud | 3 / 3.8GB / 60GB (50GB free) | rpc2-backup (write failover) + call (read pool), digabung jadi 1 proses sejak 2026-09-30 | `hara-mainnet-call` (Besu, `sync-mode=FULL`, sekaligus melayani port write-backup 7797/7798) — akses langsung dikonfirmasi 2026-09-29 (password, bukan key). Container standalone `hara-mainnet-rpc2` **sudah tidak ada lagi** (dihapus dari `docker-compose.yml` 2026-09-30, perannya diserap `call`). `cpus` dinaikkan `0.35`→`2.0` 2026-09-30 (host ini sekarang 1 container tunggal, sebelumnya 0.35 core adalah sisa era 2-container). `hara-mainnet-node-exporter` dipasang 2026-10-09 (hanya `127.0.0.1:9100`, lihat §Monitoring) — sebelumnya satu-satunya host tanpa metrik CPU/steal/iowait. `mem_limit` kini 3072m, `cpus` 2.75. |
| `<MAINNET_ARCHIVE_IP>` | AWS | 4 (dicek 2026-10-12; dokumen lama menulis 2) / 7.7GB / 207GB (≈95GB free, 54% used per 2026-10-12; sempat 113GB free setelah pembersihan 2026-10-09; di 2026-09-29 tercatat 3.7GB RAM / 96GB disk, sudah di-resize setelahnya). **Disk tumbuh mengikuti jumlah transaksi** — Besu archive `FOREST`+`FULL` tanpa pruning (±40GB) + DB Blockscout (±17GB); lihat BACKLOG | archive (histori penuh) + Blockscout penuh | `hara-mainnet-archive-bootnode` (Besu), `hara-mainnet-blockscout-backend` (7.0.2), `hara-mainnet-blockscout-frontend` (v2.10.1), `hara-mainnet-blockscout-db`, `hara-mainnet-blockscout-proxy`, `hara-mainnet-blockscout-stats-api` (node:22-alpine), `hara-mainnet-blockscout-daily-stats`, `hara-mainnet-blockscout-verifier`, `hara-mainnet-besu-ratelimit` (nginx, 10rps/burst-20 — lihat §RPC di bawah), `hara-mainnet-edge-proxy`, `hara-mainnet-node-exporter` |

**+1 host non-ledger, AKTIF sejak 2026-09-30** (di luar hitungan "10 host produksi
ledger" di atas — host ini tidak menjalankan Besu/validator sama sekali):
`<MAINNET_GATEWAY_IP>` (NevaCloud, role "proxy", 3 vCPU, 3.8GB RAM, 60GB disk) — awalnya
ditemukan kosong total (2026-09-29), lalu terlihat SUDAH menjalankan `hara-status`
(app status monitor rekan tim) + nginx + certbot (dipasang rekan infra user, tidak
terdokumentasi dulunya). **Migrasi gateway+dashboard+Postgres+Redis dari
`<MAINNET_V2_IP>` ke sini SELESAI 2026-09-30** (lihat `BACKLOG.md` dan STATUS §24-25):

- Engine yang jalan sekarang: `nginx` (reverse proxy publik, TLS via certbot/Let's
  Encrypt asli), `hara-status` (loopback-only, `127.0.0.1:2443`, di belakang nginx),
  `hara-gateway`, `hara-gateway-dashboard`, `hara-gateway-postgres`,
  `hara-gateway-redis` (stack identik dengan yang di `<MAINNET_V2_IP>`, sumber sama).
- DNS `rpc.registry.haratoken.app`/`dashboard.registry.haratoken.app` sudah dialihkan
  ke host ini (Route53, dieksekusi oleh tim user). `health.registry.haratoken.app`
  juga tetap di host ini (memang sudah dari awal).
- Diverifikasi end-to-end dengan API key produksi asli (`eth_blockNumber`,
  `eth_chainId`, `eth_getTransactionCount` semua benar).
- **Update 2026-09-30 (lanjutan)**: setelah beberapa jam observasi tanpa masalah,
  stack gateway di host lama (`<MAINNET_V2_IP>`) **didekomisioning penuh** (stop →
  verifikasi endpoint publik & validator2 tidak terganggu → `docker compose down -v`,
  containers+volume/data dihapus). Rollback sekarang berarti deploy ulang dari awal
  (source + `.env` + `pg_dump` masih ada), bukan tinggal switch DNS balik.

**Ukuran data chain terukur** (2026-09-29): validator1 975MB, validator2 1.4GB, archive
1.6GB — semuanya jauh dari mendekati batas disk manapun, tidak ada tekanan storage saat
ini di mainnet (beda dari testnet).

**Constraint lama (SELESAI 2026-09-30, dicatat sebagai histori)**: host `<MAINNET_V2_IP>`
sebelumnya menjalankan validator2 SEKALIGUS seluruh stack gateway (Postgres/Redis/Node/
Caddy) di 2 vCPU yang sama — `docker compose build --no-cache` di host ini terbukti
(2026-09-29) memicu outage singkat (load average sempat 8+ di mesin 2-core, cukup untuk
membuat Caddy berhenti merespons koneksi baru sampai di-restart manual). **Diselesaikan
2026-09-30**: seluruh stack gateway+dashboard+Postgres+Redis dipindahkan ke host
`<MAINNET_GATEWAY_IP>` (lihat di atas), diverifikasi aman (endpoint publik tetap normal,
validator2 tidak terganggu), lalu stack lama di host ini **didekomisioning penuh**
(container di-stop lalu `docker compose down -v` — containers+network+volume/data
semua dihapus, bukan cuma di-stop). `<MAINNET_V2_IP>` sekarang cuma menjalankan
validator2 (Besu) sendirian, RAM available naik dari ~1.2GB jadi 4.7GB.

**⚠️ Ditemukan 2026-09-29**: SSH ke `validator3` (`<MAINNET_V3_IP>`) memicu warning "REMOTE
HOST IDENTIFICATION HAS CHANGED" (host key ED25519 tidak cocok dengan yang tersimpan di
`known_hosts`). Data yang kembali setelah override cocok dengan identitas yang diharapkan
(container `hara-mainnet-validator3` sehat), jadi kemungkinan besar VM di-rebuild/replace
di IP yang sama (konsisten dengan banyaknya churn host di infra ini), BUKAN indikasi
kompromi aktif — tapi ini belum dikonfirmasi ke tim, dicatat di `BACKLOG.md` untuk
verifikasi out-of-band.

## Akses SSH — Matriks Ringkas

| Host | User | Port | Key |
|---|---|---|---|
| validator1 | `ubuntu` | 4422 | `access_cloud/validator-1-new-aws.pem` |
| validator2/gateway | `azureuser` | 4422 | `access_cloud/Validator-2-new_key.pem` |
| validator3 | `root` | 22 | `ideal_network_keys/.../validator3-new-neva` (lihat catatan host-key di atas) |
| validator4 | `root` | 22 | `ideal_network_keys/.../validator4-new-neva` |
| validator5 | `root` | 22 | `ideal_network_keys/.../validator5-new-neva` |
| corp1/validator6 | `ubuntu` | 4422 | `ideal_network_keys/.../key-validator-6-New.pem` |
| corp2/validator7 | `azureuser` | 4422 | `ideal_network_keys/.../Validator-7-new_key.pem` |
| rpc1 | `ubuntu` | 4422 | `ideal_network_keys/.../RPC-1-NEW.pem` |
| rpc2/call | `root` | 22 | Password (`env-hara-registry.md`), BUKAN key — `ideal_network_keys/.../rpc2-new` dicoba 2026-09-29, gagal (permission denied), belum jelas kenapa |
| archive | `ubuntu` | 4422 | `access_cloud/archive-new-aws.pem` |

Konfirmasi 2026-09-28/29: rpc1/corp1/corp2/validator3/validator4/validator5/rpc2/call
SEMUA bisa diakses LANGSUNG (bukan cuma lewat tunnel `validator1` seperti dokumentasi
lama) — **9 dari 10 host mainnet punya akses langsung terverifikasi**, cuma rpc2/call
yang butuh password (bukan key) untuk sekarang. Tunnel validator1 (systemd services
`hara-rpc1-tunnel`, `hara-rpc2-tunnel`, `hara-v6-monitor-tunnel`, `hara-v7-monitor-tunnel`,
key di `/etc/hara-*-tunnel/id_ed25519`) tetap ada sebagai fallback untuk semuanya.

**Ditemukan saat rapikan kredensial 2026-09-29**: dua file key di `ideal_network_keys/`
tidak jelas kegunaannya — `proxy-new` (dicoba ke host `<MAINNET_GATEWAY_IP>`, kandidat lama yang
disebut di `ideal-network-topology-notes.txt`, GAGAL) dan `archive-new` (format OPENSSH,
BEDA dari `archive-new-aws.pem` yang terbukti jalan — belum dicoba apakah ini duplikat
atau untuk host lain). Dicatat di `env-hara-registry.md` dan `BACKLOG.md`, TIDAK dihapus
sampai dikonfirmasi ke tim.

## RPC / Traffic Layer

HAProxy (di validator1, `/opt/hara-mainnet/config/haproxy.cfg`, stats di
`127.0.0.1:8404/stats`) fan-out ke 4 pool. Backend sebenarnya menunjuk ke **port tunnel
lokal** (bukan IP publik host tujuan langsung — trafik ke rpc1/rpc2/call/archive lewat
tunnel SSH dari validator1):

| Frontend | Port | Backend (real target) | Fungsi |
|---|---|---|---|
| `rpc_frontend` → `rpc_tx_backend` | 5797 | `127.0.0.1:15797` (rpc1, **primary**) + `127.0.0.1:26797` (rpc2/call, **backup-only**) | Frontend ini memeriksa ISI body: method `eth_sendRawTransaction`, `eth_getTransactionCount`, `eth_getTransactionReceipt`, `eth_getTransactionByHash` (yang terakhir ditambahkan 2026-10-09) dipaksa ke rpc1 supaya alur transaksi tetap di satu txpool dan receipt/nonce tidak basi. rpc2 cuma menerima trafik kalau rpc1 gagal healthcheck 3x (~15s). ACL ini dibuat tim infra 2026-09-30 |
| `rpc_frontend` → `rpc_read_backend` (default_backend) | 5797 | `127.0.0.1:15797` (rpc1) + `127.0.0.1:26797` (rpc2/call), round-robin | Method APA PUN selain 4 di atas yang masuk ke port 5797. Gateway hampir tidak pernah mengirim ini (ia memakai 5799 untuk baca), jadi trafiknya kecil |
| `ws_frontend` | 5798 | `127.0.0.1:15798` (rpc1) + `127.0.0.1:26798` (rpc2/call), maxconn 150 tiap server | WebSocket, sama backend dengan write pool |
| `call_frontend` | 5799 | `127.0.0.1:26797` (rpc2_call, proses yang sama dengan backup write di atas sejak 2026-09-30) | Read-heavy pool (`eth_call`, dst) — genuinely terisolasi dari write pool sejak 2026-09-16 (lihat STATUS §20 untuk insiden misrouting yang sudah diperbaiki) |
| `archive_frontend` | 5800 | Nginx rate-limiter `archive-new` (:15797, BUKAN Besu :5797 langsung), 10rps/burst-20 | `debug_*`/`trace_*`, query historis di luar window — rate-limiter melindungi thread P2P sync Besu dari beban trace Blockscout |

Health check semua backend: `GET /liveness`, expect 200, interval 5s, fall 3/rise 2.

**Gateway** (`gateway/gateway/src/`, host `<MAINNET_V2_IP>`, Node.js v20.20.2) di depan
HAProxy:
- Auth API key: `lookupApiKey()` cache di Redis TTL 60 detik — Postgres cuma kena hit
  saat cache-miss, bukan per-request.
- Rate limiting: `RateLimiterRedis` sepenuhnya — hot path request TIDAK sentuh Postgres
  sama sekali. Postgres cuma dipakai untuk cache-miss lookup + flush usage/activity log
  tiap 10 detik.
- `gasPriceGuard.ts` — tolak tx dengan `gasPrice>0` (chain ini gas-free).
- `archiveRouter.ts` — routing otomatis `debug_*`/`trace_*` ke archive pool.
- **Tidak ada nonce-lock/sticky-routing** untuk write pool — keputusan sadar (lihat
  STATUS §10-11). Write pool sekarang primary+backup, bukan round-robin (lihat tabel
  di atas), jadi risiko nonce-berantakan dari 2 node aktif bersamaan sudah tertutup
  secara struktural. **Diverifikasi empiris 2026-09-30** (STATUS §25): 100 tx dari 1
  sender dengan nonce dihitung lokal → 100/100 sukses masuk 1 block. Risiko nonce
  yang MASIH nyata: klien yang query `eth_getTransactionCount(addr,'latest')` ulang
  sebelum tiap kirim (bukan server-side) — lihat
  `docs/PANDUAN_DEVELOPER_TRANSAKSI_VOLUME_TINGGI.md`.
- `keepAliveTimeout=120000`/`headersTimeout=121000` di HTTP server (ditambahkan
  2026-09-29) — mencegah race EOF/502 antara Caddy dan Node.js saat idle-timeout backend
  lebih pendek dari idle-timeout reverse proxy (root cause insiden 502 sejak trafik
  produksi mulai 2026-09-28, lihat STATUS §23a/§23b).

## Konsensus

7 validator, semua genuinely dikontrol Hara (nama "corp1/corp2" cuma label peran untuk
mensimulasikan keberagaman validator, bukan indikasi kepemilikan eksternal — dikonfirmasi
tim, lihat STATUS §3). Kuorum QBFT butuh mayoritas — dengan 7 validator, toleran **2 node
down bersamaan** tanpa network berhenti produksi block (beda dengan testnet yang cuma 3
validator, 0% toleransi).

## Monitoring

- **Prometheus** (validator1, scrape config terverifikasi & diperbaiki 2026-09-29,
  2026-09-30): job `besu-mainnet` scrape port `9545` tiap node (lewat tunnel lokal
  untuk rpc1/corp1/corp2/call, langsung ke IP publik untuk validator2-5/archive).
  Target `node: rpc-2` (`127.0.0.1:29545`) **dihapus 2026-09-30** — permanen `down`
  sejak proses standalone rpc2 digabung ke `call`, menyebabkan seri kosong ("alias
  tidak ada datanya") di semua panel Grafana yang pakai `legendFormat: "{{node}}"`.
  Sekarang 9 target besu-mainnet (validator1-7 + rpc1 + call), semua `up`. Job
  `node-exporter-mainnet` scrape port `9100` serupa, termasuk `call` sejak 2026-10-09:
  container `hara-mainnet-node-exporter` dipasang di host itu, di-bind ke `127.0.0.1:9100`
  saja (host ini tidak punya firewall aktif) dan dijangkau lewat forward tunnel
  `127.0.0.1:29100` di `hara-rpc2-tunnel` (+ `permitopen` 9100 di `authorized_keys`
  host `call`). Dipasang untuk melihat CPU steal/iowait saat node `call` tertinggal dari
  chain — sebelumnya tidak ada riwayat sama sekali.
- **Grafana** (validator1, v12.1.0) — dashboard baca dari Prometheus di atas, dikonsolidasi
  ke path `/grafana` di `dashboard.registry.haratoken.app` (lihat STATUS §21).
- **Netstats** (validator1, fork `fusenet/eth-netstats` custom arm64-geo-v3).
- **Watchdog `hara-block-health-watch.sh`** (systemd timer 5 menit, di validator1) —
  cek partisipasi proposing 7 validator + rata-rata block time, log-only ke
  `/var/log/hara-block-health-watch.log` (lihat STATUS §23).
- **Status monitor eksternal** (`health.registry.haratoken.app`, dibuat rekan tim,
  ditemukan 2026-09-28) — dashboard status page terpisah (Next.js custom, endpoint
  `/api/status`) yang mengecek 10 node infra + 3 webpage (explorer/netstats/grafana),
  dengan histori uptime harian. Belum terhubung ke repo/deployment tooling ini — murni
  observasi read-only via RPC publik masing-masing node. **Ini BUKAN pengganti watchdog
  block-health di atas** (beda mekanisme, beda cakupan — status monitor cek "container
  jalan + RPC jawab", watchdog cek "validator benar-benar ikut proposing di rotasi
  QBFT").

## Perbedaan dari testnet

- 7 validator (bukan 3) → toleransi kegagalan nyata (2 node), bukan 0%.
- 4 pool RPC via HAProxy (bukan 1 backend + failover sederhana seperti testnet).
- Data permanen, tidak ada reset berkala — vs testnet yang di-reset tiap kuartal.
  `bonsai-limit-trie-logs-enabled=true` (demi kontrol biaya storage) dipakai di ketujuh
  validator QBFT mainnet DAN `rpc1`, tapi **`rpc2`/`call` ternyata `sync-mode=FULL` +
  trie-log-limit MATI** (ditemukan 2026-09-29, tidak diketahui sejak kapan/kenapa) —
  jadi klaim "semua node mainnet rentan risiko SNAP-stuck >512 block" di STATUS §23
  perlu dibaca dengan catatan ini: rpc2/call justru TIDAK kena risiko itu.
- Archive node + Blockscout penuh dedicated (testnet tidak punya).
- Host jauh lebih beragam speknya (2-3 vCPU / 3.7-7.7GB RAM tergantung provider) vs
  testnet yang seragam (2 host serupa).

## Riwayat & detail teknis lengkap

`docs/STATUS_TERDEPLOY_2026-08-20.md` — log kronologis lengkap §1-§23, termasuk semua
insiden, keputusan desain, dan hasil pengujian. Dokumen ini (ARCHITECTURE.md) akan
diperbarui setiap kali topologi/desain berubah signifikan; STATUS_TERDEPLOY tetap
menyimpan riwayat lengkap kenapa-nya.
