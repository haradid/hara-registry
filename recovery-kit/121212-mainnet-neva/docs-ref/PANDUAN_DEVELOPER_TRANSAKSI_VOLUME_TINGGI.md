# Panduan Developer: Mengirim Ratusan Transaksi dari 1 Sender dalam 1 Block

Panduan ini untuk developer yang mengintegrasikan aplikasi ke HARA Mainnet RPC
(`https://rpc.registry.haratoken.app`) dan butuh mengirim banyak transaksi dari **satu
alamat pengirim yang sama** secara cepat/berdekatan waktu (misalnya proses batch,
airdrop, atau job otomatis) — tanpa transaksi tertolak karena nonce.

Chain ini **gas-free** (`gasPrice: 0`, `zeroBaseFee`), jadi hambatan bukan biaya, tapi
cara nonce dikelola di sisi klien.

---

## Kapasitas yang sudah diverifikasi

Diuji langsung (2026-09-30) ke endpoint produksi: **100 transaksi dari 1 sender,
dikirim bersamaan, semuanya sukses dan masuk ke 1 block yang sama** — 0 gagal, 0
nonce hilang, 0 receipt yang tidak ketemu. Chain menampung ini dengan baik selama pola
pengiriman di sisi klien benar (lihat di bawah).

---

## Yang WAJIB dilakukan: hitung nonce sendiri di sisi klien

**Jangan** query nonce ke RPC sebelum setiap transaksi. Ambil nonce awal SEKALI,
lalu naikkan sendiri secara lokal untuk tiap transaksi berikutnya dalam satu batch.

### Contoh (Node.js + ethers v6)

```js
const { ethers } = require('ethers');

const provider = new ethers.JsonRpcProvider(
  'https://rpc.registry.haratoken.app/v1/<API_KEY_ANDA>',
  { chainId: 121212, name: 'hara' }
);
const wallet = new ethers.Wallet('<PRIVATE_KEY>', provider);

async function sendBatch(recipients) {
  // Ambil nonce SEKALI di awal batch — bukan per-transaksi.
  const startNonce = await provider.getTransactionCount(wallet.address, 'pending');

  const sends = recipients.map((to, i) =>
    wallet.sendTransaction({
      to,
      value: 0n,
      nonce: startNonce + i,   // dihitung lokal, bukan query ulang
      gasLimit: 21000n,
      gasPrice: 0n,
      chainId: 121212,
      type: 0,
    })
  );

  // Kirim semua secara paralel — chain ini terbukti sanggup menampung
  // ratusan tx dari 1 sender ke 1 block yang sama.
  return Promise.allSettled(sends);
}
```

Pola yang sama berlaku di bahasa/library lain (web3.py, viem, web3.js) — intinya
selalu sama: **1 kali ambil nonce di awal batch, sisanya hitung sendiri (`+1` per
transaksi berikutnya), jangan query RPC lagi di tengah batch.**

---

## Yang HARUS DIHINDARI

### ❌ Query `'latest'` sebelum setiap kirim

```js
// JANGAN seperti ini kalau mengirim banyak tx berdekatan waktu:
for (const to of recipients) {
  const nonce = await provider.getTransactionCount(wallet.address, 'latest'); // BAHAYA
  await wallet.sendTransaction({ to, nonce, /* ... */ });
}
```

`'latest'` cuma mencerminkan block **terakhir yang sudah ter-mining** — TIDAK
memperhitungkan transaksi yang masih di mempool. Block period chain ini 5 detik, jadi
kalau kirim lebih cepat dari itu, `'latest'` akan terus mengembalikan nonce yang SAMA
berkali-kali sampai block berikutnya benar-benar selesai.

**Hasil pengujian nyata dengan pola ini**: dari 15 transaksi berurutan yang masing-
masing query `'latest'` dulu sebelum kirim, **cuma 3/15 yang sukses** — sisanya gagal
dengan error `nonce has already been used` karena bertabrakan dengan transaksinya
sendiri.

### ⚠️ Query `'pending'` sebelum setiap kirim — lebih baik, tapi tetap berisiko

`'pending'` ikut memperhitungkan mempool, jauh lebih baik dari `'latest'`. Pengujian
yang sama dengan `'pending'` menghasilkan 13/15 sukses — tapi tetap ada risiko race
condition kalau 2 request query-lalu-kirim terjadi dalam jarak waktu yang sangat rapat
(sebelum transaksi sebelumnya benar-benar tercatat di mempool). **Tetap lebih aman
menghitung nonce sendiri di sisi klien** daripada mengandalkan tag `'pending'` untuk
pengiriman batch/berjumlah banyak.

---

## Ringkasan

| Pola | Aman untuk batch banyak-tx? |
|---|---|
| Hitung nonce lokal, 1x ambil di awal batch | ✅ Ya — terverifikasi 100/100 sukses |
| Query `'pending'` sebelum tiap kirim | ⚠️ Sebagian besar aman, tapi ada celah race |
| Query `'latest'` sebelum tiap kirim | ❌ Tidak — akan gagal kalau kirim lebih cepat dari 5 detik/tx |

Kalau butuh throughput lebih tinggi dari rate-limit API key default, hubungi tim HARA
untuk penyesuaian `rps_limit` key Anda.
