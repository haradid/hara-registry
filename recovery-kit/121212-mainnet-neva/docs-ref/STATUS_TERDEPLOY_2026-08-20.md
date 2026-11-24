# Kondisi Terdeploy — QBFT Mainnet (Snapshot 2026-08-20, dilengkapi 2026-08-24 & 2026-08-27)

**Dokumen ini MENGGANTIKAN `cloud_production_final/2_KONDISI_TERDEPLOY_SAAT_INI.md`** — konfigurasi chain berubah signifikan sejak snapshot 2026-08-18 (chainId, jumlah validator, gasLimit, host archive). Semua temuan di bawah hasil SSH + RPC call langsung ke server live, bukan asumsi dari dokumen desain lama.

File konfigurasi asli ada di [`config/genesis.json`](config/genesis.json) dan [`config/static-nodes.json`](config/static-nodes.json). Kredensial akses ada di [`access/`](access/) (tidak di-commit ke git, diproteksi `.gitignore`).

---

## Ringkasan Cepat

| | |
|---|---|
| chainId | **121212** (`0x1d97c`) |
| Konsensus | QBFT, block period 5 detik, epoch 30.000 blok |
| gasLimit | **10.000.000.000 (10 G)** — `0x2540be400` |
| Validator aktif | **7** (5 "validator1-5" + 2 "corp1/corp2") — semua terpetakan lengkap, lihat §2 |
| Software | Hyperledger Besu 26.6.1, storage `BONSAI` + `bonsai-limit-trie-logs-enabled=true` |
| Host fisik | 5 (AWS×2, Azure×1, NevaCloud×2) |
| Block height (saat cek 2026-08-20) | 54.964 |

---

## ⚠️ Perubahan Signifikan Sejak Snapshot 2026-08-18

| Parameter | 2026-08-18 (lama) | 2026-08-20 (sekarang) |
|---|---|---|
| **chainId** | 1212 | **121212** — ✅ dikonfirmasi FINAL oleh tim 2026-08-27 |
| **Jumlah validator** | 5 | **7** (+corp1, +corp2) |
| **gasLimit** | `0xe8d4a51000` (1 TG) | **`0x2540be400` (10 G)** — ✅ dikonfirmasi disengaja/final, bukan salah ketik |
| Block height (saat cek) | 65.697 | 54.964 (lebih rendah — konsisten dengan genesis baru) |
| Archive/Explorer host | NevaCloud (<OLD_ARCHIVE_NEVA_IP>) | **AWS (<MAINNET_ARCHIVE_IP>)** — host lama dikonfirmasi **dimusnahkan permanen** (bukan sekadar mati), lihat §9 |

**Kesimpulan: chain di-deploy ulang dari genesis baru**, bukan sekadar update konfigurasi — nomor blok yang lebih rendah dan chainId berbeda tidak mungkin terjadi pada chain yang sama yang terus berjalan. Semua parameter di atas (chainId 121212, gasLimit 10G) berstatus **FINAL**, dikonfirmasi tim 2026-08-27 (detail lengkap di §9) — bukan lagi eksperimen atau sementara.

---

## 1. Topologi Fisik — 5 Host, 7 Validator

| Host | Provider | IP | Isi |
|---|---|---|---|
| validator1-host | **AWS** | <MAINNET_V1_AWS_IP> | Validator1 (sealer) + RPC1 + HAProxy + NetStats + Prometheus + Grafana + Node Exporter |
| **archive-new** | **AWS** (baru) | **<MAINNET_ARCHIVE_IP>** | Archive/Bootnode + Blockscout + contract verifier + database explorer + RPC publik + proxy + Node Exporter — menggantikan host NevaCloud lama, **akses publickey-only, key yang match belum ada** (lihat §6) |
| validator2-host | Azure | <MAINNET_V2_OLD_IP> | Validator2 (sealer) + ~~Corp1~~ (pindah, lihat §19) + Node Exporter |
| validator3-host | NevaCloud | <MAINNET_V3_IP> | Validator3 (sealer) + ~~Corp2~~ (pindah, lihat §19) + Node Exporter |
| validator4+5-host | NevaCloud | <MAINNET_V4_IP> | Validator4 (sealer) + ~~Validator5~~ (pindah, lihat §19) + Node Exporter |

**⚠️ Update 2026-09-15**: `rpc1`, `corp1`, `corp2`, `validator5`, dan `write2`/`call`
(tabel §10 di bawah) sudah pindah ke 5 host baru — lihat **§19** untuk topologi terkini
sebelum dipakai triase. Tabel di atas dibiarkan sebagai catatan historis snapshot 08-27.

Topologi ini dikonfirmasi ulang langsung oleh tim via chat 2026-08-27 — cocok persis dengan hasil verifikasi SSH sebelumnya, termasuk daftar layanan archive-new yang lebih detail (contract verifier, database explorer, proxy — sebelumnya cuma diketahui sebagai "Blockscout stack" generik dari cek endpoint publik).

**Tetap 5 host fisik** (sama seperti snapshot 08-18) — tapi sekarang menampung **7 validator** (bukan 5), lewat penambahan `corp1` di host validator2 dan `corp2` di host validator3, menyusul pola "numpang" yang sudah ada di validator4+5.

### ✅ Archive Lama (NevaCloud, <OLD_ARCHIVE_NEVA_IP>) — Dikonfirmasi Dimusnahkan Permanen

Dicek 2026-08-20: SSH timeout, HTTP timeout (curl exit 28), dan **ping mengembalikan "Destination host unreachable"** langsung dari gateway jaringan (`<NEVA_NET_GATEWAY_IP>`). Re-cek 2026-08-27: connection timeout (beda gejala — bukan lagi unreachable di gateway). **Dikonfirmasi tim 2026-08-27: VM ini sudah dimusnahkan (destroyed) secara permanen** — bukan down tak terduga, dan bukan bagian dari migrasi 1:1 ke archive-new (dua keputusan terpisah; archive-new dibangun independen, kebetulan menjalankan peran fungsional yang sama). Host ini **tidak akan pernah hidup lagi** — kredensialnya (`access/access_cloud/archive-old-neva-DEAD.key`) aman diarsipkan/dihapus kapan saja.

---

## 2. Pemetaan Lengkap: Address Validator ↔ Container ↔ Host

**Ditutup 2026-08-24** — sebelumnya cuma 5 dari 7 address yang diketahui asalnya (corp1/corp2 belum ketahuan mana yang mana). Dikonfirmasi via `besu public-key export-address --node-private-key-file=/data/key` dijalankan langsung di tiap container (bukan tebakan dari urutan genesis):

| Address (genesis extraData) | Container | Host | Provider |
|---|---|---|---|
| `0xdcb8f32c14708a7098e7645359a2985d5b716a71` | `hara-mainnet-validator1` | <MAINNET_V1_AWS_IP> | AWS |
| `0xa19335a520eb1e88edf38e974ceffea1d1c250e9` | `hara-mainnet-validator2` | <MAINNET_V2_OLD_IP> | Azure |
| `0xcd8470a62b7fa47ed81eabf8539c54f00752b16f` | `hara-mainnet-corp1` | <MAINNET_V2_OLD_IP> | Azure |
| `0x0ccd8f0c94c922fc56bc52dd93593e75e72b28af` | `hara-mainnet-validator3` | <MAINNET_V3_IP> | NevaCloud |
| `0xe4cf68336edb26a424e1547311a15d12690b732b` | `hara-mainnet-corp2` | <MAINNET_V3_IP> | NevaCloud |
| `0x273368c4230f64822bb6e94a2ccdf99943361fdd` | `hara-mainnet-validator4` | <MAINNET_V4_IP> | NevaCloud |
| `0x1de17772711c54f6931c8aedb9ffdb0a925243b7` | `hara-mainnet-validator5` | <MAINNET_V4_IP> | NevaCloud |

Semua 7 address terverifikasi cocok dengan `qbft_getValidatorsByBlockNumber` live.

**Genesis parameter lain (tidak berubah):** QBFT, block period 5 detik, epoch 30.000, `zeroBaseFee=true`, 3 akun alloc (1 saldo terbatas + 2 saldo nyaris tak terbatas — private key tidak ada di repo ini, custody dipegang terpisah).

---

## 3. Konfigurasi corp1 & corp2 — Detail Teknis & Peran Governance

**Peran dikonfirmasi tim 2026-08-27:** `corp1`/`corp2` adalah **validator tambahan untuk memperkuat kepercayaan/desentralisasi jaringan** (menaikkan kuorum dari 5→7, lihat §5) — **bukan node milik partner/korporat eksternal**. Keduanya tetap sepenuhnya dikelola oleh Hara, termasuk custody private key node-nya, sama seperti validator1-5. Nama "Corp1"/"Corp2" adalah label peran (mensimulasikan keberagaman validator untuk tujuan kepercayaan), bukan indikasi kepemilikan/kendali eksternal.

Berbeda dari validator1-5, `corp1`/`corp2` punya **local RPC diaktifkan** (validator1-5 tidak) — sesuai `profile="ENTERPRISE"`. Namun RPC ini di-bind ke `127.0.0.1` saja (lihat tabel di bawah), jadi **konsisten dengan status "dikelola internal"** — tidak ada jalur akses eksternal langsung ke node ini yang terpisah dari infrastruktur Hara yang lain:

| Parameter | corp1 (Azure) | corp2 (NevaCloud) |
|---|---|---|
| RPC HTTP (loopback only) | `127.0.0.1:6797` | `127.0.0.1:6797` |
| RPC WS (loopback only) | `127.0.0.1:6798` | `127.0.0.1:6798` |
| RPC API di-enable | ETH, NET, QBFT, TXPOOL, WEB3, ADMIN | sama |
| p2p-port | 30304 (beda dari validator2 di host sama: 30303) | 30304 (beda dari validator3: 30303) |
| `mem_limit` container | **3,2 GB** (3355443200 bytes) | **1,7 GB** (1782579200 bytes) |
| `data-storage-format` | BONSAI + `bonsai-limit-trie-logs-enabled=true` + `bonsai-historical-block-limit=512` | sama |
| `target-gas-limit` | 10.000.000.000 | sama |
| bootnode | `enode://02a30e1e...@<MAINNET_ARCHIVE_IP>:30303` (archive-new) | sama |
| ethstats | `ws://corp-1:***@<MAINNET_V1_AWS_IP>:3001` | `ws://corp-2:***@<MAINNET_V1_AWS_IP>:3001` |

RPC corp1/corp2 di-bind ke `127.0.0.1` (loopback), jadi **tidak terekspos ke internet** — konsisten dengan validator1-5 yang juga tidak melayani RPC publik langsung.

---

## 4. Verifikasi Chain Live (RPC, read-only)

| Cek | Hasil |
|---|---|
| `eth_chainId` | `0x1d97c` = **121212** |
| `net_peerCount` | 5 |
| `qbft_getValidatorsByBlockNumber` | 7 address — cocok tabel §2 |
| `eth_blockNumber` | 54.964 (saat cek 2026-08-20) |
| `gasLimit` | 10.000.000.000 (10 G) |

---

## 5. Kuorum QBFT — Naik Jadi 7 Validator (Peningkatan Nyata)

Berbeda dari analisis snapshot 08-18 (5 validator, f=1, sama seperti hipotetis 4 validator) — **7 validator benar-benar menaikkan toleransi gangguan**:

| Jumlah Validator | Kuorum (⌈2n/3⌉) | Toleransi (f) | Jika Node Mati |
|---:|---:|---:|---|
| 5 | 4 | 1 | 1 mati → 4 tersisa, blok tetap terbentuk |
| **7 (sekarang)** | **5** | **2** | **2 mati → 5 tersisa, blok tetap terbentuk** |

Ini kabar baik — keputusan menambah ke 7 validator memberi manfaat toleransi Byzantine yang nyata, sesuai catatan lama di `cloud_production_final/1_RENCANA_KEDEPAN.md` §4 yang menyebut 7 sebagai titik peningkatan berikutnya.

**Tapi risiko konsentrasi host tetap ada:** dengan 7 validator di 5 host, **3 dari 5 host** menjalankan 2 validator sekaligus (validator2+corp1, validator3+corp2, validator4+validator5). Kalau 2 dari 3 host ganda ini mati bersamaan, 4 validator bisa hilang sekaligus — masih di bawah ambang kuorum (5), jadi chain akan berhenti kalau skenario ini terjadi. Host tunggal (validator1) tidak menambah risiko ini karena cuma menampung 1 validator.

---

## 6. Akses — Status Lengkap (2026-08-27: SEMUA 5 HOST TERVERIFIKASI SSH)

| Host | Auth | Status |
|---|---|---|
| validator1-host (<MAINNET_V1_AWS_IP>) | Key `access/access_cloud/validator-1-new-aws.pem`, port 4422, user `ubuntu` | ✅ Aktif, terverifikasi 2026-08-24 |
| validator2-host (<MAINNET_V2_OLD_IP>) | Key `access/access_cloud/Validator-2-new_key.pem`, port 4422, user `azureuser` | ✅ Aktif, terverifikasi 2026-08-24 |
| validator3-host (<MAINNET_V3_IP>) | Password (lihat `access/env-hara-registry.md`), port 22, user `root` | ✅ Aktif, re-verifikasi 2026-08-27 |
| validator4+5-host (<MAINNET_V4_IP>) | Password sama, port 22, user `root` | ✅ Aktif, re-verifikasi 2026-08-27 |
| **archive-new (<MAINNET_ARCHIVE_IP>)** | Key `access/access_cloud/archive-new-aws.pem`, port 4422, user `ubuntu` | ✅ **Aktif, diverifikasi 2026-08-27** — key diterima tim, SSH berhasil, `docker ps` menampilkan 11 container (lihat §6.1) |
| archive lama (<OLD_ARCHIVE_NEVA_IP>) | Password `access/access_cloud/archive-old-neva-DEAD.key` | ⚠️ Kredensial ada tapi **host mati total** — re-cek 2026-08-27 masih timeout (bukan cuma unreachable-di-gateway seperti 08-20, sekarang malah connection timeout langsung — kemungkinan VM benar-benar dimatikan/didekomisioning, bukan sekadar masalah network sementara) |

**Kesimpulan: akses ke seluruh 5 host produksi sekarang lengkap.** Tidak ada lagi host yang tidak bisa diverifikasi langsung via SSH. Satu-satunya host tanpa akses aktif adalah archive LAMA (<OLD_ARCHIVE_NEVA_IP>) yang memang sudah digantikan dan kemungkinan sengaja dimatikan — bukan gap akses, tapi kandidat dekomisioning resmi (lihat §9).

### 6.1 archive-new (<MAINNET_ARCHIVE_IP>) — Verifikasi Resource & Config (2026-08-27)

