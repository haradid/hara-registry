# Gateway Dashboard — Faucet & Activity Monitor

Ditambahkan 2026-08-27 di atas API gateway yang sudah ada (`docs/DOMAIN_AND_PORTS.md`
untuk URL/port). Dokumen ini fokus ke 2 fitur baru: faucet dan activity monitor, plus
insiden nyata yang ditemukan & diperbaiki saat implementasi — penting dibaca sebelum
menyentuh genesis/faucet lagi.

## Faucet (`/faucet`, publik — tidak perlu login)

- Halaman self-serve: user paste address, dapat native token testnet secara otomatis.
- Backend: `gateway/dashboard/src/lib/faucet.ts` — pakai `ethers` (v6), connect LANGSUNG
  ke `rpc1` (`host.docker.internal:5797`, bukan lewat gateway/API key — faucet adalah
  bagian dari infra sendiri, tidak perlu rate limit API-key layer).
- Cooldown: 1 klaim per address DAN per IP setiap 24 jam (`FAUCET_COOLDOWN_HOURS`),
  dicek terhadap tabel `faucet_claims` sebelum kirim.
- Jumlah kirim: `FAUCET_DRIP_AMOUNT_ETH` (default 10 native token per klaim).
- Nonce safety: pengiriman di-serialize lewat in-memory queue (`enqueue()` di faucet.ts)
  supaya klaim konkuren tidak rebutan nonce dari wallet faucet yang sama.
- Semua klaim (sukses/gagal) tercatat di `faucet_claims` (status pending→sent/failed)
  dan `audit_log` (actor='public', action='faucet.claim').

### 🔴 Insiden: alamat faucet salah derive (ditemukan & diperbaiki 2026-08-27)

Saat testing pertama kali, wallet address yang di-derive dari `keys/faucet_key` (via
`ethers.Wallet`) adalah `0x5b701b7c9ef5d641e9270a6f19ed9be9b6a1830b` — TAPI genesis yang
sudah live men-fund alamat `0xdda8ac237cc3fc12fd3ff0b9630875ea61c7f6d5`. Dua alamat beda.

**Root cause**: saat generate genesis pertama kali, alamat faucet diambil dari **20 byte
pertama public key mentah**, bukan hasil `besu public-key export-address` (yang benar:
`keccak256(pubkey)[12:]`). Ini persis bug yang sudah pernah dicatat di memory
`qbft_address_derivation.md` untuk validator — ternyata terulang lagi khusus untuk
alamat faucet karena jalur derivasinya sempat tidak konsisten. `0xdda8ac23...` bukan
alamat yang bisa diakses private key manapun (bukan hasil derivasi keccak yang valid) —
saldo di sana secara praktis hilang selamanya.

**Fix**: genesis di-generate ulang dengan alamat yang benar
(`0x5b701b7c9ef5d641e9270a6f19ed9be9b6a1830b`, diverifikasi via
`besu public-key export-address` DAN `ethers.Wallet` — dua-duanya cocok), lalu **chain
di-reset** (semua 4 node, block kembali ke 0). Postgres (users/API key) TIDAK ikut reset.

**Pelajaran**: kapan pun generate address dari private key untuk keperluan APAPUN
(validator, faucet, dst), WAJIB verifikasi dengan `besu public-key export-address`
sebelum menaruhnya ke genesis `alloc` — jangan pernah ambil byte mentah dari public key.

## Activity Monitor (`/activity`, perlu login admin)

Dua sumber, ditampilkan bersebelahan:

1. **Dashboard activity** (tabel `audit_log`) — setiap aksi admin: login/logout, buat/
   suspend user, buat/revoke/update API key, tambah/hapus alert recipient, klaim faucet
   (actor='public'). Ditulis lewat `logAudit()` (`gateway/dashboard/src/lib/audit.ts`)
   dipanggil dari tiap server action di `lib/actions.ts` dan `lib/faucet.ts`.
2. **RPC gateway activity** (tabel `rpc_activity_log`) — log PER-REQUEST individual
   (method, status code, durasi, IP asli lewat `X-Forwarded-For` — gateway
   `app.set('trust proxy', true)` supaya baca IP asli client di belakang Caddy), bukan
   agregat per-jam seperti halaman Usage. Ditulis dari `gateway/src/usage/activityLog.ts`,
   di-buffer & flush tiap 10 detik (pola sama seperti `usage/recorder.ts` yang sudah ada).
   Auto-prune baris lebih tua dari **30 hari** (`RETENTION_HOURS`, diminta user
   2026-08-27 — sebelumnya 72 jam) lewat timer TERPISAH yang jalan tiap jam, independen
   dari traffic. Awalnya prune digantung di jalur flush() yang sama, tapi flush() return
   early kalau buffer kosong — di testnet yang traffic-nya sepi, prune nyaris tidak
   pernah kejalan. Sudah diperbaiki sebelum retensi bulanan ini diaktifkan.
   - HTTP: dicatat per request (semua status, termasuk 429 rate-limited & error).
   - WS: dicatat 1x per koneksi berhasil (method='ws_connect') — bukan per-message,
     supaya tidak membanjiri tabel untuk koneksi WS yang long-lived/subscription.

