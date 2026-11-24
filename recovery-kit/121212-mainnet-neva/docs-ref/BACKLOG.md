# Mainnet — Backlog & Rekomendasi Perbaikan

Item yang diketahui belum diselesaikan atau sengaja ditunda, per 2026-09-16. Bukan bug
aktif (kalau ada bug aktif, itu ada di `docs/STATUS_TERDEPLOY_2026-08-20.md` sebagai
insiden terbuka) — ini murni daftar peningkatan yang belum dikerjakan.

## Perlu tindakan

- **Host `validator3` (<MAINNET_V3_IP>) memicu warning "host key berubah" saat SSH**
  (2026-09-29) — kemungkinan besar VM di-rebuild/replace di IP yang sama (bukan indikasi
  kompromi, data yang kembali cocok dengan identitas yang diharapkan), tapi belum
  dikonfirmasi ke tim secara out-of-band. Lihat `docs/ARCHITECTURE.md`.
- **`rpc2`/`call` tidak punya container `node-exporter`** (satu-satunya dari 10 host
  mainnet yang begitu, ditemukan 2026-09-29) — metrics Besu-nya sendiri sudah masuk
  Prometheus, tapi metrics host-level (CPU/RAM/disk) host ini tidak termonitor sama
  sekali. Perlu deploy container `node-exporter` baru di host itu (bukan cuma edit
  config Prometheus) — lihat `docs/ARCHITECTURE.md` §Monitoring. Catatan: RAM host ini
  paling ketat dari semua host (924MB available dari 3.8GB), pertimbangkan itu saat
  deploy container tambahan.
- **Host cadangan `<MAINNET_GATEWAY_IP>` (role "proxy", akses dikonfirmasi & login berhasil
  2026-09-29) genuinely KOSONG** — `docker ps` tidak menunjukkan satu pun container
  jalan (3 vCPU, 3.1GB RAM available, 55GB disk free, semua nganggur). User menyebutkan
  rencana memindahkan sebagian beban dari host validator2/gateway (2 vCPU, sudah
  terbukti jadi bottleneck di insiden §23b) ke sini — **belum ada keputusan konkret
  komponen mana yang dipindah** (kandidat: Postgres/Redis, atau salah satu proses
  gateway/dashboard). Perlu didiskusikan lebih lanjut sebelum eksekusi: apa yang
  dipindah, bagaimana migrasi datanya (terutama Postgres, ada data user/API
  key/usage log), dan update DNS/koneksi apa saja yang perlu menyesuaikan.
  **Panduan eksplisit dari user (2026-09-29)**: layanan LAMA di host validator2/gateway
  JANGAN dihapus/dimatikan dulu saat migrasi ini dieksekusi — domain/DNS perlu dipindah
  ke host baru dulu dan diverifikasi jalan, baru layanan lama boleh dipertimbangkan
  untuk dimatikan (pola sama seperti keputusan subdomain lama Grafana/Netstats/Explorer
  di §21 — jalan paralel dulu, jangan buru-buru cabut akses cadangan).
- **Watchdog `hara-block-health-watch.sh` tidak menangkap insiden OOM** (ditemukan
  2026-09-29, lihat §23c) — `validator1` OOM-killed 2026-09-28 dan `hara-gateway-caddy`
  OOM-killed 2026-09-29, KEDUANYA baru ketahuan lewat pengecekan `RestartCount` manual,
  bukan dari watchdog. Watchdog saat ini cuma cek partisipasi proposing + block time,
  tidak cek `RestartCount`/persentase `mem_limit`. Perlu ditambahkan pengecekan memori
  (mirip `hara-mem-watch` yang sudah ada di testnet) ke host-host mainnet juga —
  belum ada sama sekali di mainnet saat ini.
- **Perlu konfirmasi ke tim: API key mana yang dipakai untuk trafik produksi sore
  2026-09-28** (lihat §23a) — ada 4 API key aktif dengan `rps_limit` sangat berbeda
  (10000, 10000, 10, dan key test 100). Kalau trafik prod ternyata lewat key
  `rps_limit=10` (dibuat 2026-09-15), itu bisa jadi bottleneck tak terduga begitu
  volume nyata mulai masuk.
- **Cloudflare Turnstile site key belum menambahkan hostname baru**
  (`dashboard.registry.haratoken.app`) sejak rename domain 2026-09-14 — widget captcha
  faucet bisa gagal render/verifikasi sampai ini ditambahkan manual di dashboard
  Cloudflare Turnstile.
- **Cek gap data di `usage_hourly`/`usage_daily_quota` selama 2026-09-15 s/d 2026-09-21**
  (lihat `docs/STATUS_TERDEPLOY_2026-08-20.md` §22) — deadlock pool-exhaustion yang
  bikin `rpc_activity_log` berhenti total kemungkinan juga bikin sebagian request
  usage-tracking (dipakai untuk quota/billing) gagal ter-flush selama window yang sama.
  Belum dicek apakah ini bikin `request_count` di periode itu under-counted.
- **Risiko laten: validator yang tertinggal >512 block tidak bisa resync sendiri**
  (ditemukan 2026-09-22 lewat cek silang insiden testnet, lihat §23). Ketujuh validator
  QBFT + `rpc1` pakai `sync-mode=SNAP` + `bonsai-limit-trie-logs-enabled=true` — sengaja
  dipertahankan (bukan bug) demi kontrol biaya storage sesuai rencana auto-prune yang
  sudah disepakati, TAPI konsekuensinya window recovery SNAP cuma ~43 menit (512 block
  @ 5 detik). **Koreksi 2026-09-29**: `rpc2`/`call` TERNYATA `sync-mode=FULL` +
  trie-log-limit MATI — TIDAK kena risiko ini (tidak diketahui sejak kapan/kenapa
  konfigurasinya beda, perlu ditanyakan ke tim). Belum pernah terpicu di node manapun
  yang masih SNAP, dan TIDAK diubah konfigurasinya (lihat §23 untuk alasan). Watchdog
  deteksi dini sudah dipasang (lihat "Sudah diselesaikan"), dan runbook recovery manual
  sudah dibuat (`docs/RUNBOOK_VALIDATOR_SNAP_STUCK_RECOVERY.md`, 2026-09-22) — belum
  pernah dijalankan sungguhan di mainnet, jadi masih perlu divalidasi/disesuaikan kalau
  suatu saat benar-benar dipakai.