| | |
|---|---|
| Hostname | `ip-10-0-182-107` |
| Uptime saat cek | 5 hari |
| Disk (`/`) | 96GB total, 42GB terpakai (43%), 55GB tersedia |
| RAM | 3,7GB total, 2,1GB terpakai, 1,6GB cache, swap 8GB (225MB terpakai) |
| Container aktif (11) | `archive-bootnode`, `blockscout-backend`, `blockscout-frontend`, `blockscout-db`, `blockscout-verifier`, `blockscout-proxy`, `blockscout-stats-api`, `blockscout-daily-stats`, `besu-ratelimit`, `edge-proxy`, `node-exporter` |
| archive-bootnode config | `--p2p-host=<MAINNET_ARCHIVE_IP> --node-private-key-file=/data/key --static-nodes-file=/config/static-nodes.json` — konsisten dengan perannya sebagai bootnode P2P yang direferensikan corp1/corp2 (lihat §3) |

Daftar container ini cocok persis dengan info topologi yang dikonfirmasi tim: "Archive/Bootnode, Blockscout, contract verifier, database explorer, RPC publik, proxy, Node Exporter" — semua tertelusuri satu-satu ke container yang berjalan.

---

## 7. Endpoint Publik (per info tim, 2026-08-20)

| Layanan | URL | Status Terverifikasi |
|---|---|---|
| Explorer | http://<MAINNET_ARCHIVE_IP>/ → `https://<MAINNET_ARCHIVE_SSLIP_HOST>/` | ✅ HTTP 301 (redirect aktif) |
| RPC HTTP | http://<MAINNET_V1_AWS_IP>:5797 | ✅ Merespons (chainId 121212 dikonfirmasi) |
| RPC WebSocket | ws://<MAINNET_V1_AWS_IP>:5798 | Belum dites langsung |
| Netstats | http://<MAINNET_V1_AWS_IP>:3001/ | ✅ HTTP 200 |
| Grafana | http://<MAINNET_V1_AWS_IP>:3000/ | ✅ HTTP 302 (redirect login) — kredensial ada di `access/env-hara-registry.md`, TIDAK ditulis di dokumen ini |
| HAProxy stats | http://<MAINNET_V1_AWS_IP>:8404/stats | ✅ HTTP 200 — ⚠️ publik, masih belum loopback-only, gap lama belum diperbaiki |

---

## 8. Gap yang Masih Sama (Belum Diperbaiki Sejak 2026-08-18)

- validator1 masih rangkap 7 layanan (validator+RPC+LB+monitoring) — melanggar prinsip isolasi konsensus
- Cuma 1 RPC node (`rpc1`) — masih nol redundansi RPC
- HAProxy stats masih publik, belum loopback-only
- Gap baru: 3 dari 5 host menjalankan 2 validator sekaligus (bukan cuma 1 seperti sebelumnya) — lihat §5

---

## 9. Klarifikasi dari Tim (SEMUA TERJAWAB 2026-08-27)

Kelima pertanyaan terbuka sebelumnya sudah dijawab langsung oleh tim via chat 2026-08-27 — status sekarang final, bukan lagi asumsi:

1. ~~Kenapa chainId berubah dari 1212 ke 121212?~~ — **Dikonfirmasi: 121212 adalah chainId final.** Bukan eksperimen.
2. ~~Kenapa gasLimit turun dari 1TG ke 10G?~~ — **Dikonfirmasi disengaja: 10 miliar (10G) adalah nilai final**, bukan salah ketik digit. Lebih konservatif dibanding 1TG sebelumnya.
3. ~~Status archive lama (NevaCloud, <OLD_ARCHIVE_NEVA_IP>)~~ — **Dikonfirmasi: VM sudah dimusnahkan (destroyed) secara permanen**, bukan down tak terduga. Tim menegaskan ini BUKAN bagian dari migrasi 1:1 ke archive-new — dua keputusan terpisah, archive-new dibangun independen dan kebetulan sekarang menjalankan peran fungsional yang sama (archive+explorer). **Tindak lanjut:** kredensial `access/access_cloud/archive-old-neva-DEAD.key` aman diarsipkan/dihapus dari registry aktif kapan saja — host-nya tidak akan pernah hidup lagi.
4. ~~Peran "Corp1" dan "Corp2"~~ — **Dikonfirmasi: keduanya validator TAMBAHAN untuk memperkuat kepercayaan/desentralisasi jaringan, tapi tetap dikelola penuh oleh Hara** (bukan node milik partner/korporat eksternal yang independen). Private key node mereka tetap di bawah kendali/custody Hara, sama seperti validator1-5. Penamaan "Corp1"/"Corp2" adalah label peran, bukan indikasi kepemilikan eksternal — konsisten dengan temuan §3 bahwa RPC lokal mereka cuma di-bind ke `127.0.0.1` (tidak melayani klien eksternal manapun).
5. ~~Kredensial akses archive-new (<MAINNET_ARCHIVE_IP>)~~ — **SELESAI 2026-08-27**, key `archive-new-aws.pem` diterima dan diverifikasi (lihat §6.1).

**Dampak ke dokumen ini:** semua parameter chain (chainId 121212, gasLimit 10G) sekarang berstatus FINAL, bukan sementara — dokumen `1_RENCANA_KEDEPAN.md` dan `3_PERBANDINGAN_DENGAN_LIVE_PROD_LAMA.md` di `cloud_production_final/` yang masih menyebut chainId 1212/gasLimit 1TG sekarang resmi usang dan perlu direvisi (lihat `README.md` folder ini).

---

## 10. Ekspansi RPC — write2 & call (2026-08-27, IN PROGRESS)

Menindaklanjuti gap di §8 (cuma 1 RPC general-purpose, nol redundansi) dan temuan Fase 2 QA (`QA/reports/MAINNET_QA_PHASE1_2_2026-08-27.md`), 2 node RPC baru di-deploy dengan menumpang di host validator yang sudah ada (disepakati user, resource "mepet tapi oke" — tidak menambah host baru karena akan ada reorganisasi infra bulan depan).

| Node baru | Host (numpang) | Provider | RPC port lokal | p2p-port | mem_limit | Peran |
|---|---|---|---|---|---|---|
| `write2` | <MAINNET_V2_OLD_IP> (bareng validator2+corp1) | Azure | 7797 (HTTP) / 7798 (WS), bind `0.0.0.0` | 30305 | 2048m (Xmx1536m) | RPC write kedua — redundansi utk `rpc1` |
| `call` | <MAINNET_V3_IP> (bareng validator3+corp2) | NevaCloud | 7797 (HTTP) / 7798 (WS), bind `0.0.0.0` | 30305 | 1024m (Xmx768m) | RPC read-only (API dibatasi ke ETH/NET/WEB3, TXPOOL & ADMIN sengaja dimatikan) |

Keduanya adalah node Besu biasa (BUKAN validator/signer — tidak ikut menandatangani blok, node key digenerate baru otomatis oleh Besu saat start pertama, bukan dari keyset validator). Sync SNAP selesai dalam hitungan detik untuk `write2`; `call` masih proses sync saat dokumen ini ditulis.

**HAProxy di validator1 diupdate** (`/opt/hara-mainnet/config/haproxy.cfg`, backup di `haproxy.cfg.bak-before-write2call`):
- `rpc_backend` (`:5797`, existing) sekarang punya 2 server: `rpc1` + `write2` (round-robin/failover)
- `ws_backend` (`:5798`) sama, ditambah `write2_ws`
- **Frontend baru `call_frontend` (`:5799`)** → `call_backend` → node `call1`

Konfigurasi HAProxy sudah divalidasi (`haproxy -c`, exit 0) dan di-restart (downtime ~3 detik, terverifikasi `rpc1` tetap normal setelah restart).

### ✅ SELESAI 2026-08-28 — semua backend UP, semua jalur terverifikasi

Butuh 2 gelombang perbaikan untuk sampai ke sini:
1. **NSG/firewall cloud** — dibuka bertahap oleh tim infra di AWS/Azure/NevaCloud.
2. **Firewall level OS (`ufw`) di dalam tiap VM** — ternyata terpisah dari NSG cloud dan JUGA memblokir, tidak ke-cover walau NSG sudah dibuka. Ditemukan &amp; diperbaiki langsung oleh Claude (akses SSH root) di ketiga VM (Azure, NevaCloud, AWS validator1) — pelajaran: **selalu cek `ufw status` di guest OS, jangan asumsikan NSG cloud satu-satunya lapisan.**

`HAProxy stats` (2026-08-28) — semua backend `UP`: `rpc_backend/rpc1`, `rpc_backend/write2`, `ws_backend/rpc1_ws`, `ws_backend/write2_ws`, `call_backend/call1`, `archive_backend/archive1`.

**Port yang tadinya perlu dibuka (SEMUA sudah beres):**

| Host | Port | Sumber (source) | Untuk | Status |
|---|---|---|---|---|
| `<MAINNET_V2_OLD_IP>` (Azure) | TCP 7797, 7798, 9547 | `<MAINNET_V1_AWS_IP>` | `write2` (RPC + metrics) | ✅ |
| `<MAINNET_V3_IP>` (NevaCloud) | TCP 7797, 9547 | `<MAINNET_V1_AWS_IP>` | `call` (RPC + metrics) | ✅ |
| `<MAINNET_V1_AWS_IP>` (AWS) | TCP 5799, 5800 | Publik | Endpoint publik `call`/`archive` | ✅ |
| `<MAINNET_V1_AWS_IP>` (AWS) | TCP 80, 443 | Publik | Caddy `netstats`/`grafana.registry.haratoken.app` | ✅ |
| `<MAINNET_V2_OLD_IP>` (Azure) | TCP 80, 443 | Publik | Caddy `rpc`/`dashboard.registry.haratoken.app` | ✅ |

Referensi lama (dipertahankan untuk sejarah troubleshooting):
| `<MAINNET_ARCHIVE_IP>` (AWS Security Group, archive-new) | **TCP 15797** | `<MAINNET_V1_AWS_IP>` | HAProxy `archive_backend` → nginx rate-limiter archive |
| `<MAINNET_V1_AWS_IP>` (AWS Security Group) | TCP 5799, **5800** | publik (sama seperti aturan `:5797`/`:5798` sekarang) | endpoint publik `call` dan `archive` |

**Update 2026-08-27 (lanjutan):** Prometheus di validator1 sudah dikonfigurasi scrape target `write-2`(`:9547`)/`call-1`(`:9547`) — statusnya `down` karena port metrics kena blokir firewall (ditambahkan ke tabel, kolom **9547**). HAProxy juga sudah ditambah `archive_frontend`(`:5800`) → `archive_backend` → `<MAINNET_ARCHIVE_IP>:15797` (nginx rate-limiter archive-new, BUKAN Besu langsung — supaya proteksi rate-limit Blockscout tetap terjaga) — **sama-sama kena blokir**, archive-new perlu buka port 15797 juga.

**Ringkasan akhir — semua port yang perlu dibuka dari `<MAINNET_V1_AWS_IP>` (5 total):**
1. `<MAINNET_V2_OLD_IP>:7797` — write2 RPC
2. `<MAINNET_V2_OLD_IP>:7798` — write2 WS
3. `<MAINNET_V2_OLD_IP>:9547` — write2 metrics
4. `<MAINNET_V3_IP>:7797` — call RPC
5. `<MAINNET_V3_IP>:9547` — call metrics
6. `<MAINNET_ARCHIVE_IP>:15797` — archive rate-limited RPC

Dan di `<MAINNET_V1_AWS_IP>` sendiri (AWS SG, untuk akses publik masuk): port **5799** (call), **5800** (archive), plus dari deployment gateway di §11: **4000/4001** di `<MAINNET_V2_OLD_IP>` (dan nanti **4002** untuk dashboard).

**Belum dikerjakan setelah port terbuka:** verifikasi round-robin `rpc1`↔`write2` benar-benar bergantian, verifikasi `call_frontend`/`archive_frontend` publik bisa diakses.

**Soal nonce (2026-08-27, SELESAI diriset & diputuskan — lihat §11):** setelah riset mendalam (baca source code `cloud_1`/`tesnet_server` + review desain independen), diputuskan **TIDAK membangun mekanisme nonce-lock apapun**. `write1`/`write2` bukan validator, cuma titik masuk gossip P2P — HAProxy round-robin biasa (kondisi sekarang) sudah cukup; nonce-guard yang pernah dicoba di cloud_1/tesnet_server justru dimatikan karena bikin lemot (lihat memori `nonce_guard_perf_lesson`). Detail lengkap alasan di §11 dan `C:\Users\naufa\.claude\plans\coba-kamu-cek-dulu-fluttering-axolotl.md`.

---

## 11. API Gateway — Dibangun Meniru `cloud_1`/`tesnet_server` (2026-08-27)

User minta gateway+dashboard+monitoring ditiru dari `cloud_1/`+`tesnet_server/` (sudah terbukti jalan), plus arahan eksplisit: mau dibangun "seperti Infura" (RPC-as-a-service: API key, rate-limit, usage tracking, dashboard). Riset mendalam (Explore agent baca source code kedua referensi + Plan agent mengkritik desain awal) menghasilkan keputusan final — lihat rencana lengkap di `C:\Users\naufa\.claude\plans\coba-kamu-cek-dulu-fluttering-axolotl.md`.

### Ringkasan Keputusan Desain
- **write1/write2**: round-robin HAProxy biasa, TIDAK ada sticky-hash/nonce-lock (lihat kotak di atas).
- **Routing 3 jalur**: gateway baca `method` request → `eth_sendRawTransaction` ke **write** pool (`:5797`), `debug_*`/`trace_*` ke **archive** (`:5800`), method state-trie dengan blockTag historis eksplisit (`eth_call`/`eth_getBalance`/`eth_getCode`/`eth_getStorageAt`/`eth_getTransactionCount`) ke **archive** juga, sisanya (termasuk `eth_getLogs`/`eth_getBlockByNumber` — TIDAK dianggap perlu archive karena bukan state-trie query) ke **call** pool (`:5799`). Middleware baru: `gateway/gateway/src/tx/archiveRouter.ts`.
- **Batch JSON-RPC campuran**: kalau ada 1 item butuh archive, seluruh batch ke archive (keputusan user).
- **nonceGuard**: sengaja TIDAK diaktifkan (lihat kotak nonce di atas).
- **Grafana/Prometheus/Netstats**: sudah ada duluan di validator1, cuma di-extend scrape target-nya (§10 update), tidak dibangun ulang.

### Yang Sudah Dideploy
Lokasi kode: `mainnet_production/gateway/` (di repo, akan di-commit — TIDAK ada secret di dalamnya, secret cuma di `.env` di server).

**Host: validator2+corp1+write2 (Azure, <MAINNET_V2_OLD_IP>)** — dipilih karena RAM/disk paling lega dari semua host (validator1 terlalu mepet). Mem_limit di-set konservatif (postgres 300m, redis 300m/maxmemory 256mb, gateway 300m, dashboard 400m) karena available RAM host cuma ~1,8GB saat itu.