## Insiden kedua: `rpc1` transaction pool permanen disabled setelah reset

Setelah reset chain (untuk fix bug faucet di atas), `rpc1` sempat gagal terima transaksi
sama sekali (`"Transaction pool not enabled...node not yet in sync"`) walau block height-nya
sendiri terlihat naik normal dan `net_peerCount` = 3. Root cause: `rpc1` pakai `sync-mode=SNAP`
(sama seperti validator1/2/3), tapi rpc1 BUKAN validator — tidak ikut mekanisme QBFT round
yang membuat validator bisa lolos dari deadlock pivot-selection SNAP (lihat
`besu_solo_validator_bootstrap` di memory / `validator1/config/config.toml`). Block IMPORT
jalan normal (lewat jalur block-propagation terpisah), tapi flag internal "initial sync
complete" yang menggerbangi transaction pool tidak pernah ke-set.

**Fix**: `rpc1/config/config.toml` diubah ke `sync-mode="FULL"` (bukan SNAP) — di FULL mode
ini AMAN dipakai untuk rpc1 karena sekarang punya peer yang genuinely "ahead" (3 validator
yang aktif produksi blok), beda dari kasus solo-validator dulu di mana FULL mode deadlock
karena tidak ada peer yang pernah maju sama sekali. Konsekuensi: `bonsai-limit-trie-logs-enabled`
tidak bisa dipakai di rpc1 (perlu SNAP/CHECKPOINT) — trade-off yang diterima, cuma di rpc1.
Validator1/2/3 TETAP pakai SNAP + trie-log pruning (tidak ada masalah ini, karena
mekanisme QBFT round mereka independen dari gerbang sync yang sama).

## Akses publik tanpa API key (`/v1/public`, ditambahkan 2026-08-27)

Sebelumnya `/v1/:apiKey` WAJIB key valid (401 kalau tidak ada/salah). Sekarang ada jalur
tambahan `https://rpc.mampang.haratoken.app/v1/public` (HTTP & WS) yang bisa dipakai
langsung tanpa registrasi — cocok untuk coba-coba cepat — tapi rate limit-nya SANGAT
rendah dibanding key asli (default 10 rps / 100.000 per hari):

- `PUBLIC_RPS_LIMIT` — default **1 request/detik**.
- `PUBLIC_DAILY_QUOTA` — default **100/hari**.
- Kedua env var itu (`gateway/docker-compose.yml`, service `gateway`) bisa diubah tanpa
  code change, restart gateway saja.
- Dibatasi **per source IP**, bukan global — satu IP yang spam tidak menghabiskan jatah
  IP lain. HTTP dan WS dari IP yang sama berbagi 1 bucket yang sama (id-nya `public:<ip>`).
- Response 429 pas kena limit menyertakan pesan "register a free API key for higher
  limits" — supaya jelas ini bukan endpoint utama.

**Implementasi**: route `/v1/public` didaftarkan sebagai path literal di
`gateway/src/server.ts`, SEBELUM chain `/v1/:apiKey` — jadi request ke situ tidak pernah
lewat `apiKeyAuth`/lookup Postgres sama sekali. Guard-nya sendiri
(`gateway/src/auth/publicAccess.ts`) pakai primitive rate-limit yang SAMA dengan jalur
keyed (`checkRpsLimit`/`checkDailyQuota` di `rateLimit/limiter.ts`), cuma dimensi id-nya
IP bukan `apiKeyId`.

**Kenapa TIDAK pakai `recordUsage()` untuk jalur ini**: tabel `usage_hourly` dan
`usage_daily_quota` punya `api_key_id UUID NOT NULL REFERENCES api_keys(id)` — tidak ada
baris `api_keys` untuk "public", jadi insert dengan id palsu bakal gagal FK constraint.
Karena `recorder.ts` nge-flush banyak event sekaligus dalam SATU transaction, satu event
gagal bikin SELURUH batch flush itu di-ROLLBACK — termasuk event dari API key asli yang
kebetulan flush bareng. Jalur public sengaja cuma pakai `recordActivity()`
(`rpc_activity_log.api_key_id` NULLABLE, `ON DELETE SET NULL`) yang aman untuk kasus ini
— sudah diverifikasi di server: `key_prefix='public'`, tidak ada error di log gateway.

