# Testnet — Hasil QA & Stress Test

Konsolidasi seluruh putaran stress/functional test yang pernah dijalankan terhadap
testnet, disatukan di satu tempat (sebelumnya tersebar di `docs/TESTING_2026-08-27.md`
dan `docs/CHANGELOG.md`). Urut dari yang terlama. Detail root-cause tiap bug ada di
`docs/GATEWAY_FEATURES.md` dan `docs/CHANGELOG.md` — dokumen ini fokus ke **hasil test**,
bukan narasi insiden.

## 2026-08-27 — Bug check + functional + stress test menyeluruh

Diuji LIVE terhadap server production (bukan simulasi lokal). 9 bug ditemukan &
diperbaiki total (7 dari code-review sebelumnya + 2 baru round ini), semua diverifikasi
lewat transaksi/request sungguhan setelah fix.

**Stress test Besu (validator + rpc, diminta eksplisit oleh user):**

| Test | Beban | Hasil |
|---|---|---|
| A — burst 1 akun | 40 tx sequential-nonce, dikirim nyaris bersamaan | 40/40 terkirim, semua confirmed dalam **6.7 detik**, 1 block, 0 revert |
| B — burst 5 akun konkuren | 5×30 = 150 tx ditembak bersamaan dari 5 wallet | 150/150 terkirim, semua confirmed dalam **7.5 detik**, 1 block, 0 revert |

Resource usage saat Test B (`docker stats`, snapshot 5 detik):

| Container | CPU (peak) | Memory (range) | Limit saat itu |
|---|---|---|---|
| validator1 | 5.35% | 457–471 MiB | 700m |
| validator2 | 12.64% | 458–473 MiB | 700m |
| validator3 | 5.66% | 456–469 MiB | 700m |
| rpc1 (retired 2026-08-28) | 21.66% | 456–475 MiB | 900m |

Tidak ada yang mendekati limit — headroom besar bahkan di 150 tx serentak. `net_peerCount`
tetap 3 sepanjang test, tidak ada stall/fork/restart.

**Fungsional lain** (semua PASS, detail di GATEWAY_FEATURES.md): quota RPS-vs-daily
ordering, race condition faucet (1/10 klaim konkuren lolos, sesuai ekspektasi), endpoint
publik `/v1/public` rate-limit, suspend-user cache invalidation, faucet+explorer
Host-header fix (bug ditemukan & diperbaiki hari itu juga), CRUD alert-recipients.

## 2026-09-16 — Stress test menyeluruh (read/write/chaos), skala jauh lebih besar

Diminta user setelah insiden OOM validator2/3 (2026-09-14) untuk memastikan infrastruktur
tahan beban tinggi sebelum dianggap selesai. Tool load-test kecil dibuat khusus (`ethers`
+ `fetch` mentah, wallet sekali-pakai — chain gas-free jadi tidak perlu funding).

**Read-load test** (lewat gateway, domain publik `rpc.mampang.haratoken.app`):

| Concurrency | Total request | Hasil | Catatan |
|---|---|---|---|
| 30 | 1.500 | 1.310 sukses, 190 `429` | Rate-limit key testnet bekerja sesuai desain, bukan bug |
| 100 (sebelum fix) | 8.000 | 7.608 sukses, **392 gagal `502` nyata** | Bug ditemukan: `rpc-http-max-active-connections` masih default Besu (50) |
| 100 (setelah fix →250/200) | 8.000 | **8.000/8.000 sukses** | Memori flat 38-56% sepanjang test — bukan soal memori |
| 200 (setelah fix) | 10.000 | **10.000/10.000 sukses** | Latency naik (p99 ~4.8s) tapi tidak ada lagi kegagalan — degradasi wajar (antrian), bukan error |

**Write-load test**: 1000 tx (50 wallet × 20 tx) — 100% submit sukses, txpool bersih
(0 pending/queued) setelah selesai, sample 10 tx dicek `eth_getTransactionReceipt` → semua
mined.

**Chaos test** (`docker stop hara-tesnet-validator1` di tengah beban tulis 450 tx):
~70/450 gagal di ~10 detik pertama (sesuai desain — `rpcHealth.ts` butuh 2 kegagalan
berturut ~10 detik sebelum failover, supaya tidak flapping di gangguan sesaat), sisanya
sukses lewat failover ke validator3, tercatat di log gateway (`failing over to
secondary` → `switching back to primary`), txpool bersih setelah validator1 kembali.

**Kesimpulan**: 1 bug nyata ditemukan & diperbaiki (connection-limit), failover RPC
bekerja sesuai desain untuk outage berkelanjutan (bukan untuk kegagalan instan di detik
pertama — itu trade-off yang disengaja).

## Cleanup

Semua API key/wallet test bersifat sekali-pakai dan dibuang setelah verifikasi (key
stress-test 2026-09-16 dihapus dari `api_keys` setelah test selesai). Wallet throwaway
dari stress test Besu 2026-08-27 sengaja TIDAK dibersihkan dari chain — tidak ada
biaya/risiko menyimpan address dust di testnet.