| Komponen | Status | Catatan |
|---|---|---|
| Postgres (`hara-gateway-postgres`) | ✅ Healthy | Schema `admins/users/api_keys/usage_hourly/usage_daily_quota/alert_recipients` ter-init otomatis |
| Redis (`hara-gateway-redis`) | ✅ Healthy | |
| Gateway (`hara-gateway`) | ✅ Healthy, jalan di `:4000`(HTTP)/`:4001`(WS) | Build TypeScript sukses (1 fix: `router` callback butuh tipe eksplisit) |
| Dashboard (`hara-gateway-dashboard`) | ✅ Healthy, jalan di `:4002` | Next.js, salinan langsung dari `cloud_1/gateway/dashboard/` (chain-agnostic, tidak ada hardcode chainId lama). Admin ter-bootstrap otomatis (`admin@hara.ag`) begitu `/login` diakses pertama kali — dikonfirmasi row di tabel `admins` |

### Verifikasi Routing (Smoke Test, via loopback di host — port publik belum kebuka)
Dibuat 1 API key test langsung via SQL (`QA smoke test`, rps_limit 100), test 3 skenario:

| Method | Target seharusnya | Hasil |
|---|---|---|
| `eth_sendRawTransaction` (dummy) | write pool (`:5797`) | ✅ **Terverifikasi end-to-end** — dapat respons asli dari `rpc1`: `{"error":{"code":-32602,"message":"Invalid params"}}` (rpc1 memang menolak dummy tx, tapi ini BUKTI request sampai ke Besu asli lewat gateway→archiveRouter→httpProxy→HAProxy→rpc1) |
| `eth_blockNumber` | call pool (`:5799`) | ⏸️ Hang/timeout — dicek langsung (bypass gateway sepenuhnya, curl dari Azure host ke `<MAINNET_V1_AWS_IP>:5799`) juga hang. **Bukan bug kode** — AWS Security Group `<MAINNET_V1_AWS_IP>` belum buka port `5799` dari luar (port ini baru dibuat sesi ini, beda dari `:5797`/`:5798` yang sudah lama terbuka). Sudah ada di daftar port §10. |
| `debug_traceTransaction` | archive pool (`:5800`) | Belum dites — pasti kena blocker yang sama (port `5800` + `<MAINNET_ARCHIVE_IP>:15797`, keduanya belum terbuka) |

**Kesimpulan: logic routing gateway sudah terbukti benar** (test write pool membuktikan alur penuh archiveRouter→httpProxy→HAProxy→Besu berfungsi) — sisanya murni menunggu port dibuka, bukan pekerjaan kode tambahan.

### Semua Item Sebelumnya — SELESAI 2026-08-28
1. ~~Dashboard masih proses build~~ — **SELESAI**, healthy di `:4002`, admin ter-bootstrap.
2. API key test (`hara_test_...`) tetap ada untuk QA rutin (lihat `access/GATEWAY_CREDENTIALS.md`); key stress-test terpisah (`hara_stress_...`, limit 2000rps) sudah **di-revoke** setelah dipakai sekali untuk load test §12.
3. ~~Port publik `4000`/`4001`/`4002`~~ — **SELESAI**, semua terbuka.
4. ~~Re-test 3 skenario routing dari luar~~ — **SELESAI**, lihat §12, semua 4 pool (write/call/archive/public) terverifikasi 100% jalan dari luar.
5. ~~Kredensial `.env` belum disalin~~ — **SELESAI**.

---

## 12. QA Menyeluruh, Domain Publik, & Stress Test — 2026-08-28

### 12.1 Domain publik `*.registry.haratoken.app` — LIVE