Diuji live 2026-08-27: burst 5 request beruntun → 1× 200 + sisanya 429 (rps=1 kena
persis), lanjut spaced 1.1s antar request → semua 200 (window recover normal), WS
`/v1/public` konek & terima response `eth_blockNumber` normal, dan key asli yang dites
langsung setelahnya sama sekali tidak terpengaruh (bucket terpisah per-IP/per-key).

## Insiden ketiga: suspend user tidak mencabut akses API key (ditemukan & diperbaiki 2026-08-27)

Ditemukan saat functional testing menyeluruh: tombol **Suspend** di halaman user hanya
mengubah `users.status`. Tapi `lookupApiKey()` (`gateway/src/auth/keyCache.ts`) — fungsi
yang benar-benar men-gate akses RPC — cuma pernah query tabel `api_keys`, TIDAK PERNAH
join/cek `users.status`. Akibatnya: user yang di-suspend, semua API key miliknya TETAP
berfungsi penuh (rps/quota normal) sampai key-nya di-revoke satu-satu secara manual.
Badge di UI berubah jadi merah "suspended", tapi itu cuma tampilan — tidak ada penegakan
nyata di jalur RPC.

**Dibuktikan live** (bukan cuma baca kode): buat test user + key baru → key jalan normal
(200) → suspend user via SQL yang identik dengan `updateUserStatusAction` → key masih
tetap 200 (bug terkonfirmasi) → apply fix → key langsung 401 "Invalid or revoked API
key" → reactivate + invalidate cache → key kembali 200. Semua 4 langkah diverifikasi via
curl langsung ke `rpc.mampang.haratoken.app`, bukan asumsi.

**Fix** (2 file):

1. `gateway/src/auth/keyCache.ts` — `lookupApiKey()` sekarang JOIN `users`, dan key
   dianggap `active` hanya kalau KEDUA `api_keys.status` DAN `users.status` sama-sama
   `active`.
2. `gateway/dashboard/src/lib/actions.ts` — `updateUserStatusAction()` sekarang
   invalidate cache Redis untuk SEMUA key milik user itu (bukan cuma andalkan TTL 60
   detik expire sendiri), supaya suspend berlaku instan — pola yang sama dengan
   `revokeApiKeyAction` yang sudah lebih dulu benar untuk kasus per-key.

**Pelajaran**: kalau ada 2 level status (user vs. resource-milik-user), titik
enforcement (di sini: gateway auth) harus cek KEDUANYA — cukup gampang lupa kalau
resource-nya (api_keys) look self-contained (punya kolom `status` sendiri).

## Block Explorer (`/explorer`, publik — tidak perlu login)

Ditambahkan 2026-08-27, sebagai halaman baru di aplikasi dashboard Next.js yang SAMA
(bukan container terpisah) — keputusan sadar setelah 2x percobaan deploy explorer
standalone (Expedition, `etherparty/explorer`) gagal karena masalah infra (container
kepencet mati, lalu koneksi SSH putus di tengah build) DAN stacknya sendiri sudah lama
(Node 14/Vue 2, rawan gagal build). Server ini RAM-nya ketat (~250MB benar-benar bebas),
jadi menambah halaman ke app yang sudah jalan (nol container baru) jauh lebih aman
daripada menambah service baru.

- Halaman: `/explorer` (landing + search + 15 block terbaru), `/explorer/block/[number]`,
  `/explorer/tx/[hash]`, `/explorer/address/[address]`.
- Backend: `gateway/dashboard/src/lib/explorerRpc.ts` — connect READ-ONLY langsung ke
  rpc1 pakai `ethers`, pola sama seperti faucet (bukan lewat gateway/API key — explorer
  murni baca data, tidak perlu rate limit API-key layer).
- Search (`lib/explorerActions.ts`): 1 kotak input, deteksi otomatis format (angka →
  block, `0x` + 64 hex → tx hash, `0x` + 40 hex → address), redirect ke halaman yang
  sesuai.
- **Tidak ada indexer/database** — sengaja, ini yang bikin "ringan". Konsekuensinya:
  TIDAK ADA pencarian riwayat penuh untuk suatu address (butuh scan seluruh chain untuk
  itu). Halaman address cuma scan **50 block terakhir** untuk "recent activity" — cukup
  murah (rpc1 sanggup 150 tx concurrent dalam ~7.5 detik saat stress test, jadi 50
  `getBlock` call ini sepele), tapi eksplisit dilabeli di UI supaya user tidak salah
  paham itu riwayat lengkap.
