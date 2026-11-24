# Mainnet — Hasil QA & Stress Test

Konsolidasi hasil stress/functional test yang pernah dijalankan terhadap mainnet. Detail
root-cause tiap insiden yang ditemukan lewat testing ada di `docs/STATUS_TERDEPLOY_2026-08-20.md`
— dokumen ini fokus ke **hasil test**, bukan narasi insiden.

## 2026-08-28 — Stress test awal 4-pool RPC + gateway (§12 STATUS_TERDEPLOY)

Diuji live lewat domain publik sungguhan setelah gateway/dashboard/5-domain selesai
dibangun. Termasuk verifikasi transaksi bernilai asli yang benar-benar ter-mining (§13),
live failover test (matikan `rpc1`/`write2`, zero-downtime terverifikasi, §15.2), dan
sustained load test 3 menit/481 req/s (§15.3).

## 2026-09-16 — Stress test skala besar (read/write/chaos), diizinkan eksplisit oleh user

Mainnet belum dipakai produksi sungguhan saat ini, jadi user mengizinkan stress test
skala lebih besar dari biasanya, termasuk transaksi tulis sungguhan dan mematikan node
non-validator (`rpc1`/`rpc2`/`call`) untuk uji chaos — TIDAK pernah menyentuh validator
konsensus manapun.

**Read-load test** (lewat gateway, domain publik `rpc.registry.haratoken.app`):

| Concurrency | Total request | Hasil |
|---|---|---|
| 100 | 8.000 | 8.000/8.000 sukses, 0 gagal |
| 200 | 12.000 | 12.000/12.000 sukses, 0 gagal |

Memori node `call` (baru dinaikkan `mem_limit` 1024m→1536m hari yang sama) stabil ~54%
sepanjang test — tidak ada indikasi OOM dari beban baca.

**Write-load test** (skala kecil/terkontrol sesuai arahan user — transaksi permanen di
chain produksi): 48-80 transaksi (wallet sekali-pakai, transfer 0 value), submit 100%
sukses.

**Chaos test #1 — `docker stop hara-mainnet-rpc2` di tengah beban tulis (80 tx):**
Semua 80 tx sukses disubmit (dapat tx hash), TAPI **0 dari 10 sample ter-mining** setelah
15 detik — root cause: ke-80 tx itu semua masuk ke mempool lokal `rpc2` (bukan
round-robin ke `rpc1` dalam window sesingkat itu), lalu `rpc2` mati sebelum sempat
menyebarkannya via gossip P2P (`txpool_besuStatistics` di `rpc1` menunjukkan
`remoteCount:0`, konfirmasi tx itu tidak pernah sampai). **Pelajaran operasional**: tx
hash yang berhasil didapat BUKAN jaminan ter-mining kalau node penerima mati tak lama
setelah menerima — client harus polling receipt & submit ulang (nonce sama) kalau belum
confirmed dalam waktu wajar. Ini karakteristik arsitektur multi-write-node secara umum,
bukan bug yang bisa di-config-fix.

**Temuan sampingan dari chaos test #1 — bug nyata ditemukan**: HAProxy `call_backend`
ikut `DOWN` saat `rpc2` dimatikan, padahal `call` adalah container terpisah yang masih
hidup. Root cause & fix lengkap: STATUS_TERDEPLOY §20 (ringkasnya: tunnel key `hara-rpc2-tunnel`
tidak pernah diberi izin `permitopen` ke port asli `call`, jadi `call_backend` diam-diam
menunjuk ke port `rpc2` sejak migrasi 2026-09-15). **Setelah fix, diverifikasi ulang**:
`docker stop hara-mainnet-call` sungguhan sekarang HANYA menjatuhkan `call_backend`,
`rpc_backend` sama sekali tidak terganggu — isolasi call/write baru benar-benar aktif
sekarang.

**Kesimpulan**: 1 bug nyata ditemukan & diperbaiki (call/write cross-contamination di
HAProxy). Tidak ada OOM baru ditemukan di node manapun. Block production tidak pernah
terganggu sepanjang seluruh proses (validator konsensus tidak pernah disentuh).

## Cleanup

Semua API key stress-test dihapus dari `api_keys` setelah masing-masing putaran test
selesai. Wallet sekali-pakai dari write-load test sengaja TIDAK dibersihkan dari
chain — permanen di mainnet (sesuai sifat chain), tapi tidak ada biaya/risiko
menyimpan address dust.