- **Storage host archive/Blockscout (`<MAINNET_ARCHIVE_IP>`) tumbuh mengikuti jumlah transaksi,
  belum ada alert disk** (ditemukan 2026-10-09, rincian di "Sudah diselesaikan"). **Update 2026-10-12: pertumbuhan TIDAK melambat**
  (perkiraan 9 Okt bahwa laju turun ke ±1,3 GB/hari ternyata terlalu optimis): sejak
  pembersihan 9 Okt disk naik ±19 GB dalam 2,6 hari (±6,5-7,8 GB/hari) karena volume
  transaksi tetap tinggi (89 ribu / 162 ribu / 104 ribu tx per hari pada 9 / 10 / 11
  Okt). Kini 105 GiB dari 193 GiB terpakai (54%, sisa ≈89 GiB), habis dalam ±14 hari
  (±26 Okt) pada laju ini. DB Blockscout 17 → 20 GB (+±1 GB/hari); sisanya (±16 GB,
  hasil pengurangan, belum diukur langsung) Besu archive. Prometheus sudah
  mengumpulkan `node_filesystem_*` host ini, tinggal alert (Alertmanager masih dormant).
  Usulan: alert saat sisa disk <30% dan perencanaan kapasitas sesuai volume consumer;
  opsi lanjutan: pindahkan DB Blockscout ke volume terpisah. Hal kecil terkait: (a)
  `/tmp` container Besu archive menimbun native library + folder JFR tiap JVM restart
  mendadak (tidak dibersihkan JVM) — periksa `RestartCount`/`StartedAt` dan bersihkan
  bila ada crash-loop lagi; (b) log aplikasi Blockscout (`/app/logs/prod`, ±590 MB) ada di
  layer container, di luar rotasi Docker (rotasi bawaan aplikasi ±52 MB per file) dan
  hilang bila container dibuat ulang; (c) `SystemMaxUse` journald belum diset (saat ini
  110 MB, tidak mendesak).
- **`validator6` (`<MAINNET_V6_IP>`) masih dibatasi `cpus: 0.7`** (ditemukan 2026-10-12, lihat
  entri "Selesai" 2026-10-12): throttling cgroup 3% periode (±17 jam sejak 15 Sep), 55
  import >3 detik per 24 jam, dan 2 jeda block 15 detik pada 12 Okt 02:56 dan 03:02 UTC.
  `validator2` sudah dinaikkan ke 1,8; **naikkan `validator6` setelah ±24 jam pengamatan
  `validator2` bersih** (target: 0 import >3 detik dan 0 jeda 15 detik akibat
  `validator2`), dengan prosedur yang sama (backup compose, guard 1 baris, `docker compose
  config` sebelum/sesudah, recreate satu node). Catatan: host `validator6` RAM-nya tipis
  (3,8 GB, MemAvailable minimum 543 MB).
- **Hal kecil dari cek 2026-10-12 yang perlu dipantau**: (a) RSS `validator2` puncak 4.913
  MB dari limit 5 GiB (10 Okt 11:21, 3 sampel >4,3 GB, tanpa OOM) — periksa lagi setelah
  `cpus` dinaikkan; (b) gateway mencatat "usage flush Query read timeout" 6× + 1
  `unhandledRejection` + 1 `statement timeout` dalam 72 jam (proses tidak restart, tetapi
  hitungan usage bisa under-count sesaat); (c) dari 17 jeda ≥10 detik dalam 3 hari, 12 yang
  terbesar sudah diatribusikan; sisa 5 jeda (10-13 detik) belum, dan satu jeda 13 detik
  di `validator4` (12 Okt 02:36 UTC) tanpa penyebab yang jelas.

## Belum dikerjakan (belum ada keputusan eksplisit)

- **Keamanan akses — ditemukan di cek kondisi 2026-10-09, belum ditindaklanjuti**: host
  NevaCloud (diverifikasi `validator3` dan `call`; kemungkinan sama di `validator4`/`5`)
  mengizinkan SSH `root` dengan password (`permitrootlogin yes`, `passwordauthentication
  yes`) dan menerima ~22 ribu percobaan login gagal/hari dari 138-233 IP berbeda, tanpa
  fail2ban; `ufw` di node `call` **nonaktif**; port `9547` (metrics) dan `7798` (WS) node
  `call` terjangkau dari internet (`7797` RPC sudah tertutup); port HAProxy `5797`/`5799`
  di `validator1` terbuka publik tanpa API key sehingga bisa melewati gateway dan rate
  limit-nya. Usulan: matikan login password/root (atau pasang fail2ban), batasi `9547`/
  `7798`, dan batasi port HAProxy hanya ke IP gateway `<MAINNET_GATEWAY_IP>` setelah dicek tidak
  ada klien yang masih memakainya langsung.
