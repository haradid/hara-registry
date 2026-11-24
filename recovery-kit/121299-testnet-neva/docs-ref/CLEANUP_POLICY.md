# Kebijakan Pembersihan Berkala (Cleanup Policy)

## Keputusan

Disk server hanya terbatas dan ini murni environment testnet (bukan produksi). Pilihan
yang dikonfirmasi: **full chain reset setiap 3 bulan**, bukan sekadar housekeeping
non-destruktif. Semua node jalan dengan `sync-mode="SNAP"` +
`bonsai-limit-trie-logs-enabled=true` (trie-log pruning SUDAH aktif berkelanjutan), tapi
block body & receipt tetap bertambah terus tanpa batas waktu — full reset berkala tetap
dipakai sebagai lapis kontrol storage utama, bukan cuma cadangan.

> **⚠️ Topologi sekarang 2 host** (sejak load-splitting 2026-09-10: validator1+validator2
> di Host A, validator3 di Host B — lihat `docs/ARCHITECTURE.md`), dan node `rpc1` yang
> disebut di versi lama dokumen ini **sudah di-retire 2026-08-28** (RPC sekarang di
> validator1). `scripts/cleanup_quarterly_reset.sh` **belum diperbarui untuk 2-host** —
> saat ini cuma reset validator1+validator2 (Host A). **Lihat `BACKLOG.md` — ini perlu
> diperbaiki sebelum jadwal reset berikutnya (1 Oktober 2026).**

## Apa yang terjadi tiap siklus (`scripts/cleanup_quarterly_reset.sh`, Host A saja untuk saat ini)

1. Catat block height & disk usage sebelum reset → `logs/cleanup_history.log`
2. Stop `validator1` + `validator2`
3. Hapus **seluruh isi `data/` di kedua node** (block, state, receipt — SEMUA riwayat
   transaksi & kontrak yang di-deploy di testnet ini hilang)
4. `docker system prune -af` (image/container/build-cache menganggur — volume TIDAK di-prune)
5. Start ulang dari `config/genesis.json` yang sama (block 0 lagi)
6. Catat block height & disk usage setelah reset

`validator3` (Host B) **TIDAK ikut ter-reset oleh script ini** — lihat peringatan di atas.

## Yang TIDAK ikut hilang

- `keys/nodekey1`, `nodekey2`, `faucet_key` — identitas validator1/2 dan alamat faucet
  tetap sama tiap siklus (`nodekey3` ada di Host B, tidak disentuh script Host A ini)
- `{validator1,validator2}/config/genesis.json` — genesis yang sama dipakai lagi, jadi
  chain ID dan validator set tidak berubah antar reset
- `logs/cleanup_history.log` — riwayat semua reset dari awal (untuk audit)
- **`netstats/` dan `gateway/` (postgres/redis/API key/user/dashboard) — TIDAK ikut
  reset sama sekali.** API key yang sudah dibuat tetap valid setelah reset, tapi
  otomatis akan mulai nge-proxy ke chain yang sudah kembali ke block 0 — kalau ada
  script/dashboard eksternal yang assume block height tertentu, itu akan terlihat
  "mundur" tiap siklus reset (bukan bug, memang chain-nya yang direset).

## Jadwal

Cron: `0 3 1 1,4,7,10 *` → tanggal 1, jam 03:00 UTC, bulan Januari/April/Juli/Oktober
(tepat tiap 3 bulan). Dipasang lewat `scripts/install_cron.sh` di server.

## Kalau ada demo/testing penting sebelum tanggal reset

```bash
crontab -e   # comment-out baris cleanup_quarterly_reset.sh sementara
```

Atau backup manual sebelum tanggal reset kalau perlu simpan state tertentu (jalankan
`validator1`/`validator2` dari Host A, `validator3` terpisah dari Host B — lihat
peringatan topologi 2-host di atas):

```bash
for n in validator1 validator2; do
  tar -czf backup-$n-$(date +%Y%m%d).tar.gz -C tesnet_server/$n data/
done
```

(Backup ini besar dan bukan bagian dari alur otomatis — pindahkan ke luar server kalau
disk 50GB tidak cukup buat menyimpan backup + data live sekaligus.)

## Mengubah kebijakan nanti

Kalau ke depannya disk di-upgrade atau testnet ini mulai dipakai untuk sesuatu yang perlu
data persisten, ganti pendekatan ke housekeeping non-destruktif (docker prune + log
rotation saja, tanpa wipe `data/`) dan matikan cron ini.
