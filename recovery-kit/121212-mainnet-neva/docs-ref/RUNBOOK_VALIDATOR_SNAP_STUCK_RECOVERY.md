# Runbook: Validator Mainnet Stuck SNAP Sync (Tertinggal >512 Block)

Dibuat 2026-09-22, setelah insiden testnet `validator2` (lihat
`tesnet_server/docs/CHANGELOG.md` 2026-09-22) dan cek silang yang menemukan mainnet punya
konfigurasi laten yang sama (`STATUS_TERDEPLOY_2026-08-20.md` §23). Belum pernah terpicu
di mainnet — runbook ini disiapkan SEBELUM dibutuhkan, supaya kalau watchdog
(`hara-block-health-watch.log`) suatu saat mendeteksi ini, pemulihannya tidak perlu
didiagnosis dari nol di tengah insiden.

## Kapan runbook ini dipakai

Salah satu dari:
- `hara-block-health-watch.log` di `validator1` (`/var/log/hara-block-health-watch.log`)
  mencatat WARNING "validator X TIDAK muncul sebagai miner" untuk address yang sama,
  berulang di beberapa siklus cek berturut-turut (5 menit sekali) — bukan cuma sekali
  (sekali bisa jadi kebetulan restart singkat/latency biasa).
- Ada laporan block time melambat, dan investigasi manual (lihat bagian Diagnosis)
  mengonfirmasi satu validator spesifik hilang dari rotasi proposing.

**Bukan untuk dipakai kalau**: validator baru saja restart dalam <5 menit terakhir
(recreate untuk config/mem_limit, dsb.) — itu normal, tunggu dulu 1-2 siklus watchdog
sebelum menganggap ini insiden sungguhan.

## Diagnosis — konfirmasi ini memang kasus yang tepat

Jangan langsung eksekusi fix di bawah tanpa konfirmasi ini dulu — gejala "block time
lambat" bisa punya penyebab lain (OOM biasa yang self-recover, masalah jaringan, dll).

1. **Identifikasi validator mana yang bermasalah** dari pesan watchdog, atau cek manual:
   ambil 20-30 block terakhir dari `validator1` (`http://127.0.0.1:35797`,
   `eth_getBlockByNumber` per block, field `miner`) — validator yang TIDAK PERNAH
   muncul adalah kandidatnya. Silang-cek dengan tabel address di §2
   `STATUS_TERDEPLOY_2026-08-20.md`.
2. **SSH ke host validator itu** (lihat §2 untuk pemetaan address→host, dan
   `access/KEYS_AND_CUSTODY.md` untuk key SSH-nya — untuk 5 host hasil migrasi
   2026-09-15, akses lewat tunnel `validator1`, lihat BACKLOG.md).
3. **Cek log container Besu-nya**, cari pola persis ini:
   ```
   docker logs <container-name> --since 15m 2>&1 | grep -iE "unable to retrieve|round|sync"
   ```
   Pola yang mengonfirmasi kasus ini: `ERROR ... Chain download failed. Restarting
   after short delay.` diikuti `RuntimeException: Unable to retrieve blocks for block
   numbers: X to Y`, berulang tiap beberapa detik, DAN baris
   `BftMiningCoordinator | Stopping BFT mining coordinator while we are syncing` yang
   terus bolak-balik dengan `Starting BFT mining coordinator following sync` tanpa
   pernah stabil.
4. **Ukur seberapa jauh tertinggal**: bandingkan `eth_blockNumber` node itu sendiri
   (lewat `docker exec` ke port RPC lokalnya) dengan `eth_blockNumber` dari
   `validator1` (chain tip sesungguhnya).
   - **< 512 block tertinggal**: kemungkinan BESAR masih bisa self-recover via SNAP
     dalam beberapa menit — jangan buru-buru intervensi, pantau dulu 10-15 menit lagi.
   - **≥ 512 block tertinggal** (match dengan `bonsai-historical-block-limit=512` di
     config): SNAP sync tidak akan pernah berhasil sendiri — peer sudah men-prune trie
     log historis yang dibutuhkan. **Lanjut ke prosedur pemulihan di bawah.**

## Kenapa aman dilakukan (konteks kuorum)

Mainnet punya **7 validator**, standard BFT (`N ≥ 3F+1`) mentolerir hingga **2 validator
down bersamaan** tanpa mengganggu produksi block sama sekali — beda jauh dari testnet
(3 validator, 0% fault tolerance). Selama hanya SATU validator yang direstart untuk
prosedur ini, **block production TIDAK akan berhenti** — chain tetap jalan normal
lewat 6 validator sisanya sepanjang proses pemulihan.

## Prosedur Pemulihan