- **Node `call` tertinggal dari chain saat beban berat — ditemukan 2026-10-09**: dalam 24
  jam, 72 import block >5 detik, 16 >10 detik, 2 >20 detik (maks 28,9 detik); `rpc1`
  maksimal 2,8 detik. Akibatnya read/receipt bisa basi (relevan dengan keluhan "timeout
  receipt"). **Gejala sudah ditangani sebagian (lihat entri "Selesai" 2026-10-09 di
  bawah: routing receipt/nonce/byHash ke `rpc1`). Penyebab sebenarnya ditemukan
  2026-10-12: node ini CPU-bound.** Saat burst batch `eth_estimateGas`/`eth_call` dari
  consumer, container `call` mencapai ±285% dari `cpus` 2,75 (host 3 vCPU) dengan
  user-space 95,7%, **steal 0% dan iowait 0%** pada saat head tertinggal 25 detik; block
  kosong pun butuh 6-9 detik untuk diimpor karena thread import berebut CPU dengan
  thread RPC. Dalam 72 jam (9-12 Okt): 8 episode lag ≥3 block (maks 13 block ≈ 65 detik
  pada 10 Okt 17:01; 12 Okt: 02:34 ≈40 detik, 02:58 ≈20 detik, 03:14 ≈25 detik), steal
  rata-rata 1,8% (maks 5,9%), iowait rata-rata 1,8% (puncak 27-36% hanya di 3 titik 9-10
  Okt) — hipotesis steal/stall disk praktis gugur. Log `call` mencatat ±17 timeout
  JSON-RPC executor per 40 menit saat burst, dan nginx gateway 66 respons 502 (0,04%)
  serta 69 respons 499 di log berjalan; waktu 502 cocok dengan burst tetapi kaitannya
  belum dibuktikan. Jalan keluar yang dipilih: kurangi beban `estimateGas` di sumbernya
  lewat rencana `PLAN_dynamic_gas_limit.md` (di luar repo ini,
  `D:\Dattabot\sample_transaction\`, untuk tim consumer). **Dilaporkan user (2026-10-12)
  sudah dikerjakan di sisi consumer oleh rekan, tetapi belum terlihat di data gateway
  sampai 04:40 UTC** (key `GAR-ScriptBC`: `estimateGas`+`eth_call` masih 2,9-4,0 ribu/jam,
  setara jam-jam sebelumnya) — kemungkinan belum ter-deploy; **cek ulang hitungan itu
  dan lag `call` setelah deploy-nya**. Kalau lag tetap terjadi: tambah CPU (upgrade VM)
  atau pisah peran (write-backup / call).
- **Tidak ada backup otomatis Postgres** (gateway/dashboard). Data user/API key/usage
  log bisa hilang permanen kalau volume Postgres hilang (chain data sendiri independen,
  aman).
- **Alertmanager/alerting pipeline dormant** meski UI dashboard untuk alert recipients
  sudah ada — belum benar-benar terhubung ke sistem notifikasi apa pun.
- **`audit_log` table kosong** — tabelnya sudah ada dan halaman Activity Monitor sudah
  menampilkannya, tapi `lib/actions.ts` belum memanggil recorder untuk aksi admin
  (create user, revoke key, dll.), jadi selalu 0 baris.
- **Uji ketahanan jangka panjang** (sustained load berjam-jam) belum pernah dilakukan —
  yang sudah ada baru 3 menit (2026-08-28) dan burst-test beberapa menit (2026-09-16).
- **Diagram VISUAL arsitektur belum dibuat** (`diagrams/` masih kosong) — referensi
  tertulis lengkap (tabel host/spek/engine, akses, RPC routing) sudah ada di
  `docs/ARCHITECTURE.md` (ditulis ulang komprehensif 2026-09-29, terverifikasi langsung
  ke 9 dari 10 host), tapi belum ada diagram visual topologinya.
- **Konsolidasi Netstats & Explorer (Blockscout) ke path dashboard belum dikerjakan**
  (2026-09-18). Grafana berhasil dikonsolidasi ke `/grafana` (fitur resmi
  `serve_from_sub_path`), tapi Netstats (aset absolute-path, fork lama AngularJS/Express)
  dan Blockscout (kemungkinan sama-sama Next.js dengan pola absolute-path seperti bug
  explorer testnet 2026-09-15 — TIDAK terverifikasi karena Blockscout bukan bagian repo
  ini) berisiko rusak tampilan/aset kalau di-reverse-proxy-path tanpa tes live dulu. Untuk
  sekarang cuma dapat link menu biasa. Perlu tes live per-layanan sebelum dikerjakan.
- **Rencana mematikan subdomain lama** (`netstats.registry.haratoken.app`,
  `grafana.registry.haratoken.app`, `explorer.registry.haratoken.app`) setelah path
  `/grafana` (dan netstats/explorer kalau nanti ikut dikonsolidasi) terbukti stabil dalam
  periode observasi — rekomendasi minimal beberapa minggu sebelum dipertimbangkan. TIDAK
  dieksekusi sekarang, sengaja dibiarkan jalan paralel dulu (juga berguna sebagai jalur
  akses cadangan kalau dashboard utama down).

## Sudah diselesaikan (dicatat di sini supaya tidak dicari ulang)

- Uji transaksi bernilai asli — selesai 2026-08-28, lihat QA/STRESS_TEST_RESULTS.md.
- Uji failover nyata write pool — selesai 2026-08-28 & 2026-09-16 (chaos test), lihat
  QA/STRESS_TEST_RESULTS.md.
- Bug kritis gateway (crash total dari 1 koneksi upstream gagal) — diperbaiki 2026-08-28.
- `hara-faucet-app` lama (validator4) — didekomisioning permanen 2026-09-16 (sempat aktif
  lagi tanpa disadari sejak 2026-08-28, root cause & fix ada di STATUS_TERDEPLOY §14.2/§20).
- `call_backend` HAProxy misrouting ke port `rpc2` — diperbaiki & diverifikasi 2026-09-16
  (lihat QA/STRESS_TEST_RESULTS.md).
- Konsolidasi Grafana ke path `/grafana` di dashboard utama — selesai & diverifikasi
  2026-09-18, lihat `docs/STATUS_TERDEPLOY_2026-08-20.md` §21.
- Sinkronisasi referensi/config usang (README, ARCHITECTURE.md baru, KEYS_AND_CUSTODY.md,
  static-nodes.json, dll.) — selesai 2026-09-18, lihat §21.
- `rpc_activity_log` berhenti total mencatat sejak 2026-09-16 (root cause: deadlock di
  `usage/recorder.ts` + pool Postgres tanpa timeout, saling memperparah jadi pool
  exhaustion permanen) — diperbaiki & diverifikasi live 2026-09-21, ditambahkan juga ke
  `db.ts` testnet sebagai defense-in-depth. Lihat `docs/STATUS_TERDEPLOY_2026-08-20.md`
  §22.
- Watchdog block-production health (`scripts/hara-block-health-watch.sh`) — dipasang
  2026-09-22 sebagai systemd timer di `validator1`, mengecek partisipasi proposing
  ketujuh validator + rata-rata block time tiap 5 menit. Lihat §23.
- IP publik `validator2` (`<MAINNET_V2_IP>`) dan `corp2` (`<MAINNET_V7_IP>`) berubah tanpa
  terdokumentasi — ditemukan & seluruh referensi diperbaiki 2026-09-28 (`static-nodes.json`,
  `KEYS_AND_CUSTODY.md`, `env-hara-registry.md`, `ARCHITECTURE.md`, `gateway/README.md`,
  dll). Lihat §23a. Sekaligus dikonfirmasi arsitektur auth/rate-limit gateway (Redis-first,
  hot path tidak sentuh Postgres) sudah siap untuk lonjakan trafik produksi.
- Insiden 502 berulang sejak trafik produksi mulai (61 error dalam 1 jam saat peluncuran
  2026-09-28) — root cause: mismatch `keepAliveTimeout` antara Node.js gateway (default
  5 detik) dan idle-timeout reverse_proxy Caddy, menyebabkan race EOF/502. Diperbaiki
  2026-09-29 (`httpServer.keepAliveTimeout=120000`), diverifikasi live. Lihat
  `docs/STATUS_TERDEPLOY_2026-08-20.md` §23b.
- `docs/ARCHITECTURE.md` ditulis ulang komprehensif 2026-09-29 — spek (vCPU/RAM/disk)
  dan daftar engine tiap host diverifikasi langsung via SSH. Termasuk matriks akses SSH
  per host dan detail routing HAProxy sebenarnya (port tunnel, bukan cuma nama backend).
- Akses SSH langsung ke `rpc2`/`call` (<MAINNET_CALL_IP>) dikonfirmasi 2026-09-29 (password,
  bukan key `rpc2-new` yang gagal) — **sekarang 10 dari 10 host mainnet punya akses
  langsung terverifikasi**. Metrics Besu `call` juga ditambahkan ke Prometheus (`rpc-2`
  ternyata sudah ada dari awal, cuma `call` yang sempat tidak ada). Lihat
  `docs/ARCHITECTURE.md`.
- Kredensial di `env-hara-registry.md`/`KEYS_AND_CUSTODY.md` dirapikan & dilengkapi
  2026-09-29 — setiap host migrasi 2026-09-15 sekarang punya baris user/port/key yang
  konsisten (sebelumnya cuma IP tanpa detail akses lengkap), `validator3`/`validator4`
  ditambahkan opsi akses via key (sebelumnya cuma password terdokumentasi, padahal key
  juga jalan).
- Key `archive-new` yang sempat tidak jelas — dikonfirmasi tim infra 2026-09-29: untuk
  archive NevaCloud lama yang sudah mati total (sama dengan `archive_old_DEAD` yang
  sudah terdokumentasi), bukan duplikat berbahaya. Host `<MAINNET_GATEWAY_IP>` (target key
  `proxy-new`) dikonfirmasi perannya "proxy" oleh tim, dan terbukti live di level
  jaringan — sisa item passphrase dicatat terpisah di atas.
- Dua insiden OOM terpisah, baru ketahuan saat cek kondisi rutin 2026-09-29 (bukan
  laporan user) — `validator1` (`mem_limit` 1536m→**2560m**, sempat 96% terpakai) dan
  `hara-gateway-caddy` (`mem_limit` 80m→**200m**, undersized sejak awal). Keduanya
  diperbaiki & diverifikasi live (block production tetap presisi, RPC/dashboard normal).
  Lihat `docs/STATUS_TERDEPLOY_2026-08-20.md` §23c.
- Investigasi teori "bentrok nonce dari round-robin 4 target RPC" (laporan rekan infra
  user, 2026-09-30) — **DITOLAK berdasar config live**: `rpc_tx_backend` sekarang
  primary(`rpc1`)+backup(`rpc2`), bukan round-robin aktif-aktif seperti didokumentasikan
  di §10/§11 (entah kapan diubah, tidak terdokumentasi). Risiko nyata yang mirip (tx
  hilang kalau node penerima mati sebelum gossip P2P) sudah diketahui & dimitigasi sejak
  2026-09-16 (§20, sisi klien: poll+resubmit, bukan nonce-lock server). Sekaligus
  ditemukan & diperbaiki: node `call`/`rpc2` (<MAINNET_CALL_IP>) menanggung 3 peran
  (call+write-backup+dekat-archive) tapi `cpus` cuma **0.35** dari 3 vCPU host yang
  hampir menganggur — dinaikkan ke **2.0**, diverifikasi (CPU 35.61%→22.69% dari ceiling
  yang jauh lebih besar, semua backend HAProxy `UP` lagi). Lihat
  `docs/STATUS_TERDEPLOY_2026-08-20.md` §24.
- **Follow-up yang masih terbuka**: sweep kapasitas CPU/RAM penuh ke 10 host (baru
  `call`/`rpc2` yang dicek detail hari ini) — belum dilakukan untuk host lain
  (`corp1`/`corp2`/`validator3/4/5`/`archive`). Juga: `haproxy.cfg` diedit live
  2026-09-30 01:33 UTC oleh rekan infra TANPA backup tersimpan untuk edit spesifik itu
  (backup terakhir yang ada `.bak-before-call-port-fix-20260916`) — kalau ada perubahan
  lain yang belum diketahui di file itu, tidak ada cara diff persis ke versi
  sebelumnya. Koordinasikan dengan rekan infra soal kapan mereka mengubah config
  produksi supaya tidak ada 2 pihak menyentuh file yang sama tanpa saling tahu (sudah
  pernah jadi masalah sebelumnya, lihat §13 "Container Ke-retired Tanpa Sepengetahuan").
- **Migrasi gateway+dashboard+Postgres+Redis ke host cadangan `<MAINNET_GATEWAY_IP>` —
  SELESAI 2026-09-30**: Tahap 1 (port 443) sudah lebih dulu diselesaikan rekan infra
  user sendiri via `systemd override` (`-tls-listen 127.0.0.1:2443`) + **nginx**
  (bukan Caddy) sebagai reverse proxy publik. Rencana diadaptasi memakai nginx yang
  sudah ada ini (bukan install Caddy terpisah). Tahap 2: server block
  `rpc.registry.haratoken.app` (split HTTP:4000/WS:4001 via `map $http_upgrade`) dan
  `dashboard.registry.haratoken.app` (proxy :4002 + passthrough `/grafana/`)
  ditambahkan ke nginx yang sama. Tahap 3: stack gateway+dashboard+Postgres+Redis
  di-deploy penuh di `/opt/hara-gateway/`, data Postgres disinkron 2x (awal + final
  sesaat sebelum cutover), row count exact match tervalidasi tiap kali. Tahap 4:
  DNS Route53 diganti oleh tim (`<MAINNET_V2_IP>`→`<MAINNET_GATEWAY_IP>`), lalu sertifikat
  self-signed sementara diganti sertifikat asli via certbot (`webroot` authenticator,
  tidak perlu stop nginx), dilengkapi deploy-hook baru
  (`/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh`) supaya renewal otomatis
  ke depan ikut me-reload nginx (hook lama cuma menyasar `hara-status`, tidak akan
  menjangkau sertifikat baru ini). **Diverifikasi end-to-end dengan API key produksi
  asli** (bukan cuma dummy): `eth_blockNumber`/`eth_chainId`/`eth_getTransactionCount`
  semua benar lewat domain asli, dashboard `/login` normal, `/grafana` passthrough
  normal, `health.registry.haratoken.app` tidak terganggu sepanjang proses. Host lama
  TIDAK disentuh saat cutover (rollback instan bila diperlukan) — **update: didekomisioning
  penuh beberapa jam kemudian setelah dipastikan aman, lihat entri terpisah di bawah.**
- **Uji empiris kapasitas nonce-berurutan-1-sender + root cause sebenarnya "timeout
  receipt" — SELESAI 2026-09-30** (lihat `docs/STATUS_TERDEPLOY_2026-08-20.md` §25):
  100 tx dari 1 sender dengan nonce dihitung lokal → 100/100 sukses, semua masuk 1
  block. TAPI kalau nonce di-query ulang via `'latest'` sebelum tiap kirim → cuma
  3/15 sukses (root cause asli kemungkinan besar di sini, BUKAN routing HAProxy).
  `'pending'` jauh lebih baik (13/15) tapi belum sempurna. Panduan developer baru:
  `docs/PANDUAN_DEVELOPER_TRANSAKSI_VOLUME_TINGGI.md` — **perlu dikomunikasikan ke
  rekan/tim yang membuat client pengirim transaksi**, supaya pola `'latest'`-per-kirim
  tidak dipakai lagi.
- **Dekomisioning penuh stack gateway lama di `<MAINNET_V2_IP>` — SELESAI 2026-09-30**:
  setelah migrasi ke `<MAINNET_GATEWAY_IP>` diverifikasi stabil, stack lama (yang numpang di
  host validator2, 2 vCPU sama) di-stop dulu (`gateway`/`dashboard`/`postgres`/`redis`/
  `caddy`), diverifikasi tidak ada dampak (3 domain publik tetap normal via host baru,
  `hara-mainnet-validator2` tidak terganggu — `RestartCount=0`, tetap aktif propose
  block), baru dieksekusi `docker compose down -v` (containers+network+volume/data
  dihapus total, bukan cuma di-stop). Hasil: `<MAINNET_V2_IP>` sekarang cuma menjalankan
  validator2 sendirian, RAM available naik dari ~1.2GB → 4.7GB, tidak lagi berbagi 2
  vCPU dengan stack gateway (constraint lama yang jadi penyebab insiden CPU-storm
  2026-09-29, lihat STATUS §23b). Lihat `docs/ARCHITECTURE.md` untuk detail final.
- **Grafana: panel besu menampilkan seri "rpc-2" kosong/0% total — DIPERBAIKI 2026-09-30**:
  akibat langsung konsolidasi rpc2→call hari ini (lihat item CPU/nonce di atas) — target
  Prometheus `node: rpc-2` (`127.0.0.1:29545`, tunnel ke port metrics proses standalone
  rpc2 yang sudah dihapus) permanen `down` ("connection reset by peer"), dan karena
  semua panel Grafana pakai `legendFormat: "{{node}}"`, seri "rpc-2" muncul sebagai baris
  kosong/tanpa data di setiap panel besu (block height, gas limit, dst) — inilah yang
  dilaporkan user sebagai "alias tidak ada datanya". **Fix**: hapus target `rpc-2` dari
  `besu-mainnet` job di `/opt/hara-mainnet/config/prometheus.yml` (backup
  `.bak-before-rpc2-target-removal-20260930`), restart container Prometheus (Lifecycle
  API `/-/reload` tidak aktif di instance ini, jadi restart bukan reload). Diverifikasi:
  9 target besu-mainnet tersisa semuanya `up`, `ethereum_blockchain_height` melaporkan
  data bersih untuk kesembilannya (termasuk `call`), tidak ada lagi baris kosong.
- **Uji ketahanan jangka panjang — SELESAI SEBAGIAN 2026-09-30** (dihentikan user
  setelah 78 menit dari rencana 3 jam, dianggap cukup): beban baca (`eth_blockNumber`
  tiap 5s) + tulis (batch 5 tx nonce-lokal tiap 60s) dari 1 wallet, via endpoint publik
  `rpc.registry.haratoken.app` + API key produksi asli. **Hasil: 935/935 baca dan
  390/390 tulis sukses (0 error total, 1.325 operasi)**. Latensi baca p50/p95/p99 =
  103/252/475ms, tulis 906/1565/1798ms. Dua temuan (tidak mempengaruhi success rate):
  (1) cluster 3 baca lambat (8-29 detik) dalam jendela 12 detik jam 08:29:46-58 UTC,
  sembuh sendiri, penyebab tidak jelas dari snapshot resource 5-menitan; (2) memori
  container `hara-gateway` naik BERTAHAP KONSISTEN dari 12.5%→18.0% dari limit 300m
  (~37MB→~54MB) sepanjang 78 menit — bukan noise, tren naik jelas. Belum sampai
  mengkhawatirkan dalam durasi ini, tapi pola ini pantas dipantau lagi di observasi
  yang lebih panjang untuk pastikan bukan memory leak lambat. Rekomendasi: ulangi tes
  ini dengan durasi penuh (atau lebih lama) di kesempatan lain untuk konfirmasi apakah
  tren memori plateau atau terus naik.
- **Analisa kapasitas blockchain+gateway untuk beban tulis/baca lebih tinggi —
  2026-10-02**: dipicu laporan user soal `eth_estimateGas` lambat (4-5.5 detik untuk
  batch 30 item) di consumer `traceability-bc-record-script` (branch
  `sdk/routerv2_dev`, repo terpisah, HANYA dibaca read-only, tidak diubah). Dibuktikan
  langsung (bukan dugaan) BUKAN masalah infra/routing: 1 estimateGas sederhana 97ms,
  30 concurrent terpisah 294ms, 30 dalam 1 JSON-RPC batch (pola asli consumer) 41ms —
  semuanya cepat. Satu-satunya variabel yang beda di kasus asli consumer adalah isi
  kontraknya sendiri (`Subject.callRouter → Router.route()` menyentuh 5-6 kontrak
  sekaligus: SubjectDB/ProcessList/ProcessLink/ProcessAction/Material) — itu biaya
  komputasi EVM nyata, DI LUAR yang bisa diperbaiki dari sisi infra. Kode consumer
  sendiri sudah benar (nonce lokal lintas chunk, ordered broadcast, batching JSON-RPC
  untuk baca) — tidak ada perubahan diperlukan di sana. Rate-limit gateway dikonfirmasi
  bukan bottleneck (key consumer ini `rps_limit` 10.000). **Temuan infra nyata**: node
  `call`/`rpc2` (<MAINNET_CALL_IP>) terpantau CPU 197-207% dari limit 2.0 core (hampir
  maksimal) dan memori 79-82% dari limit lama 1536m — **diperbaiki**: `mem_limit`
  1536m→**2560m** (host available 2.1GB, backup
  `docker-compose.yml.bak-before-memfix-20261002`), diverifikasi healthy + semua
  backend HAProxy (`rpc_tx_backend`/`rpc_read_backend`/`ws_backend`/`call_backend`)
  tetap `UP` setelah restart. **Lanjutan — `cpus` juga dinaikkan 2026-10-02**: host
  terukur 44% idle di level OS (`mpstat`, 3 core total) meski container sempat
  214% dari limit lamanya (2.0 core) — ada headroom nyata. Dinaikkan `cpus`
  2.0→**2.75** (sisa 0.25 core untuk OS host), diverifikasi healthy + semua backend
  HAProxy tetap `UP`. Catatan: host ini juga terukur **16.5% CPU steal** (waktu yang
  diambil hypervisor cloud provider, bukan sesuatu yang bisa diperbaiki dari dalam
  VM) — kalau beban terus naik dan steal time makin signifikan, batas sesungguhnya
  bukan lagi `cpus` cgroup tapi kapasitas fisik VM/provider itu sendiri. Node ini
  satu-satunya yang menanggung 3 peran sekaligus (call+write-backup+near-archive) di
  host 3 vCPU yang sudah pas-pasan; pertimbangkan ke depan apakah perlu host
  tambahan/pemisahan peran kalau beban terus naik.
- **Cek kondisi mainnet 2026-10-09 + perbaikan OOM berulang di 4 validator — SELESAI**:
  chain sehat (block 5 detik, 9 peer, 7 validator propose merata, HAProxy 8/8 UP,
  Prometheus 19/19 up, gateway 148 ribu request/24 jam dengan 0 error/0 rate-limit).
  Tapi journal kernel (`journalctl -k`, bukan `docker inspect` yang selalu menampilkan
  `OOMKilled=false`) menunjukkan OOM-kill cgroup berulang sejak 2 Okt: `validator7` 107
  kali (9 kali dalam 6 jam pada 4 Okt, lalu ~1x/hari), `validator4` 16, `validator2` 10,
  `validator5` 9, `validator3` ≥3 (38 restart tercatat). Efeknya terukur di analisis 7
  hari (121 ribu block): 515 jeda 15 detik (round-change saat proposer mati) dan stall
  terburuk 143 detik pada 3-4 Okt, tidak ada stall besar sejak 5 Okt. Akar masalah:
  Besu dengan `-Xmx1152m` tetap mencapai RSS ~2,3-2,7 GB (off-heap); `validator6` (limit
  3,1 GiB) plateau ~2,7 GB dan tidak pernah OOM, sedangkan limit 2,25-2,5 GiB terlalu
  kecil (tren +20 MB/jam). **Diperbaiki 2026-10-09** (satu validator per waktu, backup
  `docker-compose.yml.bak-before-memfix-20261009`, tiap host): `validator7` `mem_limit`
  2560m→**4096m** (host 7,7 GB), `validator3` 2304m→**3072m**, `validator4` dan
  `validator5` 2560m→**3072m** (memswap disamakan di v3/v4). Setelah keempatnya: 167 dari
  170 block tetap 5 detik (hanya dua jeda 15 detik saat restart), 9 peer, ketujuh
  validator propose, semua backend HAProxy UP. Catatan: pada host NevaCloud 3,9 GB, limit
  3 GiB menyisakan ~0,9 GB untuk OS tanpa swap (sama dengan node `call`) — margin tipis,
  pantau; bila masih OOM, opsi berikutnya upgrade RAM host, bukan menaikkan limit lagi.
- **Routing siklus-transaksi ke `rpc1` + node-exporter di host `call` — SELESAI 2026-10-09**:
  (1) Gateway (`gateway/src/tx/archiveRouter.ts`) kini mengirim `eth_getTransactionReceipt`,
  `eth_getTransactionByHash`, dan `eth_getTransactionCount` (`latest`/`pending`/tanpa tag)
  ke port tulis `:5797`, **hanya bila seluruh request/batch berisi method sejenis**; batch
  campuran dengan `estimateGas`/`eth_call` tetap ke `call`, supaya beban berat tidak pindah
  ke node tulis tunggal. Sebelumnya semua itu ke `call`, yang bisa tertinggal sampai 29
  detik, sehingga receipt/nonce basi. (2) ACL body di `rpc_frontend` HAProxy (buatan tim
  infra 30 Sep: send/txcount/receipt dipaksa ke `rpc1`, method lain ke `rpc_read_backend`
  round-robin `rpc1`+`call`) ternyata belum memuat `eth_getTransactionByHash`, jadi
  ditambahkan (backup `haproxy.cfg.bak-before-byhash-20261009`). **Gotcha terulang**: `sed
  -i` membuat inode baru sehingga container HAProxy tetap memakai config lama — reload
  `SIGUSR2` TIDAK cukup, harus `docker restart` (divalidasi dulu dengan container sekali
  pakai `haproxy -c`). Diverifikasi per request lewat counter respons HAProxy (`hrsp_2xx`,
  bukan `stot` yang menghitung sesi TCP keep-alive): 30 dari 30 request siklus-transaksi
  mendarat di `rpc1`, `estimateGas` tetap di `call`, 0 error gateway, 8/8 backend UP.
  (3) node-exporter dipasang di host `call` (bind `127.0.0.1:9100`; forward tunnel
  `29100` di `hara-rpc2-tunnel`; `permitopen` 9100 di `authorized_keys`; target
  `node=call` di Prometheus; backup `*.bak-before-9100-20261009` /
  `docker-compose.yml.bak-before-nodeexporter-20261009` /
  `prometheus.yml.bak-before-callnodeexp-20261009`). Baseline tenang: CPU 21,7%, steal
  0,6%, iowait 0,2%. **Perhatian**: API key block explorer baru (`hara_live_d257…`, label
  `block_explorer`, 10.000 rps, kuota harian 1.000.000) mulai dipakai — beban baca
  explorer (`getBlockByNumber`/`getLogs`/`eth_call`) masuk ke `call`, receipt/byHash batch
  ke `rpc1`, `debug_*`/`trace_*` ke archive (limiter 10 rps/burst 20). Pantau `call` dan
  `rpc1` saat backfill; kuota 1 juta/hari bisa habis saat backfill tanpa batching.
- **Lonjakan storage host archive/Blockscout (`<MAINNET_ARCHIVE_IP>`) dianalisis dan dibersihkan —
  2026-10-09**. *Analisis*: disk terpakai 46 GB (25 Sep) → ±106 GB (9 Okt), ±8 GB/hari
  pada 1-8 Okt, melambat sejak 9 Okt dini hari (±0,3 GB per 6 jam). Penyebabnya volume
  transaksi, bukan kebocoran: sejak 2 Okt transaksi/hari naik ±5× (20-60 ribu → 120-190
  ribu; log event 140-360 ribu → 1,2-1,75 juta/hari, puncak 3 Okt). Besu archive memakai
  `data-storage-format="FOREST"` + `sync-mode="FULL"` (semua versi state disimpan, tanpa
  pruning) → ±40 GB; DB Blockscout 17 GB (tabel `logs` 10 GB, `transactions` 3,2 GB),
  indexer sudah mengejar chain. Host lain hanya +5-8 GB dalam 13 hari. Perkiraan kasar
  ±45 KB per transaksi (archive + Blockscout). Disk host sudah di-resize jadi 207 GB dan
  RAM 7,7 GB (dokumentasi lama 96 GB / 3,7 GB). *Pembersihan* (bertahap, tiap tahap diikuti
  cek 11 container, head Besu naik, explorer HTTP 200; tidak ada container yang
  direstart): (1) `frontend-src-v2.10.1/.next.typecheck-timeout-20260821` (sisa build gagal)
  3,2 GB; (2) 18 image `<none>:<none>` yang tidak dipakai container manapun (sisa build 21
  Agu, via `docker rmi` per ID tanpa `-f`) — `/var/lib/containerd` 23 → 13 GB; (3) `/tmp`
  container Besu archive: 264 entri stale ≈1,5 GB = native library + folder JFR dari ±34
  restart JVM pada 1 Okt 01:00-05:00 (kemungkinan crash-loop OOM sebelum RAM host naik;
  penyebab pastinya tidak diverifikasi), himpunan "masih dipakai" dihitung dari
  `/proc/<pid JVM>/maps` + fd; (4) log Blockscout `indexer.log.7-13` ±350 MB. Hasil `df`:
  terpakai 106,5 → 93,8 GB, sisa 100,6 → 113,3 GB. *Sengaja tidak disentuh*: `.next`
  (input `COPY` di `Dockerfile.runtime` untuk rebuild image frontend), `.pnpm-store` (±95%
  hardlink dengan `node_modules`, hanya ±0,1 GB), build cache 7,2 GB (shared dengan image,
  private cuma 73,9 MB), swapfile 8,6 GB, `error.log*` Blockscout (jendela insiden 1 Okt),
  dan file `.log` di `archive/data/database/` (itu WAL RocksDB milik Besu, bukan log
  aplikasi). Angka "reclaimable" `docker system df` menyesatkan di host ini (containerd
  image store, layer berbagi) — ukur dengan `df`, jangan percaya angka itu. *Log*: rotasi
  Docker sudah ada di ke-11 container (`max-size 50m`, `max-file 5`, total 421 MB), journald
  110 MB — tidak ada penumpukan tak terbatas.
- **Cek kondisi 2026-10-12 + `cpus` `validator2` dinaikkan 0,7 → 1,8 — SELESAI 2026-10-12**.
  *Kondisi*: head 889.199, 5 detik/block (54.890 dari 55.001 block dalam 3 hari tepat 5
  detik; 17 jeda ≥10 detik, maks 15 detik), 9 peer, 7/7 validator propose, txpool kosong,
  8 server HAProxy UP, 20/20 target Prometheus up, **0 OOM kill di 10 host sejak 9 Okt
  05:40 UTC** (validator3/4/5 ±65% dari limit 3 GiB, validator7 78% dari 4 GiB), gateway
  441 ribu request/24 jam dengan 0 error dan 0 rate-limited di DB, RPC publik 110-145 ms,
  explorer terindeks penuh (tertinggal ≈4 detik). Volume harian gateway naik dari ±165
  ribu (5-8 Okt) ke 322 ribu / 449 ribu / 445 ribu (9 / 10 / 11 Okt) akibat backfill
  explorer (key `block_explorer`: 258 ribu request pada 11 Okt). Kuota harian key
  explorer kini 100 juta dan `GAR-ScriptBC` 1 miliar (dinaikkan pihak lain sejak 9 Okt),
  jadi risiko "kuota 1 juta/hari habis" di entri 9 Okt tidak berlaku lagi. *Akar masalah
  jeda block 15 detik*: compose `validator2` dan `validator6` memakai `cpus: 0.7`
  (`validator2`: baris 6 `/opt/hara-mainnet/docker-compose.yml`; ada backup lama
  `docker-compose.yml.bak-before-cpulimit-20260828` sehingga kemungkinan dipasang saat
  host itu masih menampung stack gateway; tidak tercatat di dokumentasi mana pun),
  sedangkan validator lain tanpa batas CPU. CPU host cuma ±40% sibuk sehingga throttling
  tak terlihat dari luar. Bukti: `cpu.stat` cgroup container (`nr_throttled`/`nr_periods`:
  `validator2` 7% ≈12 jam sejak 4 Okt, `validator6` 3% ≈17 jam sejak 15 Sep), PSI cpu
  0,86-0,90 di `validator2` vs 0,1 di `validator1` saat jeda, dan jumlah import lambat
  per 24 jam (>3 detik): `validator2` 92 (maks 20 detik), `validator6` 55, `validator5`
  14, `rpc1` 3, `validator1/3/4/7` 0 (archive 880 dan call 144 — keduanya bukan
  validator). Steal 0% dan iowait ≤7% di `validator2` pada saat jeda. *Atribusi jeda*:
  proposer yang gagal = pendahulu dari `miner` block setelah jeda di daftar validator
  terurut (teruji cocok dengan restart `validator3`/`validator4` 9 Okt); dari 12 jeda ≥10
  detik terbesar: `validator2` 7, `validator6` 2, `validator4` 2 (1 restart 9 Okt + 1 jeda
  13 detik 12 Okt), `validator3` 1 (restart 9 Okt). *Perubahan*: `cpus: 0.7` → `1.8` hanya
  di blok `validator2` (host 2 vCPU, menyisakan 0,2 untuk OS/SSH; backup
  `docker-compose.yml.bak-before-cpus-20261012`), `docker compose up -d validator2` pada
  04:14 UTC (diff `docker compose config` hanya baris `cpus`), healthy dalam 24 detik,
  node-exporter tidak tersentuh. *Verifikasi*: 1 jeda 15 detik saat restart (#889932),
  setelah itu 0 jeda; `validator2` propose tiap 35 detik; 0 throttle dalam 60 detik
  (576 periode; 189 periode di awal hanya warm-up JVM, total 2,65 detik); 0 dari 60
  import >3 detik; 0 WARN/ERROR. Rollback: salin backup lalu `docker compose up -d
  validator2`. `validator6` BELUM diubah (lihat "Perlu tindakan"). *Disk archive* tumbuh
  lagi pasca-pembersihan (lihat butir storage di atas). *Opsi 3 (beban node `call`)*:
  dilaporkan user sudah dikerjakan di sisi consumer; lihat butir node `call`.
