# Testnet — Backlog & Rekomendasi Perbaikan

Item yang diketahui belum diselesaikan atau sengaja ditunda, per 2026-09-16. Bukan bug
aktif (kalau ada bug aktif, itu ada di `docs/CHANGELOG.md` sebagai insiden terbuka) —
ini murni daftar peningkatan yang belum dikerjakan.

## Diketahui, sengaja ditunda (keputusan user)

- **Kuorum QBFT 3-dari-3 → 4 validator.** Konsensus punya 0% fault tolerance by
  construction — 1 validator down berarti seluruh jaringan berhenti produksi blok.
  Menambah validator ke-4 akan memberi toleransi 1 node down, tapi butuh host baru + key
  baru + prosedur QBFT live-vote (pola sama seperti perbaikan validator1 2026-09-11).
  **Proyek terpisah**, ditunda sampai user siap.
- **Resize VM Host A/Host B (interim fix, bukan permanen).** `mem_limit` sudah dinaikkan
  DUA KALI: 2026-09-15 (850m→1050m/1200m untuk validator2/3) dan 2026-09-22
  (1300m/1050m/1200m→1650m/1400m/1600m untuk ketiganya, setelah OOM berulang lagi persis
  seperti diperingatkan). Masih memakai RAM yang sudah tersedia di host, bukan resize VM
  (butuh downtime + biaya tambahan, sengaja ditunda oleh user). Prediksi 15 September
  TERBUKTI BENAR: ini cuma MENGURANGI frekuensi OOM, bukan menghilangkan — state chain
  terus bertumbuh, jadi kemungkinan besar akan mepet lagi beberapa minggu/bulan ke depan
  (lagi). Reset kuartalan (1 Oktober) akan bantu sementara dengan mengosongkan state.

## Belum dikerjakan (belum ada keputusan eksplisit)

- **Tidak ada backup otomatis Postgres** (gateway/dashboard). Kalau volume Postgres
  hilang, semua data user/API key/usage log hilang permanen (chain data sendiri aman,
  itu independen dari Postgres).
- **Early-warning memory monitor (`hara-mem-watch.timer`, ditambahkan 2026-09-15) masih
  log-only** — tidak terhubung ke sistem alerting/notifikasi apa pun. Kalau tidak ada
  yang mengecek `/var/log/hara-mem-watch.log` secara manual, warning-nya tidak akan
  terlihat sebelum OOM benar-benar terjadi lagi.
- **Redundansi RPC baru mencakup HTTP, belum WebSocket** (`proxy/wsProxy.ts` sengaja
  tidak ikut failover — lihat CHANGELOG 2026-09-15/16 untuk alasan). Klien WS yang
  terhubung ke validator1 akan disconnect kalau validator1 restart, dan harus reconnect
  sendiri (bukan otomatis dialihkan ke validator3 seperti jalur HTTP).
- **Belum ada dashboard/Grafana untuk metrics testnet** (Prometheus scrape ada di
  beberapa node lewat `metrics-enabled=true`, tapi tidak ada Grafana yang membacanya —
  beda dengan mainnet yang sudah punya Grafana penuh).
- **Konsolidasi Netstats ke path dashboard (`/netstats`) belum dikerjakan** (2026-09-18).
  Mainnet berhasil mengonsolidasi Grafana ke `/grafana` karena Grafana punya fitur resmi
  untuk sub-path; Netstats (fork `fusenet/eth-netstats`, AngularJS/Express lama) TIDAK
  punya opsi sejenis dan referensi asetnya (`/css`, `/js`, `/dist`, `/socket.io/*`) semua
  absolute root path — berisiko rusak kalau di-reverse-proxy-path tanpa tes live dulu
  (persis pola bug explorer 2026-09-15). Untuk sekarang cuma dapat link menu biasa di
  dashboard, bukan konsolidasi sungguhan. Kalau mau dikerjakan: tes live dulu apakah
  `/css`, `/js`, `/socket.io/*` bisa di-exclude dari rewrite (pola sama seperti
  `@notExplorer`), baru putuskan.

## Sudah diselesaikan (dicatat di sini supaya tidak dicari ulang)

- Insiden block time nyangkut 15-64 detik (OOM berulang ketiga validator + `validator2`
  stuck permanen di SNAP sync loop, tidak pernah ikut proposing) — diperbaiki &
  diverifikasi live 2026-09-22 (`mem_limit` dinaikkan lagi, `validator2` dipindah ke
  `sync-mode=FULL`). Lihat `docs/CHANGELOG.md`.
- Monitoring kesehatan block production/proposer — dibuat & dipasang 2026-09-22
  (`scripts/hara-block-health-watch.sh`, systemd timer tiap 5 menit di Host A). Lihat
  `docs/CHANGELOG.md`.
- `scripts/cleanup_quarterly_reset.sh` koordinasi Host A↔Host B — kodenya sudah ditulis
  sebelumnya tapi ternyata belum pernah benar-benar di-deploy ke Host A; ketahuan &
  di-deploy 2026-09-28 (syntax + pre-flight connectivity diverifikasi, sebelum jadwal
  reset 1 Oktober 2026 03:00 UTC). Lihat `docs/CHANGELOG.md`.