Prinsipnya SAMA seperti fix testnet 2026-09-22, tapi dengan satu perbedaan krusial:
**trie-log-limit dikembalikan lagi setelah caught-up** (di testnet dibiarkan permanen
mati karena disk lapang; di mainnet HARUS dikembalikan karena ini bagian kebijakan
cost-control storage yang disepakati — lihat BACKLOG.md).

1. **Backup config yang akan diubah**:
   ```bash
   cp /opt/hara-mainnet/config/<nama-node>.toml \
      /opt/hara-mainnet/config/<nama-node>.toml.bak-before-full-sync-recovery-$(date +%Y%m%d)
   ```
2. **Edit config node yang bermasalah** — ubah 2 baris:
   ```toml
   sync-mode="FULL"
   bonsai-limit-trie-logs-enabled=false
   ```
   (Besu menolak start kalau `bonsai-limit-trie-logs-enabled=true` dipakai bareng
   `sync-mode=FULL` — harus dimatikan bareng, bukan cuma ganti sync-mode saja.)
3. **Recreate container itu SAJA** (bukan yang lain):
   ```bash
   cd /opt/hara-mainnet && docker compose up -d --force-recreate <nama-service>
   ```
4. **Pantau log** sampai node berhasil mengejar ke chain tip:
   ```bash
   docker logs <container-name> --since 30s -f 2>&1 | grep -iE "imported|error"
   ```
   Tunggu sampai nomor block yang di-import mendekati `eth_blockNumber` milik
   `validator1`. Untuk mainnet (state lebih besar dari testnet), proses re-eksekusi
   block via FULL sync bisa memakan waktu LEBIH LAMA daripada testnet (menit hingga
   jam, tergantung seberapa jauh tertinggal dan ukuran state) — ini normal, BUKAN
   berarti stuck lagi selama block number-nya terus naik.
5. **Verifikasi node sudah ikut proposing lagi**: cek `hara-block-health-watch.log`
   tidak lagi mencatat WARNING untuk address ini di siklus berikutnya, atau cek manual
   address-nya muncul sebagai `miner` di block terbaru.

## WAJIB: Kembalikan ke SNAP + trie-log-limit setelah caught-up

**Jangan biarkan node ini permanen di FULL sync + trie-log-limit mati** — beda dari
testnet, ini melanggar kebijakan cost-control storage mainnet kalau dibiarkan.

1. Setelah dikonfirmasi caught-up dan stabil ikut proposing minimal beberapa jam:
   kembalikan config ke semula:
   ```toml
   sync-mode="SNAP"
   bonsai-limit-trie-logs-enabled=true
   ```
2. Recreate container itu sekali lagi. Karena node ini SUDAH caught-up (bukan lagi
   tertinggal >512 block), restart dengan `sync-mode=SNAP` sekarang aman — SNAP hanya
   bermasalah untuk mengejar gap besar, bukan untuk operasi normal sehari-hari.
3. Verifikasi sekali lagi lewat watchdog / cek manual bahwa node tetap ikut proposing
   setelah kembali ke SNAP.
4. Hapus file backup config kalau semua sudah dikonfirmasi stabil (atau simpan sebagai
   referensi historis, sesuai preferensi).

## Kalau prosedur ini TIDAK berhasil (FULL sync juga gagal/macet)

Belum pernah terjadi (baik di testnet maupun mainnet), tapi kalau FULL sync juga tidak
maju setelah waktu wajar (beberapa jam untuk mainnet):
- Cek peer count node itu (`net_peerCount`) — kalau 0, masalahnya konektivitas
  jaringan/firewall, bukan lagi soal sync-mode.
- Cek `static-nodes.json` node itu masih benar (terutama untuk 5 host hasil migrasi
  2026-09-15 yang pernah ditemukan usang — lihat §21).
- Sebagai langkah terakhir (BUKAN default, perlu didiskusikan dulu): wipe `data/` node
  itu dan full-resync dari genesis — jauh lebih berisiko/lama untuk mainnet dibanding
  testnet karena ukuran chain, TIDAK dilakukan tanpa pertimbangan matang.

---

*Prosedur ini adaptasi langsung dari fix nyata yang sudah dijalankan & diverifikasi di
testnet 2026-09-22 (lihat `tesnet_server/docs/CHANGELOG.md`), disesuaikan untuk
perbedaan kebijakan storage mainnet (lihat `STATUS_TERDEPLOY_2026-08-20.md` §23 dan
`BACKLOG.md`). Belum pernah dijalankan sungguhan di mainnet — kalau dipakai, catat
hasilnya di `STATUS_TERDEPLOY_2026-08-20.md` sebagai insiden baru, dan perbarui runbook
ini kalau ada langkah yang ternyata perlu disesuaikan dari pengalaman nyata.*