- URL: `https://dashboard.mampang.haratoken.app/explorer`, dan sejak **2026-09-15** juga
  live di subdomain terpisah `https://explorer.mampang.haratoken.app` (DNS A record ke-4
  sudah dipasang tim infra, rewrite ke `/explorer` sebelum proxy ke backend dashboard yang
  sama). Sempat ada 2 bug ditemukan & diperbaiki hari yang sama (404 redirect-loop, lalu
  CSS/JS hilang karena rewrite ikut mem-prefix path `/_next/*`) — lihat `docs/CHANGELOG.md`.

### Insiden keempat: faucet DAN explorer sama-sama 403 "Host not authorized" (ditemukan & diperbaiki 2026-08-27)

Ditemukan saat testing pertama halaman explorer baru: semua request ke rpc1 gagal
dengan `{"message":"Host not authorized."}` (403). Root cause: `rpc1/config/config.toml`
punya `host-allowlist=["localhost","127.0.0.1","<TESTNET_SERVER_PUBLIC_IP>"]` — Besu
menolak request apapun yang header `Host`-nya tidak ada di daftar itu. Dashboard/gateway
container connect ke rpc1 lewat `host.docker.internal:5797` (perlu, supaya bisa reach
network host dari container yang bridge-networked), dan `ethers.JsonRpcProvider` secara
default kirim header `Host: host.docker.internal` — otomatis ditolak.

**Yang mengejutkan**: bug yang SAMA PERSIS ternyata sudah ada di `lib/faucet.ts` sejak
awal — pola constructor providernya identik, tidak pernah override header `Host`. Artinya
**faucet sebenarnya sudah gagal di production sejak awal**, bukan cuma baru untuk
explorer. Untungnya `faucet_claims` masih kosong total (0 baris) saat bug ini ditemukan —
belum ada satupun user asli yang sempat coba klaim, jadi dampaknya nol secara praktik,
tapi tetap bug nyata yang harus diperbaiki sebelum orang mulai pakai.

Kenapa tidak ketahuan lebih awal: gateway sendiri (`gateway/src/proxy/httpProxy.ts`)
SUDAH benar dari awal — dia eksplisit override `Host` header ke `localhost`
(`config.upstreamHostHeader`, lihat komentar di `gateway/src/config.ts`) sebelum forward
ke rpc1. Tapi pola itu tidak pernah direplikasi ke `lib/faucet.ts` waktu faucet dibuat,
karena faucet connect LANGSUNG ke rpc1 (bukan lewat gateway) memakai `ethers` murni yang
tidak expose opsi header sesimpel proxy middleware.

**Fix** (2 file, pola identik): `lib/faucet.ts` dan `lib/explorerRpc.ts` sekarang
construct provider-nya lewat `ethers.FetchRequest` + `.setHeader('Host', 'localhost')`
sebelum dibungkus `JsonRpcProvider`, supaya TCP tetap connect ke `host.docker.internal`
(perlu untuk reachability) tapi HTTP `Host` header yang dikirim adalah `localhost`
(diizinkan allowlist).

**Dibuktikan live, bukan cuma baca kode**: setelah fix, submit klaim faucet asli lewat
jalur produksi sungguhan (bukan shortcut) ke address test — hasil: transaksi terkirim,
`status: success`, tx hash `0xb6a6cdf2...`, dikonfirmasi on-chain
(`eth_getTransactionReceipt` → `status: "0x1"`), dan baris di `faucet_claims` tercatat
benar (`status='sent'`, `tx_hash` cocok). Explorer juga dites end-to-end: landing page,
block detail (block dengan 40 tx dari stress test sebelumnya — semua link render benar),
tx detail (badge "Success" benar), address detail (balance benar, recent-activity scan
benar termasuk kasus "tidak ada di 50 block terakhir" karena tx lama sudah di luar
window), dan search (keempat cabang: block number, tx hash, address, input tidak
valid — keempatnya redirect ke tujuan yang benar).

**Pelajaran**: kalau ada 2 jalur berbeda yang connect ke resource yang sama dengan
constraint yang sama (di sini: host-allowlist Besu), fix di SATU jalur (gateway) tidak
otomatis melindungi jalur LAIN (faucet) yang dibuat terpisah — perlu audit eksplisit
"komponen lain mana yang punya masalah serupa" tiap kali nemu bug kelas ini, bukan cuma
percaya bug-nya spesifik ke 1 tempat.

## Dashboard UI

Redesign ringan 2026-08-27 (CSS murni, `gateway/dashboard/src/app/globals.css` — tanpa
framework UI berat, supaya build tetap cepat di server 4GB ini): card-based layout, badge
status berwarna, tabel modern, nav bar dengan link Users/API Keys/Usage/Faucet/Activity/
Alerts. Semua halaman lama (login, users, user detail, api-keys, usage, alert-recipients)
di-retrofit pakai class CSS yang sama, bukan inline style lagi.