Meniru pola `mampang.haratoken.app` (Caddy + Let's Encrypt otomatis), tapi tersebar di 3 host berbeda (bukan 1 VM seperti tesnet) karena topologi mainnet memang terdistribusi.

| Domain | Proxy ke | Host | Status |
|---|---|---|---|
| `rpc.registry.haratoken.app` | `127.0.0.1:4000`(HTTP)/`:4001`(WS) | Azure (gateway) | ✅ HTTP+WS+HTTPS terverifikasi |
| `dashboard.registry.haratoken.app` | `127.0.0.1:4002` | Azure (gateway) | ✅ |
| `netstats.registry.haratoken.app` | `127.0.0.1:3001` | AWS validator1 | ✅ HTTP 200 |
| `grafana.registry.haratoken.app` | `127.0.0.1:3000` | AWS validator1 | ✅ HTTP 302 (redirect login, normal) |
| `explorer.registry.haratoken.app` | Blockscout (via edge-proxy existing) | AWS archive-new | ✅ — domain ditambahkan ke Caddyfile existing (`<MAINNET_ARCHIVE_SSLIP_HOST>, explorer.registry.haratoken.app { ... }`), bukan dibuat dari nol |

**Caddy baru di-deploy** (folder `/opt/hara-caddy/` di masing-masing host, image `caddy:2-alpine`, `network_mode: host`, mem_limit 80m) di AWS validator1 dan Azure — sebelumnya cuma archive-new yang punya Caddy. TLS Let's Encrypt otomatis (tls-alpn-01), tidak perlu port 80 kalau challenge lewat itu berhasil (dikonfirmasi jalan meski beberapa host awalnya cuma buka 443).

**Root cause kenapa port sempat "sudah dibuka tapi tetap gagal":** setiap VM ternyata punya **firewall level OS (`ufw`) terpisah dari NSG cloud**. NSG dibuka oleh tim infra, tapi `ufw` di dalam guest OS punya rule-set sendiri yang tidak otomatis ikut — walhasil trafik tetap diblokir meski NSG sudah benar. Ditemukan &amp; diperbaiki langsung (akses SSH root ke ketiga VM) dengan menambah rule `ufw allow` yang sesuai. **Pelajaran untuk ke depan: setiap kali NSG/firewall cloud dibuka tapi masih gagal, cek `ufw status` di guest OS SEBELUM curiga ke cloud provider.**

### 12.2 Endpoint tanpa API key (`/v1/public`) — ditambahkan 2026-08-28

Meniru fitur `tesnet_server` (`auth/publicAccess.ts`, `usage/activityLog.ts`, tabel `rpc_activity_log`/`audit_log` dari migration `004_activity.sql`), sengaja dibuat **lebih ketat** karena ini mainnet: `PUBLIC_RPS_LIMIT=1` (sama seperti tesnet) tapi `PUBLIC_DAILY_QUOTA=50` (tesnet: 100). Berlaku untuk HTTP (`/v1/public`) maupun WS (`ws://.../v1/public`). Terverifikasi: request pertama lolos, request kedua dalam detik yang sama langsung 429.

### 12.3 Stress Test — Hasil Lengkap (2026-08-28)

Semua tes pakai key khusus load-test (`rps_limit=2000`, di-revoke setelah selesai) supaya yang diukur murni kapasitas infrastruktur, bukan konfigurasi rate-limit gateway.

| Pool | Beban | Sukses | Ditolak (429) | Latensi (p50/p95/p99) | Catatan |
|---|---|---:|---:|---|---|
| **Write** (`rpc1`+`write2`) | 400 tx dummy, concurrency 100 | 400/400 | 0 | 324/527/577 ms | Tidak ada error sama sekali di beban ini |
| **Call** | 400 `eth_blockNumber`, concurrency 100 | 400/400 | 0 | 230/394/512 ms | Sama, nol error |
| **Archive** | 100 `debug_traceTransaction`, concurrency 15 | 22/100 | 78 | 28/69/70 ms | **429 di sini BENAR/BY DESIGN** — nginx rate-limiter archive (10rps + burst 20) melindungi Blockscout dari overload, sesuai tujuan aslinya. Bukan bug. |
| **Gateway rate-limiter (API key)** | 400 req, concurrency 200, `rps_limit=100` | 100/400 | 300 | 279/968/1025 ms | Rate-limiter Redis-backed **terverifikasi presisi** — persis 100 lolos sesuai konfigurasi |
| **`/v1/public`** | 20 req, concurrency 10, limit 1rps | 1/20 | 19 | 14/34/34 ms | Sesuai desain |

**Kesimpulan kesiapan produksi:**
- ✅ **Write path**: siap — 0% error rate pada 400 tx konkuren, latensi p99 &lt;600ms.
- ✅ **Read path (call)**: siap — 0% error rate pada 400 concurrent reads, latensi p99 &lt;520ms.
- ✅ **Archive path**: siap **untuk beban yang sesuai peruntukannya** (query historis/debug sesekali, bukan trafik tinggi) — kapasitasnya sengaja kecil, jangan diarahkan trafik besar ke sana.
- ✅ **Rate limiting**: semua 3 layer (gateway per-key, gateway per-IP publik, nginx archive) terverifikasi presisi, tidak ada layer yang bocor/tidak berfungsi.
- ✅ **Domain + HTTPS**: kelima subdomain live, RPC HTTP+WS+HTTPS semua terverifikasi end-to-end dari luar.
- ✅ **Tesnet** (`mampang.haratoken.app`, proyek terpisah): dicek ulang 2026-08-28, sehat — RPC publik, dashboard, netstats semua merespons normal, tidak ada regresi.

**Belum diuji sebelum insiden §13:** transaksi bernilai asli (dummy tx `0xdeadbeef` cuma membuktikan tersambung, bukan benar-benar ter-mining). Setelah §13, ini sudah terverifikasi dengan transaksi ASLI yang benar-benar ter-mining.

---

## 13. Insiden: `write2`/`call` Tidak Pernah Selesai Sync World-State — Ditemukan & Diperbaiki 2026-08-28

**Temuan kritis:** stress test §12 di atas cuma menguji BACA (`eth_blockNumber`) dan tx DUMMY yang gagal parse (`0xdeadbeef`) — keduanya TIDAK butuh world-state valid. Saat dicoba kirim **transaksi asli bertanda tangan** (gas 0, jadi tidak butuh saldo — disetujui user untuk dites), `write2` menolak dengan `"Initial sync is still in progress"` padahal `eth_syncing` sudah melaporkan `false` dan `eth_blockNumber` sudah menunjukkan tinggi chain terkini.

### Root Cause

Log container menunjukkan `write2` dan `call` **berdua** terjebak infinite loop "pivot chasing" SNAP sync: setiap ~9-13 menit memilih pivot block baru, download header/body 100%, lalu `"Waiting for world state heal to finish or pivot update ..."` — **tanpa progress heal apapun**, lalu pivot dipindah lagi ke depan sebelum heal sempat selesai. World-state kedua node ini **tidak pernah valid** sejak awal deploy, meski block height terlihat up-to-date (block header sync jalan normal, cuma state trie yang macet). Ini persis pola yang pernah tercatat di proyek lain (memori sesi `snap_server_root_cause`).

### Perbaikan

1. Coba `sync-mode=FULL` + `bonsai-limit-trie-logs-enabled=true` → **Besu menolak start** (`Cannot enable --bonsai-limit-trie-logs-enabled with --sync-mode=FULL and --data-storage-format=BONSAI`) — kombinasi ini memang tidak didukung Besu.
2. Coba `sync-mode=SNAP` + trie-log-limit dimatikan → **tetap macet di heal step yang sama** (trie-log-limit tidak mempengaruhi mekanisme heal SNAP itu sendiri — dugaan awal salah).
3. **Fix yang berhasil:** `sync-mode="FULL"` + `bonsai-limit-trie-logs-enabled=false` (kombinasi yang DIIZINKAN Besu, wipe data lalu fresh sync). Kedua node selesai FULL sync dari 0 ke ~116.000 block dalam **~2 menit** (chain masih muda, mayoritas block kosong).

**Trade-off yang disadari dan diterima:** `write2` dan `call` sekarang JUGA menyimpan trie log tanpa batas (sama seperti `archive`), bukan cuma `archive` seperti prinsip desain awal ("hanya archive yang boleh tumbuh"). Ini disetujui sebagai solusi pragmatis (chain masih muda ~116k block, disk masih longgar 100GB+/50GB+ free) demi punya write path yang BENAR-BENAR berfungsi sekarang — bukan didiamkan rusak demi kepatuhan prinsip yang jadi tidak berguna kalau node-nya sendiri tidak bisa terima transaksi. **Perlu dipantau ke depan** — kalau storage jadi masalah nyata, opsi baliknya: cari tahu kenapa SNAP peer-serving gagal total (0 progress heal, bukan cuma lambat) sebelum mencoba SNAP+trie-log-limit lagi.

### Insiden Kedua: Container Ke-"retired" Tanpa Sepengetahuan, Ditemukan & Dipulihkan

Setelah fix di atas, `write2`/`call` berulang kali mati (`SIGTERM`, exit 143) tepat menjelang selesai sync ulang — 2 kali di 2 host berbeda. Investigasi (`docker inspect` OOMKilled=false, cek 2 config watchdog systemd di kedua host — keduanya TIDAK menyasar write2/call sama sekali) menunjukkan ini BUKAN otomatis. Ternyata **kedua service ditandai `profiles: ["retired"]` di `docker-compose.yml`** — kemungkinan besar oleh anggota tim lain yang melihat crash-loop SEBELUM fix di atas dan mengira node-nya rusak permanen, tanpa tahu sedang aktif diperbaiki bersamaan.

**Resolusi:** dikonfirmasi user untuk mengaktifkan kembali (hapus `profiles: ["retired"]`), deploy ulang, kedua node stabil (`healthy`, tidak restart lagi) dan lolos verifikasi akhir. **Pelajaran operasional: kalau ada >1 orang pegang akses SSH ke host produksi yang sama, koordinasikan dulu sebelum mengubah `docker-compose.yml`/status container** — insiden ini murni karena 2 pihak bekerja di host yang sama tanpa saling tahu.

### Verifikasi Final — Transaksi Asli Ter-mining (2026-08-28)

Menggunakan private key validator `corp-1` (saldo 0, tapi chain gas-free jadi tetap bisa kirim tx nilai-0 — disetujui user untuk tujuan tes, BUKAN dipakai untuk lalu lintas produksi):

| Tes | Hasil |
|---|---|
| Kirim tx asli langsung ke `write2` (bypass gateway) | ✅ Diterima, **ter-mining di block `0x1c580`, status `0x1` (sukses)** — diverifikasi via HAProxy langsung |
| Kirim tx asli lewat gateway publik (round-robin write pool) | ✅ Diterima (`0xd346cc93...`), **ter-mining di block `0x1cb5a`, status `0x1`** |
| Baca receipt tx di atas lewat pool `call` (routing default gateway) | ✅ Data konsisten — membuktikan read-after-write benar antar pool yang berbeda secara fisik |
| Kedua node setelah fix: `eth_syncing` | `false` (fully synced), stabil >1 menit tanpa restart |

**Kesimpulan akhir: jalur tulis (`write1`+`write2`) dan baca (`call`) sekarang benar-benar siap pakai untuk transaksi sungguhan**, bukan cuma pings/dummy — dibuktikan dengan transaksi asli yang benar-benar tercatat permanen di chain.

---

## 14. Right-Sizing Memory + Migrasi Faucet ke Dashboard — 2026-08-28

### 14.1 RAM Over-Commit di 3 dari 5 Host — Diperbaiki

Ditemukan saat investigasi keluhan RTO di **tesnet** (server terpisah, lihat `tesnet_server/README.md` insiden #5) — pola yang sama dicek di produksi dan ternyata **3 dari 5 host over-committed**:

| Host | Sebelum | Sesudah |
|---|---|---|
| AWS validator1 | 7,3GB limit / 7,6GB RAM (96%) | **4,5GB limit (59%)** |
| Azure validator2+corp1+write2+gateway | 9,9GB limit / 7,7GB RAM (128% 🔴) | **6,2GB limit (79%)** |
| NevaCloud validator3+corp2+call | 4,5GB limit / 3,8GB RAM (115% 🔴) | **3,2GB limit (81%)** |
| NevaCloud validator4+5 | 4,4GB limit / 3,8GB RAM (114% 🔴) | **2,1GB limit (54%, + hapus faucet-app lihat 14.2)** |

Semua `mem_limit` diturunkan ke actual-usage × 1,4-2x (bukan angka sembarangan) berdasar `docker stats` real per container, diterapkan satu container per satu waktu (bukan serentak) dengan verifikasi RPC tetap responsif setelah tiap recreate — tidak ada downtime berarti, semua backend HAProxy tetap `UP` sepanjang proses. Backup tiap `docker-compose.yml` disimpan (`*.bak-before-memfix-20260828`) di host masing-masing.

### 14.2 Faucet Diintegrasikan ke Dashboard (Bukan Aplikasi Terpisah Lagi)

Ditemukan aplikasi faucet produksi lengkap (`hara-faucet-app`: Go backend + kontrak Solidity whitelist + 2 app Next.js terpisah + Caddy sendiri) jalan di host validator4+5 — belum pernah terdokumentasi sebelumnya, kemungkinan dipasang tim lain. Diporting ke TypeScript dan digabung ke `gateway/dashboard/` (halaman `/faucet` publik + `/recipients` admin), mengikuti pola tesnet_server (faucet sebagai halaman dashboard, bukan app terpisah) tapi **mempertahankan fitur yang lebih canggih** dari app aslinya (bukan turun ke versi tesnet yang lebih sederhana):
- Whitelist on-chain (`HaraFaucetWhitelist.sol` di `0xB90798e70318A3FD21C1baa1B02C4f20eF5E2B30`) — cuma wallet yang di-whitelist admin yang bisa klaim
- Dual-signer failover (primary → secondary kalau primary gagal broadcast)
- Cloudflare Turnstile anti-bot
- Cooldown 24 jam per address

**Disederhanakan secara sadar:** auth admin `/recipients` pakai sistem login dashboard yang SUDAH ADA, bukan sistem `ADMIN_USERNAME`/`PASSWORD_HASH`/`SESSION_SECRET` terpisah seperti app lama — satu sistem auth, bukan dua.

App lama sudah di-`docker compose down` (BUKAN dihapus datanya — volume BoltDB lama tetap ada di host validator4+5 untuk referensi), membebaskan ~970MB dari 4 container jadi 0.

**⚠️ Update 2026-09-15/16**: audit stabilitas rutin menemukan ke-4 container
`hara-faucet-app` di host validator4 kembali `Up`. Awalnya dikira misteri (siapa/kenapa
dinyalakan lagi) — **sudah ditemukan penjelasannya 2026-09-16** lewat `/root/.bash_history`
di host itu sendiri: bukan container sisa yang tidak pernah berhenti, dan bukan pihak
ketiga. Urutan aslinya (semua tanggal 2026-08-28, sesi yang sama dengan decommission di
atas): app lama di-`docker compose down` dulu (sesuai narasi di atas) → **kemudian di sesi
yang sama, app lama dinyalakan LAGI** (`docker compose up -d --no-build`, port 80/443/443-udp
dibuka lagi di `ufw`, direspons-cek lewat `curl` ke healthz/login/HTTPS) → **dan dijadikan
systemd service permanen**: `/etc/systemd/system/hara-faucet-app.service` dibuat lalu
`systemctl enable --now hara-faucet-app.service` dijalankan eksplisit (`enabled`+`active`
sampai sekarang, itu sebabnya bertahan 2+ minggu tanpa reboot). Kemungkinan besar dibuka
lagi untuk keperluan verifikasi/pembanding (cek apakah app lama masih bisa dipakai sebagai
referensi/fallback) saat migrasi fitur faucet ke dashboard baru — tapi keputusan
`enable --now` itu tidak pernah disinkronkan balik ke narasi "sudah didekomisioning" di
atas, itulah sumber ketidakcocokan yang ditemukan audit.

**✅ Diputuskan & dieksekusi 2026-09-16**: user mengonfirmasi app lama ini sudah tidak
diperlukan (faucet baru di dashboard `mainnet_production` sudah sepenuhnya menggantikannya).
Didekomisioning benar-benar: 4 container di-`docker compose down` (stopped + removed),
`hara-faucet-app.service` di-`disable` lalu file unit-nya dihapus dari
`/etc/systemd/system/`, dan 3 rule `ufw` yang tadinya dibuka untuk app ini (80/tcp,
443/tcp, 443/udp) sudah dihapus lagi — port itu sekarang tidak melayani apa pun di host
ini. Data lama (volume BoltDB, source code di `/opt/hara-faucet-app/`) **sengaja TIDAK
dihapus** — dibiarkan di disk sebagai referensi historis kalau suatu saat dibutuhkan,
konsisten dengan filosofi dekomisioning awal di §14.2 di atas (stop, bukan hapus data).

**Temuan sampingan penting:** `FAUCET_PRIMARY_PRIVATE_KEY` dari app lama ternyata address-nya **cocok persis dengan `0x72530a08...`** — salah satu dari 3 akun alloc genesis yang statusnya "private key tidak ditemukan" di `access/KEYS_AND_CUSTODY.md` §2 sejak awal sesi. Teka-teki itu sekarang terjawab sebagian — lihat update di file itu.

**⚠️ Butuh aksi Anda:** Turnstile site key/secret yang dibawa dari app lama terdaftar untuk hostname lama (`faucet.<MAINNET_V4_SSLIP_HOST>`) di Cloudflare — perlu ditambahkan domain baru (`dashboard.registry.haratoken.app`) di dashboard Cloudflare Turnstile, atau widget captcha bisa gagal render/verifikasi di lokasi baru. Ini satu-satunya bagian yang butuh akses eksternal (Cloudflare) yang saya tidak punya.

---

## 15. Hardening & Bug Fix Lanjutan — 2026-08-28 (setelah §14)

### 15.1 Kunci Akses Langsung yang Tidak Perlu Publik

- **HAProxy stats page** (`validator1:8404/stats`) — sebelumnya `bind *:8404` (terbuka ke
  publik tanpa auth). Diubah ke `bind 127.0.0.1:8404` (backup
  `haproxy.cfg.bak-before-stats-lockdown`), validasi `haproxy -c` lolos, redeploy via
  `docker restart hara-mainnet-haproxy`. Diverifikasi: akses publik ke `:8404/stats` sekarang
  gagal konek, RPC (`:5797`) tetap normal.
- **Gateway & dashboard IP:port langsung** (`<MAINNET_V2_OLD_IP>:4000/4001/4002`) — sebelumnya
  terbuka ke semua IP meski jalur resmi sudah lewat domain (`rpc.registry.haratoken.app`,
  `dashboard.registry.haratoken.app`). Diubah ke `127.0.0.1:4000:4000` dst di
  `docker-compose.yml` (backup `.bak-before-loopback-lockdown`), mengikuti pola
  `tesnet_server` yang sudah lebih ketat sejak awal. Diverifikasi: IP:port langsung dari
  luar sekarang connection-refused, kedua domain tetap berfungsi normal.

### 15.2 Live Failover Test — HAProxy write pool

`hara-mainnet-rpc1` dihentikan sengaja saat traffic jalan lewat gateway publik: 5 kali
`web3_clientVersion` berturut-turut semua otomatis dialihkan ke `write2`
(`linux-x86_64`, beda arsitektur dari `rpc1`/`linux-aarch_64` — dipakai sebagai bukti
konkret routing pindah, bukan cuma asumsi), termasuk 1 write tx sukses SAAT `rpc1`
mati. `rpc1` di-start ulang dan otomatis rejoin pool HAProxy (`UP`) dalam ~12 detik tanpa
intervensi manual. **Kesimpulan: failover write pool benar-benar transparan ke klien,
zero downtime yang terlihat.**

### 15.3 Sustained Load Test (setelah loopback lockdown §15.1)

Target `https://rpc.registry.haratoken.app/v1/hara_test_...` (bukan IP:port langsung, karena
sudah dikunci), 180 detik, concurrency 20, `eth_blockNumber`:

| Metrik | Hasil |
|---|---|
| Total request | 86.658 dalam 180,1s (**481 req/s** total offered load) |
| Status 200 (berhasil, sesuai `rps_limit=100` key test) | 17.920 (~99,6 req/s rata-rata — persis pas limit yang dikonfigurasi) |
| Status 429 (rate-limited, sesuai desain) | 68.738 |
| Latency (request yang berhasil) | min 6ms / p50 21ms / p95 154ms / p99 177ms / max 1223ms |

**Kesimpulan: rate limiter per-API-key bekerja presisi sesuai konfigurasi** (bukan bocor
atau lebih longgar dari yang di-set), dan latency tetap sehat untuk request yang lolos
meski total *offered load* jauh di atas kapasitas 1 key (4,8x limit yang dikonfigurasi).

### 15.4 Bug Kritis: Gateway Bisa Crash Total dari 1 Koneksi Upstream Gagal

Ditemukan lewat QA menyeluruh pada `tesnet_server` (root cause sama persis di kode dasar
yang sama — lihat `tesnet_server/README.md` bagian "Hardening & bug fix 2026-08-28"):
`gateway/gateway/src/proxy/httpProxy.ts` (`createProxyMiddleware`) tidak punya handler
`error`. Kalau koneksi upstream (HAProxy) gagal — misalnya socket dari
keep-alive pool sudah basi lalu dipakai ulang — `http-proxy-middleware` memancarkan event
`'error'` tanpa listener, yang di Node.js = *unhandled event* = **proses gateway crash
total**, bukan cuma 1 request yang gagal. Semua koneksi aktif ikut putus sampai Docker
restart container.

**Fix** (diterapkan di produksi, sudah di-build & redeploy, diverifikasi
`eth_blockNumber` via `rpc.registry.haratoken.app` tetap normal setelah redeploy):
1. Tambah handler `error` di `createProxyMiddleware` — balas `502` JSON-RPC error yang
   proper ke klien, bukan biarkan proses crash.
2. Guard `proxyReq.headersSent`/`writableEnded` sebelum `setHeader`/`write` di handler
   `proxyReq` (race yang memicu bug ini pertama kali, kelihatan sebagai
   `ERR_HTTP_HEADERS_SENT` di log).
3. Tambah `process.on('uncaughtException'/'unhandledRejection', ...)` di `index.ts`
   sebagai jaring pengaman terakhir — 1 error tak terduga di masa depan tidak boleh lagi
   mematikan seluruh gateway untuk semua user yang sedang aktif.

Ini bug laten yang sudah ada sejak gateway dibangun (§11) — kemungkinan besar penyebab
sebagian kegagalan RPC intermiten yang sulit direproduksi sebelum ini, karena sifatnya
timing-dependent (butuh socket keep-alive yang pas basi saat dipakai ulang).

---

## 16. Dashboard: Tema Disamakan dengan Testnet + Activity Monitor Baru — 2026-08-28

### 16.1 Tema Dashboard

Diminta user: samakan tema dashboard produksi dengan `tesnet_server` "biar lebih bagus".
Sebelum ini, dashboard produksi (warisan langsung dari `cloud_1/gateway/dashboard/`) **sama
sekali tanpa styling** — `system-ui` polos, warna default browser, tidak ada `globals.css`.
`tesnet_server/gateway/dashboard/` sudah punya sistem desain lengkap (dark + neon-green
mengikuti brand haratoken.io, CSS custom properties, kartu/badge/tabel/tombol pill/stat
card/auth-shell).

**Yang dilakukan:**
1. `globals.css` disalin apa adanya dari tesnet (tidak ada teks spesifik-chain di dalamnya,
   langsung portable).
2. Setiap halaman direstyle satu per satu ke class yang sama (`page`/`page-title`/`card`/
   `table-wrap`/`field-row`/`btn`/`badge`/`alert`/`stat-grid`, dst.) — **logic/query SQL
   setiap halaman TIDAK diubah sama sekali**, murni lapisan tampilan. Halaman yang query-nya
   identik dengan tesnet (`users`, `api-keys`, `usage`) di-porting langsung; halaman yang
   kontennya spesifik produksi (`alert-recipients` dengan deskripsi Alertmanager, `faucet`
   dengan copy whitelist-only, `recipients` — tidak ada padanan di tesnet karena faucet
   tesnet tidak whitelist-gated) direstyle mengikuti konvensi yang sama tapi kontennya
   dipertahankan.
3. `users/[id]` — URL contoh API key baru diperbaiki dari placeholder generik
   (`http://<host>:4000/...`) jadi domain asli (`https://rpc.registry.haratoken.app/v1/...`).
4. Nav brand dibedakan: "HARA Mainnet" (produksi) vs "HARA Gateway"/testnet-nya, supaya
   tidak tertukar kalau kedua dashboard dibuka bersamaan di tab berbeda.
5. `layout.tsx` yang sebelumnya lupa import `globals.css` sama sekali — ditambahkan.

**Deploy:** `docker compose build --no-cache dashboard` (build pertama dengan cache biasa
sempat tidak mendeteksi file baru — kemungkinan BuildKit cache stale, `--no-cache`
menyelesaikannya) lalu `docker compose up -d dashboard`. Diverifikasi: CSS custom property
`--primary:#22c55e` ter-load di `/login`, halaman publik `/faucet` menampilkan class baru,
container `healthy`, tidak ada error di log.

### 16.2 Activity Monitor — Halaman Baru (`/activity`)

Diminta user: "berikan juga monitoring rpc kayak testnet". Ternyata **backend-nya sudah
ada** — tabel `rpc_activity_log`/`audit_log` (migration `004_activity.sql`) sudah dibuat dan
diisi sejak fitur `/v1/public` dibangun (§12.2), dikonfirmasi lewat query langsung: 24 baris
`rpc_activity_log` nyata (contoh: `eth_blockNumber` 200, `ws_connect` 101,
`eth_sendRawTransaction` 429), `audit_log` masih 0 baris (aksi admin dashboard belum
memanggil recorder-nya — tidak diperbaiki sesi ini, di luar scope, RPC activity yang
diminta user sudah berfungsi penuh). Cuma **belum ada halaman dashboard** untuk
melihatnya — data terkumpul tapi tidak terekspos.

**Fix:** port halaman `/activity` dari `tesnet_server` apa adanya (skema tabel identik,
query SQL sama persis) — tabel kiri (aksi admin dari `audit_log`), tabel kanan (request RPC
dari `rpc_activity_log`: method, status code dengan warna badge, durasi ms, IP), 50 baris
terbaru masing-masing. Ditambahkan ke nav dashboard. Diverifikasi: route ter-compile
(`ƒ /activity` muncul di build output Next.js), correctly redirect ke `/login` kalau belum
auth (konsisten dengan halaman admin lain), container `healthy` tanpa error setelah deploy.

---

## 17. Insiden: Host Azure Down Total (CPU 100%) — 2026-08-28

### 17.1 Kejadian

Tim infra melaporkan CPU host Azure (`<MAINNET_V2_OLD_IP>` — validator2+corp1+write2+**seluruh**
API Gateway+Dashboard+Caddy) sempat 100% sore hari. Ditemukan saat verifikasi rutin sesi ini:
host **tidak bisa dijangkau sama sekali** — bukan cuma SSH, port 22 dan 4422 keduanya
*closed/filtered* di level TCP (bukan cuma auth/service gagal). `rpc.registry.haratoken.app` dan
`dashboard.registry.haratoken.app` (keduanya lewat Caddy di host yang sama) ikut down total.

**Blast radius terkonfirmasi via validator1 (host lain, tidak terdampak):**
- ✅ Chain TETAP hidup — cuma 1x round-change QBFT (~5 detik, `quorum = 5` tercapai tanpa
  validator2+corp1) lalu lanjut produksi blok normal. **Ini bukti empiris pertama fault
  tolerance QBFT (7 validator, toleransi 2 mati) bekerja nyata** — sebelumnya cuma teori.
- ❌ Seluruh akses publik (`rpc.registry.haratoken.app`, `dashboard.registry.haratoken.app`, faucet,
  kelola API key) down total — **single point of failure**: gateway+dashboard+Caddy semua
  cuma ada di 1 host yang sama, tidak ada failover untuk lapisan ini (beda dari HAProxy
  write-pool yang sudah terbukti failover mulus di §15.2).
- ✅ Tesnet dan `explorer.registry.haratoken.app` (host terpisah) tidak terdampak sama sekali.

Tidak ada akses Azure Portal/CLI dari sesi kerja ini untuk diagnosa/restart VM secara
langsung — resolusi (resize VM, kemungkinan disertai reboot) dilakukan user via Azure Portal.
VM baru: `Standard_D4ls_v5` (4 vCPU/8GB, sebelumnya lebih kecil — spesifikasi persis sebelum
insiden tidak tercatat). **User berencana menurunkan lagi ukuran VM ini setelah stabil** —
lihat §17.3.

### 17.2 Root Cause (Dugaan Kuat, Berdasar Bukti Tidak Langsung)

Host ini menjalankan **9 container sekaligus** tanpa CPU limit apa pun sebelumnya (cuma
`mem_limit` yang pernah dibatasi, CPU tidak pernah disentuh): `validator2`, `corp1`, `write2`
(ketiganya Besu — `write2` khususnya lebih berat sejak dipaksa `sync-mode=FULL` tanpa
trie-log pruning, lihat §13), `gateway`, `dashboard`, `postgres`, `redis`, `caddy`,
`node-exporter`. Tanpa `cpus:` limit, 1 proses yang lagi sibuk (kandidat kuat: `write2`)
bisa memonopoli SEMUA core CPU host — termasuk menyebabkan `sshd` (proses host, bukan
container) kelaparan CPU sampai tidak bisa merespons sama sekali. Pola ini cocok persis
dengan gejala: "CPU 100%" → host jadi tidak bisa di-SSH sama sekali (bukan auth gagal,
tapi TCP handshake sendiri timeout).

### 17.3 Perbaikan: CPU Limit per Container

Ditambahkan `cpus:` (setara `docker run --cpus`) ke SEMUA 9 container di host ini, di
`/opt/hara-mainnet/docker-compose.yml`, `/opt/hara-gateway/docker-compose.yml`,
`/opt/hara-caddy/docker-compose.yml` (masing-masing di-backup
`.bak-before-cpulimit-20260828`):

| Container | CPU limit | Alasan |
|---|---|---|
| `validator2` | 0.7 | Sealer QBFT — perlu cukup untuk block processing tapi dibatasi |
| `corp1` | 0.7 | Sama seperti validator2 |
| `write2` | 0.6 | RPC write node — kandidat root cause, sengaja dibatasi meski proses "penting" |
| `gateway` | 0.2 | Node.js, ringan |
| `dashboard` | 0.2 | Next.js, ringan |
| `postgres` | 0.2 | |
| `redis` | 0.1 | |
| `caddy` | 0.1 | |
| `node-exporter` | 0.1 | |

**Total 2.9 vCPU-equivalent** — sengaja disizing untuk **lantai 2 vCPU** (bukan 4 vCPU yang
sedang aktif sekarang), supaya tetap aman begitu user menurunkan ukuran VM lagi seperti
rencana. Oversubscription CPU (2.9 di atas "budget" 2.0) aman-aman saja secara desain (beda
dari memory) — `cpus:` cuma membatasi MAKSIMUM tiap container, bukan reservasi; artinya
walau semua container ngebut bersamaan, TIDAK ADA satupun yang bisa merampas lebih dari
jatahnya sendiri — sisa kapasitas selalu ada untuk proses host (termasuk `sshd`), persis
mencegah pola kegagalan §17.1 terulang.

**Mem_limit TIDAK diubah** di insiden ini (beda dari §14) — `mem_limit` container Besu
(`validator2`/`corp1`: 3200m, `write2`: 2048m) sengaja disesuaikan dengan `-Xmx` JVM
masing-masing (2400m/2400m/1536m) + overhead off-heap RocksDB/Bonsai; menurunkannya tanpa
juga menurunkan `-Xmx` berisiko OOM-kill JVM. RAM di host ini saat ini SEHAT (4,2GB
available dari 7,8GB, ~54% terpakai) — bukan bagian dari masalah insiden ini, jadi
sengaja tidak disentuh untuk menghindari risiko baru pada validator yang baru pulih.

**Deploy:** 1 container per satu waktu (`node-exporter`→`caddy`→`postgres`→`redis`→
`gateway`→`dashboard`→`write2`→`corp1`→`validator2`, urutan sengaja dari yang paling
tidak kritis ke yang paling kritis), tiap langkah diverifikasi `healthy` + (untuk
Besu) peer count kembali penuh sebelum lanjut ke container berikutnya. Hasil akhir:
9/9 container `healthy`, peer count `0x7` (penuh), block height lanjut normal, RPC
publik dan dashboard kembali HTTP 200.

**Tindak lanjut saat VM diturunkan lagi ukurannya:** limit CPU di atas sudah disizing
untuk 2 vCPU jadi seharusnya tetap aman. Kalau setelah diturunkan CPU masih sering
menyentuh batas (`docker stats` menunjukkan container sering di cap-nya), pertimbangkan
pindahkan `write2` ke host lain yang lebih lega (kandidat: NevaCloud `call` host) alih-alih
menaikkan lagi ukuran VM ini secara permanen.

---

## 18. Rename Domain: `live.haratoken.app` → `registry.haratoken.app` — 2026-09-14

Permintaan user, berlaku juga untuk testnet (`tesnet.haratoken.app` → `mampang.haratoken.app`,
lihat `tesnet_server/docs/CHANGELOG.md`). Cutover total — domain lama dimatikan, bukan
dijalankan paralel maupun redirect.

**Proses**: config (`Caddyfile` di 3 host — validator1/AWS untuk netstats+grafana,
validator2/Azure untuk rpc+dashboard, archive/AWS untuk explorer — plus `.env` gateway)
diubah & divalidasi dulu TANPA di-apply, domain lama tetap 100% jalan selama tahap staging.
Setelah tim infra konfirmasi 5 DNS A record baru (`rpc`/`dashboard`/`netstats`/`grafana`/
`explorer.registry.haratoken.app`) resolve dengan benar (dicek via `cloudflare-dns.com`,
`dns.google` sempat timeout dari mesin kerja tapi ternyata cuma masalah jaringan lokal),
baru dieksekusi: `caddy reload` di ketiga host + restart `gateway`/`dashboard` di Azure
untuk pick up `.env` baru (`NEXT_PUBLIC_GATEWAY_HTTP_URL`, `TURNSTILE_EXPECTED_HOSTNAME`,
`FAUCET_EXPLORER_URL`).

**1 gotcha**: `caddy reload` di host archive (`hara-mainnet-edge-proxy`) TIDAK benar-benar
apply config baru (persis pola yang sama seperti insiden migrasi testnet 2026-09-10) —
perlu `docker restart hara-mainnet-edge-proxy` (bukan cuma reload) untuk domain baru
benar-benar aktif. Situs `<MAINNET_ARCHIVE_SSLIP_HOST>` (fallback lama, di luar scope rename)
sengaja dibiarkan tidak berubah — dikonfirmasi tetap jalan setelah restart.

**Diverifikasi fungsional penuh** (bukan cuma status code): `eth_blockNumber` asli, WS
upgrade (`HTTP 101`), dashboard, faucet page, netstats, grafana (redirect login normal),
explorer — semua di domain BARU. Kelima domain LAMA dikonfirmasi mati total (`HTTP 000`,
TLS gagal — sesuai desain, bukan bug).

**⚠️ Aksi tambahan diperlukan dari Anda**: `TURNSTILE_EXPECTED_HOSTNAME` sudah diarahkan ke
`dashboard.registry.haratoken.app`, tapi site key Cloudflare Turnstile-nya (`GATEWAY_CREDENTIALS.md`)
masih terdaftar untuk hostname lama — perlu ditambahkan domain baru ini di dashboard
Cloudflare Turnstile Anda, kalau tidak widget captcha faucet bisa gagal render/verifikasi.

## 19. Migrasi Topologi: 5 node pindah ke host baru — 2026-09-15 03:31-03:47 UTC

**⚠️ Tabel host di §1-§2 di atas SUDAH TIDAK LENGKAP** untuk kelima node di bawah ini —
dibiarkan apa adanya sebagai catatan historis (sesuai konvensi dokumen ini), tapi JANGAN
dipakai untuk triase on-call tanpa cek bagian ini dulu.

Ditemukan lewat audit stabilitas rutin (bukan laporan insiden) — 5 dari 9 proses Besu
ternyata sudah dipindah ke 5 host baru sama sekali, di AWS/Azure/NevaCloud sekaligus.
**Dikonfirmasi ke tim: migrasi ini sah, direncanakan sendiri oleh tim infra** (bukan
insiden/kompromi keamanan) — dieksekusi lewat 1 script/runbook yang sama (dibuktikan lewat
file backup `docker-compose.yml.bak-migration-20260915034853`/`...104855`, timestamp
identik di 3 provider berbeda) dan `key`/address node baru dikonfirmasi cocok dengan
genesis (`besu public-key export-address`) — bukan validator baru/rogue.

**Topologi baru** (host lama di §1-§2 TIDAK berubah untuk validator1-5 sendiri — cuma
kehilangan "tumpangan" proses yang pindah):

| Proses | Host lama | Host baru | Provider |
|---|---|---|---|
| `rpc1` (write) | numpang di validator1 (<MAINNET_V1_AWS_IP>) | `<MAINNET_RPC1_IP>` | AWS |
| `write2`/`rpc2` | Azure (<MAINNET_V2_OLD_IP>, numpang validator2+corp1) | `<MAINNET_CALL_IP>` (digabung dgn `call`) | NevaCloud |
| `call` | NevaCloud (<MAINNET_V3_IP>, numpang validator3+corp2) | `<MAINNET_CALL_IP>` (digabung dgn `rpc2`) | NevaCloud |
| `corp1` / "validator-6-new" | Azure (<MAINNET_V2_OLD_IP>) | `<MAINNET_V6_IP>` | AWS |
| `corp2` / "validator-7-new" | NevaCloud (<MAINNET_V3_IP>) | `<MAINNET_V7_OLD_IP>` | Azure |
| `validator5` | numpang di host validator4 (<MAINNET_V4_IP>) | `<MAINNET_V5_IP>` | NevaCloud |

validator1 (<MAINNET_V1_AWS_IP>), validator2 (<MAINNET_V2_OLD_IP>), validator3 (<MAINNET_V3_IP>), dan
validator4 (<MAINNET_V4_IP>) **tetap di host lamanya masing-masing** — sekarang cuma
menampung 1 validator per host (kecuali validator1 yang juga masih menjalankan
HAProxy+Prometheus+Grafana, dikonfirmasi live per 2026-09-15).

**Dikonfirmasi via SSH langsung 2026-09-15**: `qbft_getValidatorsByBlockNumber` tetap 7
address genesis yang sama, ketujuhnya aktif round-robin propose blok (sample 20 blok
berturut), tidak ada OOM di host manapun (beda dengan testnet yang OOM 2 kali minggu ini),
semua backend HAProxy `UP`. Satu perhatian: node `call` (di host baru `<MAINNET_CALL_IP>`)
sempat terpantau 82.8% dari `mem_limit` 1GB — dinaikkan ke **1536m** hari ini (headroom
dari `free -h` host yang terverifikasi 2.3GB available, bukan angka sembarang), diverifikasi
turun jauh dan backend `call`/`archive1` tetap `UP` di HAProxy setelah restart.

**⚠️ Risiko akses yang perlu ditindaklanjuti tim**: kelima host baru ini **belum punya
kredensial SSH independen** — satu-satunya jalur masuk saat ini lewat SSH tunnel key milik
`validator1` (systemd service `hara-rpc1-tunnel`/`hara-rpc2-tunnel`/`hara-v6-monitor-tunnel`/
`hara-v7-monitor-tunnel`, key di `/etc/hara-*-tunnel/id_ed25519` pada `validator1`). Kalau
`validator1` down, 5 dari 10 host mainnet jadi tidak terjangkau sama sekali lewat jalur ini.
Rekomendasi: provisioning akses SSH independen (key/user terpisah per host, langsung dari
cloud console masing-masing provider) — di luar yang bisa dieksekusi lewat SSH biasa, perlu
dilakukan tim infra sendiri di sisi cloud provider.

IP lengkap kelima host baru + catatan akses: `access/env-hara-registry.md`.

## 20. Stress Test Menyeluruh & Insiden: `call_backend` Diam-Diam Salah Arah ke `rpc2` — 2026-09-16

User minta stress test nyata untuk write & call pool (bukan cuma spot-check), dengan izin
eksplisit untuk skala lebih besar karena **mainnet belum dipakai produksi sungguhan**.

**Read-load test** (lewat gateway, domain publik): 12.000/12.000 request sukses di
concurrency 200, 0 gagal. Memori `call` (baru dinaikkan ke 1536m di §19) stabil ~54%
sepanjang tes — tidak ada indikasi OOM dari beban baca.

**Write-load test kecil** (48-80 transaksi, wallet sekali-pakai, transfer 0 value): sukses
100% di submit awal.

**Chaos test menemukan bug nyata**: `docker stop hara-mainnet-rpc2` di tengah beban tulis
80 tx → **0 dari 10 sample ter-mining** setelah 15 detik, padahal semua 80 tx tadi sukses
disubmit (dapat tx hash valid). Investigasi: `rpc1` (`txpool_besuStatistics`) menunjukkan
`remoteCount:0` — ke-80 tx itu TIDAK PERNAH sampai lewat gossip P2P ke node lain, karena
semuanya masuk ke mempool lokal `rpc2` lalu `rpc2` mati sebelum sempat menyebarkannya.
**Pelajaran operasional (karakteristik arsitektur multi-write-node, bukan bug yang bisa
di-config-fix)**: tx hash yang berhasil didapat BUKAN jaminan transaksi itu akan ter-mining
kalau node yang menerimanya mati tak lama setelah menerima — praktik terbaik sisi klien
adalah polling receipt dan submit ulang (nonce sama) kalau belum confirmed dalam waktu wajar.

**Investigasi chaos test ini juga membongkar bug konfigurasi nyata**: saat `rpc2` mati,
HAProxy stats menunjukkan `call_backend` IKUT `DOWN` — padahal `call` adalah container
terpisah yang saat itu masih hidup sehat. Ditelusuri: `call_backend`'s server
`rpc2_call` di `haproxy.cfg` menunjuk ke `127.0.0.1:25797` di `validator1`, yang lewat
tunnel `hara-rpc2-tunnel` diteruskan ke `127.0.0.1:15797` di host `<MAINNET_CALL_IP>` —
**itu port RPC milik `rpc2`, bukan `call`** (`call` port aslinya `7797`, benar-benar beda
proses). Root cause: key tunnel `hara-rpc2-tunnel` di `authorized_keys` remote host
dibatasi `permitopen` cuma untuk port 15797/15798/9545 (port rpc2) — tidak pernah diberi
izin ke 7797/7798/9547 (port call), jadi siapa pun yang dulu setup ini kemungkinan
menunjuk sementara ke rpc2 karena belum sempat/lupa membuka akses ke port call yang benar.

**Dampak nyata**: sejak migrasi 2026-09-15, trafik `call` (dimaksudkan terisolasi dari
trafik tulis supaya query berat tidak bersaing dengan kapasitas node penerima transaksi)
**sebenarnya ikut numpang di `rpc2`** — isolasi yang jadi salah satu tujuan utama arsitektur
4-pool ini belum benar-benar aktif selama ini.

**Fix**: tambah 3 `permitopen` baru (`127.0.0.1:7797`, `:7798`, `:9547`) di
`authorized_keys` remote host untuk key `hara-rpc2-tunnel`; tambah 3 local port-forward
baru (`26797→7797`, `26798→7798`, `29547→9547`) di service systemd
`hara-rpc2-tunnel.service`; update `haproxy.cfg`'s `call_backend` server `rpc2_call` dari
`127.0.0.1:25797` → `127.0.0.1:26797`; restart tunnel + `docker restart
hara-mainnet-haproxy` (bukan cuma reload). **Diverifikasi definitif**: `docker stop
hara-mainnet-call` sungguhan sekarang membuat HANYA `call_backend` yang `DOWN` di HAProxy,
`rpc_backend`(rpc1+rpc2) sama sekali tidak terganggu — baru sekarang isolasi call/write
benar-benar aktif. `call` node di-restart lagi setelah verifikasi, semua backend `UP`
lagi, block production tidak terganggu sepanjang proses (validator konsensus tidak
disentuh sama sekali — chaos test ini sengaja dibatasi ke node non-validator saja).

Backup sebelum perubahan: `authorized_keys.bak-before-call-port-fix-20260916` (remote host
<MAINNET_CALL_IP>), `hara-rpc2-tunnel.service.bak-before-call-port-fix-20260916` dan
`haproxy.cfg.bak-before-call-port-fix-20260916` (di `validator1`).

## 21. Konsolidasi Dashboard "1 Pintu": Grafana ke path `/grafana` + bersih-bersih referensi usang — 2026-09-18

User memeriksa langsung dashboard/monitoring dan menemukan 2 hal: (1) tiap layanan
(netstats, Grafana, explorer) punya subdomain sendiri, terpisah dari dashboard utama; (2)
beberapa referensi masih mengarah ke server yang sudah mati. Investigasi (2 agent Explore)
menemukan bahwa working directory utama (`dev/v3-cloud-testnet`, tempat tim benar-benar
bekerja sehari-hari) belum disinkronkan dengan perbaikan yang sudah dikerjakan di branch
ini (`mainnet-final`) tanggal 2026-09-16 — sudah disinkronkan balik terpisah. Di branch
ini sendiri, genuinely baru hari ini: `gateway/README.md` (hapus klaim co-location
`corp1`/`write2` yang sudah pindah host 2026-09-15), `config/static-nodes.json`
(4 dari 11 enode ternyata masih IP pra-migrasi — dikonfirmasi via SSH ke `validator1`,
disinkronkan ke versi live yang benar), dan (di working directory lokal saja, TIDAK bisa
di-commit ke branch ini karena seluruh folder `access/` sengaja gitignored)
`access/KEYS_AND_CUSTODY.md` (host `corp1`/`corp2`/`validator5` diperbarui ke lokasi
pasca-migrasi, diverifikasi via `qbft_getSignerMetrics` — ketiganya masih aktif
menandatangani blok dari host barunya — path file eksak TIDAK bisa diverifikasi langsung
karena 3 host itu cuma bisa diakses lewat tunnel monitoring-only, bukan shell penuh).

**Konsolidasi dashboard** — pendekatan hybrid sesuai arahan user: link menu ditambahkan
di `gateway/dashboard/src/app/layout.tsx` untuk ketiga layanan (netstats, explorer,
grafana), TAPI khusus Grafana sekalian benar-benar disatukan ke path
`dashboard.registry.haratoken.app/grafana/` (Grafana versi 12.1.0 sudah punya fitur resmi
untuk ini):

1. `docker-compose.yml` Grafana (`validator1`, `/opt/hara-mainnet/`) ditambah env var
   `GF_SERVER_ROOT_URL=https://dashboard.registry.haratoken.app/grafana/` +
   `GF_SERVER_SERVE_FROM_SUB_PATH=true`.
2. Caddyfile `validator1` (`grafana.registry.haratoken.app`) ditambah matcher
   `@notGrafana { not path /grafana* }` + `rewrite @notGrafana /grafana{uri}` — pola sama
   seperti fix `@notExplorer` testnet 2026-09-15, tapi kasus ini LEBIH SEDERHANA: aset
   Grafana ternyata relative path (`public/build/...`), bukan absolute root path seperti
   Next.js, jadi tidak perlu pengecualian tambahan untuk aset.
3. Caddyfile dashboard (Azure, `<MAINNET_V2_OLD_IP>`) ditambah blok `handle /grafana/*` (BUKAN
   `handle_path` — perbedaan penting: `handle_path` men-strip prefix `/grafana` sebelum
   diteruskan, padahal Grafana dengan `serve_from_sub_path=true` justru butuh menerima
   prefix itu utuh) yang proxy ke `https://grafana.registry.haratoken.app` dengan
   `header_up Host grafana.registry.haratoken.app` (wajib, supaya Caddy `validator1` tahu
   harus routing ke site block Grafana, bukan default).

Diterapkan via `docker restart`/`docker exec caddy validate` (bukan cuma reload — gotcha
berulang di proyek ini), semua langkah diverifikasi live sebelum lanjut ke langkah
berikutnya (bare domain `grafana.registry.haratoken.app` dicek tetap jalan standalone
SEBELUM Caddyfile dashboard disentuh). **Hasil verifikasi**:
`dashboard.registry.haratoken.app/grafana/` load penuh (title benar, CSS+JS 200, bukan
halaman kosong), link internal Grafana (`href="/grafana/"`, aset `public/...`) terbukti
menghormati sub-path bukan cuma landing page, bare domain `grafana.registry.haratoken.app`
tetap 200 identik seperti sebelumnya, halaman dashboard lain (`/login`) tidak terganggu.

Netstats dan explorer (Blockscout) **SENGAJA TIDAK** dikonsolidasi lewat cara yang sama —
belum ada tes live yang membuktikan aset keduanya aman diperlakukan seperti ini (risiko
sama seperti bug testnet explorer 2026-09-15 kalau asumsi salah). Dicatat di `BACKLOG.md`
sebagai follow-up terpisah, perlu tes live dulu sebelum dikerjakan.

Subdomain lama (`netstats.*`/`grafana.*`/`explorer.*`) **sengaja dibiarkan tetap jalan
paralel** untuk sekarang — direncanakan dimatikan nanti setelah `/grafana` terbukti stabil
dalam periode observasi (dicatat di `BACKLOG.md`), TIDAK dieksekusi sekarang.

Backup sebelum perubahan: `docker-compose.yml.bak-before-grafana-subpath-20260918`
(`validator1`), `Caddyfile.bak-before-grafana-subpath-20260918` (`validator1` dan
`dashboard`/Azure host, keduanya).

## 22. Insiden: `rpc_activity_log` Berhenti Total Mencatat Sejak 2026-09-16 — Root Cause Deadlock + Pool Exhaustion, Diperbaiki 2026-09-21

**Trigger**: laporan transaksi "pending terus" dari teman user lewat API key
`hara_live_c04b...`. Investigasi transaksi itu sendiri murni gap nonce di sisi klien
(nonce 139-140 tidak pernah dikirim, semua nonce ≥141 otomatis tertahan menunggu — bukan
masalah infra; dibuktikan dengan mengirim transaksi baru lewat key yang sama, sukses ditambang
dalam 12 detik). Tapi penelusuran lewat activity log menemukan bug KEDUA yang tidak
terkait: tabel `rpc_activity_log` ternyata **berhenti total mencatat sejak
`2026-09-16 06:08:27`** — 5+ hari kosong meski trafik nyata terus berjalan.

**Root cause** (dikonfirmasi lewat kombinasi log container, `pg_stat_activity`, dan
pembacaan source langsung, bukan dugaan):

1. `gateway/gateway/src/usage/recorder.ts` (fungsi `flush()`, jalan tiap 10 detik lewat
   `setInterval`) **tidak punya guard re-entrancy** — kalau satu `flush()` butuh waktu lebih
   dari 10 detik (wajar di bawah beban), tick berikutnya memulai `flush()` KEDUA yang
   overlap, masing-masing pegang koneksi Postgres sendiri dan race meng-upsert baris yang
   sama di `usage_hourly`/`usage_daily_quota` dengan urutan berbeda — inilah pemicu deadlock
   Postgres (`40P01`) yang tercatat berulang di log container pada `2026-09-15T10:09:51` dan
   `10:15:23-25`.
2. `gateway/gateway/src/db.ts` (pool koneksi Postgres) **tidak punya timeout apa pun**
   (`statement_timeout`/`query_timeout`/`connectionTimeoutMillis` semua tidak diset). Jadi
   begitu satu query dari flush yang overlap itu macet menunggu lock, client itu tertahan
   SELAMANYA — tidak pernah error, tidak pernah balik ke pool. `setInterval` terus memicu
   flush baru tiap 10 detik, tiap satu berpotensi menghabiskan satu slot pool lagi, sampai
   seluruh pool (`recorder.ts` DAN `activityLog.ts`/`rpc_activity_log` sama-sama berbagi
   `pool` yang sama dari `db.ts`) habis total — tanpa ada satu pun error yang sempat
   ter-log, karena macetnya di level "menunggu koneksi kosong", bukan di level query yang
   gagal. Ini menjelaskan kenapa `docker logs hara-gateway` juga berhenti TOTAL (bukan cuma
   pesan error activity log) tepat di tengah-tengah dump objek error Postgres terakhir
   (`2026-09-15T10:15:25`, 94 baris log total sejak container hidup 2026-08-28) — proses
   Node tetap hidup dan tetap sukses meneruskan RPC call (jalur proxy murni, tidak
   menyentuh Postgres), tapi apa pun yang butuh koneksi database diam-diam menggantung
   selamanya, termasuk logging itu sendiri.
3. **Bukan bug baru** — `tesnet_server`'s `recorder.ts` SUDAH punya guard `isFlushing` yang
   sama persis, dengan komentar yang secara eksplisit menjelaskan alasan ini. Perbaikan itu
   pernah dibuat untuk testnet tapi **tidak pernah di-backport ke mainnet** — persis pola
   drift branch-vs-working-directory yang berulang di proyek ini.

**Fix** (diterapkan ke KEDUA network, live + source, 2026-09-21):

- `usage/recorder.ts` (mainnet): ditambah guard `isFlushing` yang identik dengan yang
  sudah ada di testnet dan di `usage/activityLog.ts` mainnet sendiri (mainnet ternyata
  sudah punya guard ini di `activityLog.ts` tapi bukan di `recorder.ts` — hanya satu dari
  dua modul yang diperbaiki sebelumnya).
- `db.ts` (mainnet DAN testnet, defense-in-depth — testnet-nya sendiri tidak pernah
  kena insiden ini karena sudah punya guard, tapi tetap rentan ke SEMBARANG penyebab hang
  lain tanpa timeout): ditambah `statement_timeout: 15000`, `query_timeout: 20000`,
  `connectionTimeoutMillis: 10000`, `idleTimeoutMillis: 30000`. Sekarang query macet apa
  pun sebabnya akan error dalam waktu terbatas (masuk jalur `catch`/`ROLLBACK`/`release`
  yang sudah ada) alih-alih menahan slot pool selamanya.

**Deploy & verifikasi live**:
- Mainnet (`hara-gateway`, Azure `<MAINNET_V2_OLD_IP>`): `docker compose build --no-cache
  gateway && docker compose up -d gateway`. Dites lewat koneksi WebSocket asli ke
  `wss://rpc.registry.haratoken.app/v1/hara_live_c04b...` — baris baru muncul di
  `rpc_activity_log` pada `2026-09-21 15:54:14`, tanpa error di log, mengakhiri kekosongan
  5+ hari.
- Testnet (`hara-tesnet-gateway`, Host B `<TESTNET_HOSTB_IP>`): rebuild+redeploy sama, dites
  lewat `https://rpc.mampang.haratoken.app/v1/public` — tetap jalan normal, tidak ada
  regresi.

**Data yang hilang selama kekosongan (2026-09-16 06:08 s/d 2026-09-21 15:54) tidak bisa
dipulihkan** — `rpc_activity_log` murni catatan aktivitas, bukan sumber kebenaran (billing
tetap akurat dari `usage_hourly`/`usage_daily_quota`, yang juga terdampak deadlock yang
sama tapi TIDAK berhenti total — perlu dicek terpisah apakah ada gap serupa di situ,
dicatat di `BACKLOG.md`).

## 23. Cek Silang dari Insiden Testnet: Risiko Laten SNAP-Sync-Stuck + Watchdog Block-Production — 2026-09-22

**Trigger**: testnet mengalami insiden block time nyangkut 15-64 detik (lihat
`tesnet_server/docs/CHANGELOG.md` 2026-09-22) — root cause: `validator2` testnet stuck
permanen di sync loop ("Unable to retrieve blocks", 11rb+ block tertinggal) karena
`sync-mode="SNAP"` sementara peer-nya tidak menyediakan layanan SNAP server, dan
`bonsai-limit-trie-logs-enabled=true` membatasi window SNAP-sync ke
`bonsai-historical-block-limit` (512) block — lewat dari itu, node yang tertinggal
TIDAK BISA lagi resync via SNAP, permanen stuck sampai diintervensi manual (ganti
sync-mode sementara). Dicek apakah mainnet punya konfigurasi laten yang sama.

**Temuan**: `validator1` DAN `rpc1` (host AWS, `<MAINNET_V1_AWS_IP>`) pakai kombinasi config
IDENTIK: `sync-mode="SNAP"`, `bonsai-historical-block-limit=512`,
`bonsai-limit-trie-logs-enabled=true`. Host ini sendiri sehat (RestartCount=0 di semua
container sejak migrasi 15/16 September, disk 76GB available dari 96GB) — **belum
pernah terpicu di mainnet**, tapi risikonya laten dan sama persis: kalau validator mana
pun tertinggal >512 block (misalnya karena downtime/maintenance/OOM yang lebih lama dari
~43 menit pada block period 5 detik), dia tidak akan bisa resync sendiri.

**Keputusan: TIDAK mengubah `bonsai-historical-block-limit`/`bonsai-limit-trie-logs-enabled`
di mainnet** (berbeda dari fix testnet) — user secara eksplisit mengingatkan rencana
auto-prune trie log yang sudah disepakati justru untuk MENGENDALIKAN biaya storage;
menaikkan retensi atau mematikan pruning akan berlawanan langsung dengan kebijakan itu.
Konfigurasi mainnet saat ini SUDAH BENAR untuk tujuan cost-control — trade-off-nya
(window recovery pendek) diterima, dan mitigasinya diarahkan ke DETEKSI DINI, bukan
menambah retensi.

**Mitigasi yang diterapkan — watchdog block-production health**
(`scripts/hara-block-health-watch.sh`, sama persis dengan yang dipasang di testnet):
dipasang sebagai systemd timer tiap 5 menit di `validator1`
(`http://127.0.0.1:35797`, port RPC lokal Besu — BUKAN lewat HAProxy/gateway, supaya
tidak kena race kondisi failover), mengecek ketujuh address validator
(`0xdcb8f32c...`=validator1, `0xa19335a5...`=validator2, `0xcd8470a6...`=corp1,
`0x0ccd8f0c...`=validator3, `0xe4cf6833...`=corp2, `0x273368c4...`=validator4,
`0x1de17772...`=validator5) memang muncul sebagai `miner` dalam 20 block terakhir, dan
rata-rata block time tidak melebihi 2x `blockperiodseconds` (10 detik). Log-only ke
`/var/log/hara-block-health-watch.log` di server, tidak ada infra alerting baru — cukup
untuk ketahuan JAUH sebelum lewat batas 512 block, bukan sesudahnya. Diverifikasi live:
langsung dijalankan sekali setelah dipasang, hasilnya bersih (chain sehat, semua
validator ikut proposing).

**Runbook recovery**: prosedur lengkap kalau ada validator mainnet yang benar-benar
tertinggal >512 block sudah didokumentasikan di
[`docs/RUNBOOK_VALIDATOR_SNAP_STUCK_RECOVERY.md`](RUNBOOK_VALIDATOR_SNAP_STUCK_RECOVERY.md)
(2026-09-22) — mengganti `sync-mode` ke `FULL` sementara + matikan
`bonsai-limit-trie-logs-enabled` HANYA selama proses resync, lalu WAJIB dikembalikan ke
SNAP+limit setelah caught-up (beda dari testnet yang dibiarkan permanen FULL, karena
mainnet terikat kebijakan cost-control storage). Belum pernah dijalankan sungguhan di
mainnet (belum pernah terpicu) — catat sebagai insiden baru di sini kalau suatu saat
dipakai.

## 23a. IP Publik `validator2`/`corp2` Berubah (Undocumented) + Audit Kesiapan Produksi — 2026-09-28

**Trigger**: user membagikan link + kredensial status monitor baru
(`health.registry.haratoken.app`, dibuat oleh rekan tim awal minggu ini, belum pernah
didokumentasikan di repo ini) sambil menginformasikan trafik data produksi sungguhan
akan mulai memakai chain prod sore ini (2026-09-28). Login ke monitor itu dan
membandingkan dengan dokumentasi yang ada menemukan ketidaksesuaian.

**Temuan**: `validator2` dan `corp2`/"validator-7" ternyata sudah pindah IP PUBLIK
(host fisik SAMA, cuma alamat publiknya berubah — kemungkinan Azure me-reassign IP saat
VM di-restart/resize, karena tidak ada IP publik statis yang di-reserve):
- `validator2`: `<MAINNET_V2_OLD_IP>` → **`<MAINNET_V2_IP>`**
- `corp2`/"validator-7": `<MAINNET_V7_OLD_IP>` → **`<MAINNET_V7_IP>`**

Dikonfirmasi lewat 3 jalur independen: (1) DNS `rpc.registry.haratoken.app` dan
`dashboard.registry.haratoken.app` sudah resolve ke IP baru, (2) `static-nodes.json`
YANG SEDANG DIPAKAI LIVE di `validator1` sudah berisi IP baru (P2P networking TIDAK
pernah terganggu — cuma dokumentasi lokal yang ketinggalan), (3) SSH langsung ke IP
baru berhasil dan menunjukkan container dengan uptime yang konsisten (gateway stack
"Up 5 hari", cocok dengan histori reboot host 2026-09-22 yang sudah didokumentasikan di
insiden gateway sebelumnya — bukan reboot baru, cuma IP-nya yang baru ketahuan berubah).

**Diperbaiki**: `config/static-nodes.json` lokal disinkronkan dari live,
`access/KEYS_AND_CUSTODY.md`, `access/env-hara-registry.md`,
`access/ideal-network-topology-notes.txt`, `access/GATEWAY_CREDENTIALS.md`,
`gateway/README.md`, dan `docs/ARCHITECTURE.md` semua diperbarui ke IP baru.

**Temuan tambahan (positif)**: catatan lama bilang "akses ke 5 host migrasi HANYA lewat
tunnel validator1" — ternyata SUDAH BISA diakses langsung pakai key masing-masing
(`RPC-1-NEW.pem` untuk rpc1, `key-validator-6-New.pem` untuk corp1, `Validator-7-new_key.pem`
untuk corp2 — port 4422, user `ubuntu` untuk rpc1/corp1, `azureuser` untuk corp2).
`ARCHITECTURE.md` diperbarui. `validator5` dan `rpc2`/`call` belum diverifikasi ulang
akses langsungnya — dicatat di `BACKLOG.md`.

**Audit kesiapan produksi (dipicu info trafik prod sore ini)** — semua dicek langsung,
bukan asumsi:
- Gateway (`<MAINNET_V2_IP>`): 0 restart, uptime 5+ hari stabil, CPU <1%, memori semua
  container <45% dari limit, disk 98GB available dari 123GB. Latency `eth_blockNumber`
  via `/v1/public` normal (~340ms, cocok baseline lama) setelah satu request pertama
  sempat 8 detik (cold-start/DNS, bukan pola berulang — retest langsung normal).
- Deadlock fix `recorder.ts`/`db.ts` (§22) masih tervalidasi: 0 error deadlock di log
  sejak deploy 2026-09-21, `rpc_activity_log` tetap tercatat (jumlah kecil murni karena
  trafik WS memang masih rendah, bukan tanda bug).
- Ketujuh validator (per status monitor teman tim): semua `up`, konsisten dengan
  pengecekan langsung di validator1 (`RestartCount=0`, watchdog §23 bersih).
- **Arsitektur auth/rate-limit dicek langsung (hasil positif)**: `lookupApiKey()`
  (`auth/keyCache.js`) cache API key di Redis TTL 60 detik — Postgres cuma kena hit saat
  cache-miss (sekali per key per 60 detik), BUKAN per-request. Rate limiting
  (`rateLimit/limiter.js`) pakai `RateLimiterRedis` sepenuhnya — hot path request TIDAK
  pernah sentuh Postgres sama sekali. Postgres cuma dipakai untuk lookup jarang (cache
  miss) + flush usage/activity tiap 10 detik (§22/§23) — desain ini sudah tepat untuk
  menahan lonjakan trafik tanpa jadi bottleneck di Postgres. 4 API key aktif saat ini:
  2 dengan `rps_limit=10000` (kuota besar, terlihat untuk pemakaian produksi), 1 dengan
  `rps_limit=10` (dibuat 2026-09-15, kemungkinan scope terbatas — perlu dikonfirmasi ke
  tim apakah ini yang dipakai trafik prod sore ini atau key lain).
- **Belum pernah diuji stress test dengan pola trafik produksi ASLI** (concurrent
  request nyata dari sistem prod, bukan sintetis) — `QA/STRESS_TEST_RESULTS.md` masih
  berbasis skrip sintetis. Connection pool Postgres (`db.ts`, tanpa `max` eksplisit,
  default node-postgres 10) belum pernah diuji di bawah beban ini, tapi karena hot path
  tidak sentuh Postgres sama sekali (lihat poin di atas), risikonya rendah.

## 23b. Insiden 502 Berulang Sejak Trafik Produksi + Outage Deploy — 2026-09-29

**Trigger**: user melaporkan teman mereka "merecord sesuatu namun error semua". Investigasi
lewat log Caddy (`hara-gateway-caddy`, host `<MAINNET_V2_IP>`) — bukan log gateway/Postgres
yang sebelumnya sudah dicek bersih di §23a.

**Temuan root cause**: Caddy mencatat error berulang `"msg":"EOF"` dan `"msg":"http:
server closed idle connection"`, status 502, pola timing cocok dengan race klasik
Node.js + reverse proxy: Node's `http.createServer()` default `keepAliveTimeout` HANYA
5 detik, sementara Caddy's `reverse_proxy` transport menyimpan koneksi idle ke backend
lebih lama dari itu sebelum dipakai ulang — begitu Caddy reuse koneksi yang sudah
ditutup diam-diam oleh Node, client dapat EOF/502.

**Skala masalah**: 109 total error 502 sejak `2026-08-28` (background rate ~2/jam,
sudah ada SEBELUM trafik produksi — race ini laten sejak awal), TAPI **melonjak drastis
tepat saat trafik produksi mulai 2026-09-28**: 61 error dalam SATU JAM (11:00 UTC), 10+8
di jam-jam sekitarnya. Konsentrasi trafik lebih tinggi = lebih sering kena race idle-
timeout yang sama. 2 API key terdampak (`hara_live_4c47...` 86 error, `hara_live_c04b...`
20 error).

**Fix**: `gateway/gateway/src/index.ts` — tambah
`httpServer.keepAliveTimeout=120000` + `httpServer.headersTimeout=121000` (Node
mewajibkan `headersTimeout` > `keepAliveTimeout`). Nilai 120 detik dipilih untuk
melampaui idle-timeout reverse proxy manapun yang wajar. Dibangun (`tsc` clean), di-deploy
lewat `docker compose build --no-cache gateway && up -d`.

**Insiden tambahan SELAMA proses deploy fix ini (disebabkan sendiri)**: host
`<MAINNET_V2_IP>` cuma **2 vCPU**, dipakai bareng validator2 (Besu) + seluruh stack gateway.
`docker compose build --no-cache` (compile ulang total, bukan incremental) memicu load
average 8+ di mesin 2-core — cukup untuk membuat Caddy TIDAK BISA merespons koneksi
BARU sama sekali (`ETIMEDOUT` di sisi client) selama beberapa menit, termasuk permintaan
dashboard/RPC user yang sedang berlangsung saat itu. Setelah build selesai dan load
kembali normal (~1.9), **Caddy tetap tidak pulih sendiri** dan perlu `docker restart
hara-gateway-caddy` manual — pola yang sama seperti gotcha Caddy yang sudah dikenal di
proyek ini sejak awal (reload/idle state tidak cukup, perlu restart penuh).

**Diverifikasi setelah restart Caddy**: RPC (`/v1/public`) dan dashboard kembali normal
(~0.2-0.36 detik, HTTP 200/307/429 sesuai perilaku normal), `keepAliveTimeout` fix
terkonfirmasi live di `dist/index.js`, kedua container (`hara-gateway`,
`hara-gateway-caddy`) `RestartCount=0` (bukan crash-loop, restart manual sekali cukup).

**Pelajaran untuk deploy berikutnya di host 2-vCPU ini**: hindari `--no-cache` di jam
trafik aktif; kalau harus rebuild, pertimbangkan build image di mesin terpisah dan
`docker compose up -d` image jadi (BuildKit remote/registry) daripada build-in-place di
host produksi yang juga menjalankan validator langsung.

## 23c. Dua Insiden OOM Terpisah, Baru Ketahuan Saat Cek Kondisi Rutin — 2026-09-29

**Trigger**: pengecekan kondisi rutin (bukan laporan user) menemukan `RestartCount`
naik di dua tempat yang sebelumnya selalu 0 — `hara-mainnet-validator1` (1) dan
`hara-gateway-caddy` (2, sebelumnya 1 dari restart manual insiden §23b).

**1. `validator1` OOM-killed 2026-09-28 11:01 UTC** (`dmesg` konfirmasi: kernel
membunuh proses `java`/Besu karena limit memory cgroup) — **dan MASIH di 96.22% dari
`mem_limit` 1536m saat ditemukan**, artinya risiko OOM berikutnya aktif kapan saja, bukan
cuma insiden masa lalu. Signifikan karena `validator1` bukan cuma validator QBFT, tapi
juga host tunggal untuk HAProxy + Prometheus + Grafana + Netstats — OOM di sini
berpotensi mengganggu konsensus DAN seluruh monitoring sekaligus. Host sendiri longgar
(7.6GB total, cuma dipakai ~3.7GB) — batasnya di `mem_limit` container yang kekecilan,
bukan kapasitas host. **Diperbaiki**: `mem_limit`/`memswap_limit` dinaikkan
`1536m`→**`2560m`** di `/opt/hara-mainnet/docker-compose.yml`
(backup: `docker-compose.yml.bak-before-memfix-20260929`), diterapkan via
`docker compose up -d validator1`. Diverifikasi: block production tetap presisi 5
detik selama & sesudah restart, penggunaan memori turun ke 30% dari limit baru.

**2. `hara-gateway-caddy` OOM-killed 2026-09-29 04:08 UTC** — `mem_limit`-nya cuma
**80m**, jauh lebih kecil dari container lain di stack yang sama (gateway 300m,
dashboard 400m) — undersized sejak awal, bukan regresi baru. Ini pemicu langsung burst
502 (`"msg":"EOF"`, semua persis berdurasi ~35 detik — kemungkinan besar respons yang
sedang diproses ikut mati bareng proses Caddy yang di-kill) yang sempat terlihat di log
sebelum diselidiki lebih lanjut. **Diperbaiki**: `mem_limit` dinaikkan `80m`→**`200m`**
di `/opt/hara-caddy/docker-compose.yml` (host masih 4.6GB available, aman jauh),
diterapkan via `docker compose up -d caddy`. Diverifikasi: RPC & dashboard normal
(~0.28 detik, HTTP 200/307 sesuai ekspektasi).

**Kenapa baru ketahuan sekarang**: watchdog `hara-block-health-watch.sh` (di
`validator1`) cuma cek partisipasi proposing & block time — tidak cek `RestartCount`
atau `mem_limit` percentage container manapun. Insiden #1 di atas TIDAK memicu watchdog
sama sekali (block production tidak sampai terganggu, validator lain menutupi
selama restart singkat) — persis skenario yang membuktikan watchdog ini perlu dilengkapi
pengecekan memori juga, bukan cuma block-production, kalau mau menangkap kelas insiden
ini lebih awal. Dicatat di `BACKLOG.md`.

---

## 24. Investigasi Teori "Bentrok Nonce Multi-RPC" + Fix Kapasitas CPU `call`/`rpc2` — 2026-09-30

**Konteks**: user melaporkan rekan infra menemukan (via otak-atik proxy pagi ini) dugaan
root cause "timeout receipt" yang dialami temannya: proxy menembak ke 4 target RPC
(write, write2, call, call-archive) dan menyebabkan bentrok/nonce berantakan karena
antar-backend tidak saling terinformasi. Diminta analisa menyeluruh + sekaligus cek
apakah beban VM masih sesuai kapasitas.

### Verdict: mekanisme "round-robin 2 write node" seperti dulu didokumentasikan (§10/§11)
### SUDAH TIDAK BERLAKU LAGI di config live saat ini — bukan penyebab langsung

Ditelusuri live ke `haproxy.cfg` (`validator1`, live per hari ini `01:33` UTC — diedit
ulang pagi ini, tidak ada backup tersimpan untuk edit spesifik ini):

```
backend rpc_tx_backend
    server rpc1 127.0.0.1:15797 check inter 5s fall 3 rise 2 maxconn 300
    server rpc2 127.0.0.1:26797 check inter 5s fall 3 rise 2 maxconn 300 backup
```

`rpc2` (dulu `write2`, lihat §19) sekarang berstatus **`backup`** — HAProxy HANYA
mengalihkan tulis ke situ kalau `rpc1` gagal healthcheck 3x berturut (~15 detik), BUKAN
round-robin aktif-aktif seperti desain awal 2026-08-27 (§10/§11). Ini beda dari yang
didokumentasikan sebelumnya (`rpc_backend` round-robin `rpc1`+`write2`) — kemungkinan
diubah tim infra di suatu titik antara 2026-09-16 dan hari ini, tidak terdokumentasi
sebelumnya. Dicek juga `archiveRouter.ts` (kode gateway, `gateway/gateway/src/tx/archiveRouter.ts`):
classifier method `eth_sendRawTransaction` SELALU dan HANYA diarahkan ke satu target
class ("write"), tidak pernah bercabang ke 2 pool sekaligus dari sisi gateway — jadi
tidak ada mekanisme yang membuat gateway sendiri memilih-milih write1 vs write2 per
request. Kesimpulan: **secara struktur, tidak ada jalur yang membuat 2 transaksi dari
sender yang sama mendarat di 2 node Besu independen di saat bersamaan** dalam kondisi
normal (`rpc1` sehat) — mekanisme "bentrok nonce dari round-robin tulis" yang persis
seperti dijelaskan tidak mungkin terjadi di config saat ini.

**Verifikasi kesehatan `rpc1` (satu-satunya write node aktif)**: `RestartCount=0`, up 2
minggu tanpa henti, 0 OOM (`dmesg`), 0 error/warning/disconnect/exception/reorg di log
12 jam terakhir, `txpool_besuStatistics` kosong total (`localCount:0, remoteCount:0`)
saat dicek. Tidak ada indikasi failover ke backup pernah aktif baru-baru ini.

### Yang SUDAH lebih dulu didokumentasikan (2026-09-16, §20) dan MASIH relevan

Chaos test 2026-09-16 sudah menemukan risiko nyata yang MIRIP tapi BUKAN SAMA dengan
teori nonce di atas: kalau node write yang menerima tx mati SEBELUM sempat gossip P2P ke
peer lain, tx hash yang didapat klien valid tapi tx itu sendiri hilang (0/10 ter-mining
dalam sample waktu itu). Ini karakteristik arsitektur multi-write-node yang **sudah
disadari & diterima** — mitigasi yang diputuskan sengaja di sisi KLIEN (poll receipt,
submit ulang dengan nonce sama kalau belum confirmed), BUKAN nonce-lock di server (sudah
diriset & ditolak 2026-08-27 karena bikin lemot, lihat memori proyek
`nonce_guard_perf_lesson`). Kemungkinan besar **inilah realita yang paling cocok
menjelaskan "timeout receipt" hari ini**: rekan infra melakukan perubahan LIVE ke
`haproxy.cfg` (01:33 UTC) dan `docker-compose.yml` (08:35 UTC, container `call`/`rpc2`
di-recreate) pagi ini — kalau ada transaksi dikirim persis dalam jendela maintenance
singkat itu, gangguan sesaat pada jalur tulis saat transisi jauh lebih masuk akal sebagai
penyebab dibanding cacat arsitektur nonce yang persisten (yang buktinya, per investigasi
di atas, sudah tidak ada di config sekarang).

### Temuan sampingan: node `call`/`rpc2` (<MAINNET_CALL_IP>) sekarang menanggung 3 peran
### sekaligus dengan CPU JAUH di bawah kapasitas host — DIPERBAIKI

Container standalone `hara-mainnet-rpc2` (proses Besu terpisah, port asli `15797`) sudah
**tidak ada lagi** di host ini (dihapus dari `docker-compose.yml` pagi ini, `docker ps -a`
tidak menampilkannya sama sekali, bukan crash — port `15797` di host itu sekarang
"connection reset by peer", bukan timeout). Peran backup-write-nya sudah diserap
sepenuhnya oleh proses `hara-mainnet-call` yang sama (satu proses Java, PID yang sama,
sekarang dengar di port `7797`/`7798` [call+write-backup] SEKALIGUS port aslinya) —
dikonfirmasi genesis/chain sama (`chainId 0x1d97c`), block height sama persis dengan
`rpc1` di saat dicek (`0xa735e` keduanya), `eth_syncing=false`.

**Masalah kapasitas ditemukan**: `docker-compose.yml` service ini masih `cpus: 0.35` —
warisan dari saat host ini menjalankan 2 container terpisah (rpc2 + call berbagi 1
vCPU). Sekarang jadi 1 container tunggal menanggung 3 peran (call reads + write-failover
+ dekat-archive) di host 3 vCPU yang **hampir seluruhnya menganggur** (`docker stats`
CPU% 35.61% — persis di ambang batas 0.35 core-nya, indikasi sudah/nyaris throttled).

**Diperbaiki**: `cpus: 0.35` → **`2.0`** di `/opt/hara-mainnet/docker-compose.yml`
(<MAINNET_CALL_IP>, backup `docker-compose.yml.bak-before-cpu-fix-20260930`), diterapkan
via `docker compose up -d`. Diverifikasi: container `healthy` dalam ~1 menit, CPU usage
turun ke 22.69% (dari ceiling yang jauh lebih besar, longgar), semua backend HAProxy
(`rpc_tx_backend/rpc2`, `rpc_read_backend/rpc2`, `call_backend/rpc2_call`) balik `UP`
setelah restart singkat, chain height lanjut normal.

### Kesimpulan untuk 3 pertanyaan user

1. **Teori bentrok nonce dari 4 target round-robin**: TIDAK berlaku di config live saat
   ini (write pool primary+backup, bukan round-robin aktif-aktif; gateway tidak pernah
   split 1 jenis request ke 2 pool). Risiko yang MIRIP (tx hilang kalau node penerima
   mati sebelum gossip) sudah diketahui sejak 2026-09-16 dan sengaja dimitigasi di sisi
   klien, bukan server.
2. **Persiapan migrasi ke proxy server (`<MAINNET_GATEWAY_IP>`)**: status tidak berubah, masih
   di Tahap 1, masih menunggu source code `hara-status` dari rekan yang membuatnya
   (lihat entri BACKLOG). Tidak ada langkah baru yang bisa dilanjutkan hari ini.
3. **Beban VM vs kapasitas**: ditemukan & diperbaiki 1 limit CPU yang jauh di bawah
   kapasitas riil host (`call`/`rpc2`, 0.35→2.0 core). Host-host lain belum di-sweep
   ulang di sesi ini — direkomendasikan sebagai tindak lanjut kalau user mau cakupan
   penuh 10 host.

---

## 25. Uji Empiris: Kapasitas Nonce-Berurutan-1-Sender + Root Cause Sebenarnya "Timeout Receipt" — 2026-09-30

Melanjutkan §24 (teori bentrok nonce dari round-robin sudah ditolak berdasar config).
User meminta verifikasi konkret: apakah RPC ini benar-benar sanggup menampung puluhan
sampai ratusan transaksi dari SATU pengirim yang sama dalam 1 block dengan nonce
berbeda-beda, tetap lancar. Diuji langsung (bukan dianalisis dari kode saja) memakai
wallet baru sekali-pakai (tanpa dana, chain gas-free jadi tidak perlu saldo) via
endpoint publik asli (`rpc.registry.haratoken.app`) dengan API key produksi.

### 25.1 Skenario A — nonce dihitung lokal di sisi klien sebelum kirim (pola BENAR)

100 transaksi nilai-0 dikirim BERSAMAAN (`Promise.all`) dengan nonce 0-99 yang sudah
dihitung terlebih dahulu di sisi klien (bukan query per-transaksi):

| Metrik | Hasil |
|---|---|
| Terkirim (diterima RPC) | **100/100** |
| Ter-konfirmasi (nonce maju penuh) | **100/100** |
| Block yang dipakai | **1 block saja** (`#687003`) — semua 100 tx masuk ke block yang sama |
| Receipt hilang | 0 |
| Waktu kirim total | ~11.6 detik (~116ms/tx, kemungkinan dibatasi rate-limit API key, bukan kapasitas chain) |

**Kesimpulan 25.1**: klaim kapasitas user TERBUKTI — bahkan melebihi ekspektasi
("puluhan-ratusan" → tercapai 100, seluruhnya masuk 1 block, 0 gagal).

### 25.2 Skenario B — nonce di-query ULANG per-transaksi via `'latest'`/`'pending'` (pola client naif)

User bertanya: bagaimana kalau klien meng-query nonce (`eth_getTransactionCount`)
ulang sebelum SETIAP kirim, bukan menghitung lokal? Diuji langsung, 15 transaksi
berurutan (loop sekuensial, query-lalu-kirim tiap iterasi), dibandingkan 2 tag block:

| Tag nonce | Sukses | Gagal | Nonce unik terpakai (dari 15 percobaan) |
|---|---|---|---|
| `'latest'` | **3/15** | 12/15 (`nonce has already been used`, dll) | cuma 3 |
| `'pending'` | **13/15** | 2/15 | 13 |

**Root cause terbukti empiris**: tag `'latest'` di JSON-RPC Ethereum HANYA
merefleksikan block TER-MINING terakhir — TIDAK ikut memperhitungkan mempool/transaksi
pending. Karena block period chain ini 5 detik, klien yang query `'latest'` lalu kirim
lebih cepat dari 5 detik akan terus mendapat nonce yang SAMA (stale) berkali-kali
sampai block berikutnya benar-benar ter-mining — menyebabkan tabrakan nonce dengan
transaksi milik SENDIRI yang baru saja dikirim. `'pending'` jauh lebih aman (ikut
menghitung mempool) tapi TETAP tidak 100% bebas race — ada jendela singkat antara
"transaksi diterima ke mempool" dan "hitungan pending ter-update", cukup buat 2 request
yang sangat rapat saling tabrakan.

**Implikasi untuk laporan "timeout receipt" (§24)**: pola client-side seperti ini —
BUKAN routing HAProxy/multi-backend (sudah ditolak §24) — kemungkinan besar penyebab
sebenarnya kalau kode/wallet pengirim memakai `'latest'` (atau default library yang
diam-diam memakai `'latest'`) untuk menentukan nonce sebelum tiap kirim, terutama saat
mengirim banyak transaksi berdekatan waktu (dalam window <5 detik).

**Rekomendasi ke tim/rekan yang membuat client pengirim** (urutan dari paling aman):
1. **Terbaik**: hitung nonce di sisi klien sendiri — ambil sekali di awal, lalu naikkan
   manual per transaksi berikutnya dalam 1 batch (pola persis §25.1 yang terbukti
   100/100 sukses).
2. **Lebih aman dari `'latest'`, tapi belum sempurna**: pakai tag `'pending'` kalau
   tidak bisa melacak nonce lokal.
3. **Hindari**: query `'latest'` sebelum tiap kirim dalam loop yang lebih cepat dari
   block time (5 detik) — pola ini yang terbukti gagal di atas.

Panduan lengkap untuk developer eksternal/internal:
[`docs/PANDUAN_DEVELOPER_TRANSAKSI_VOLUME_TINGGI.md`](PANDUAN_DEVELOPER_TRANSAKSI_VOLUME_TINGGI.md).
Tidak ada perubahan infrastruktur/server yang diperlukan dari temuan ini — murni
rekomendasi pola implementasi client, dicatat di `BACKLOG.md` sebagai item komunikasi
ke tim/rekan yang relevan.

---

*Sumber: SSH langsung ke semua 5 host (2026-08-20 s/d 2026-08-28), RPC live call, `besu public-key export-address` dijalankan di ketujuh container untuk pemetaan §2, info topologi dan klarifikasi §9 dikonfirmasi tim via chat 2026-08-27, deployment `write2`/`call`/Caddy/domain/faucet dilakukan langsung via SSH+docker compose, stress test §12, verifikasi tx asli §13, dan right-sizing memory + migrasi faucet §14 dijalankan langsung dari mesin kerja. File konfigurasi: [`config/genesis.json`](config/genesis.json), [`config/static-nodes.json`](config/static-nodes.json).*
