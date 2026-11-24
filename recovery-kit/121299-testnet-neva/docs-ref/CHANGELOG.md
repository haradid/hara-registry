# Testnet — Riwayat Insiden & Perbaikan

Catatan historis, dipisah dari `README.md` supaya README tetap fokus ke kondisi saat ini.
Urut dari yang terlama.

## 2026-08-26 — Bootstrap 3-validator (bukan 1)

Rencana awal 1 node merangkap validator+RPC gagal total: **Besu resmi
(`hyperledger/besu:26.6.0-RC1`) tidak bisa bootstrap chain QBFT baru dengan validator
tunggal** — node tidak pernah keluar dari fase "initial sync" karena lapisan sync generik
Besu butuh peer yang "lebih maju" secara chain height, mustahil dipenuhi siapa pun di chain
yang baru genesis. Dicoba sistematis: FULL/SNAP sync, berbagai `sync-min-peers`, matikan
P2P, flag eksperimental `--Xsnapsync-bft-enabled` (ternyata cuma ada di fork), genesis
timestamp non-zero, 2 validator asli saling peer (round jalan tapi tidak pernah finalize).
Baru dengan **3 validator** asli saling static-peer, blok mulai diproduksi stabil (~5
detik/blok). Detail: `validator1/config/config.toml`, `docs/SETUP_GUIDE.md`.

## 2026-08-27 — Tiga insiden awal (dua pertama sempat reset chain)

1. Alamat faucet di genesis salah derive (20 byte pertama pubkey, bukan keccak256 yang
   benar) — private key yang ada tidak bisa akses saldo itu sama sekali.
2. `rpc1` macet permanen di "transaction pool disabled" pakai `sync-mode=SNAP` — diubah ke
   `FULL` khusus untuk rpc1 (validator tetap SNAP).
3. Suspend user di dashboard tidak benar-benar mencabut akses API key-nya (cek status cuma
   di tabel `api_keys`, tidak ikut cek `users.status`) — diperbaiki & diverifikasi live.
4. Faucet dan block explorer sama-sama kena 403 "Host not authorized" dari rpc1 — connect
   via `host.docker.internal` tapi tidak override `Host` header. Faucet ternyata gagal sejak
   awal, untungnya `faucet_claims` masih kosong saat ketahuan (0 dampak nyata).

Detail lengkap: `docs/GATEWAY_FEATURES.md`.

## 2026-08-27 — Bug check + stress test menyeluruh

8 bug ditemukan & diperbaiki (7 dari code-review + insiden #3 di atas), semua diverifikasi
live — termasuk stress test Besu (150 tx concurrent dari 5 sender, semua confirmed <8
detik, 0 revert) dan endpoint publik baru `/v1/public`. Detail: `QA/STRESS_TEST_RESULTS.md`.

## 2026-08-28 — RTO & JSON error intermiten (RAM over-commit)

User melaporkan keluhan tim ("suka RTO/JSON error"). Investigasi menemukan **total
`mem_limit` seluruh 11 container (4,13GB) melebihi RAM fisik server (3,8GB)**. Dikonfirmasi
via `dmesg`: OOM-killer sudah membunuh proses Node 2x (satu bahkan OOM sistem-wide). **Fix:**
`rpc1` digabung ke `validator1` (RPC diaktifkan langsung di situ, port 5797/5798 sama
persis) — 4 proses Besu jadi 3, 11 container jadi 10. RAM `available` naik 510MB → 1,0GB.

## 2026-08-28 — Hardening pasca insiden RTO

1. **`ufw` diaktifkan** — sebelumnya TIDAK ADA firewall OS-level (`inactive`), cuma
   diandalkan cloud NSG. Default-deny incoming; publik: `4422`(SSH)/`80,443`(Caddy)/
   `30303-30305`(P2P). `9100`/`9545-9547` (metrics) sengaja TIDAK dibuka publik.
2. **Regresi dari fix #1**: gateway connect ke Besu lewat `host.docker.internal` →
   `172.17.0.1` (bridge Docker) — dari sudut pandang kernel ini masuk chain INPUT juga,
   kena default-deny. RPC via gateway sempat hang total. **Fix:** `ufw allow from
   172.16.0.0/12 to any port 5797,5798 proto tcp` (cakup semua bridge Docker di server ini).
   **Pelajaran:** kalau server pakai `host.docker.internal`, `ufw` default-deny wajib diberi
   allow-list eksplisit untuk subnet bridge Docker, bukan cuma port publik.
3. **Bug crash gateway**: `gateway/src/proxy/httpProxy.ts` tidak punya handler `error` di
   `createProxyMiddleware` — kegagalan koneksi upstream ke Besu = *unhandled event* = proses
   Node **crash total** (bukan cuma 1 request gagal). **Fix:** tambah handler `error` (balas
   502 JSON-RPC, bukan crash), guard `proxyReq.headersSent`/`writableEnded`, plus
   `process.on('uncaughtException'/'unhandledRejection', ...)` sebagai jaring pengaman.
   Bug yang sama diperbaiki juga di `mainnet_production/gateway/`.
4. Mem_limit `validator2`/`validator3` dinaikkan 700m→850m (real usage 87% dari cap lama,
   terlalu mepet untuk proses konsensus) — pencegahan, bukan fix insiden aktif.

## 2026-09-10 — Load-splitting ke server ke-2 (NevaCloud), Fase 1

User minta beban dibagi ke server tambahan (`<TESTNET_HOSTB_IP>`, NevaCloud, 3 vCPU/3,8GB,
kosong). Rencana 2 fase: gateway stack dulu (risiko rendah, SELESAI), validator menyusul
(fase 2, ditunda sampai diminta). Lihat `docs/ARCHITECTURE.md` untuk topologi hasil akhirnya.

1. Docker + `ufw` dipasang dari nol di server baru (default-deny; cuma SSH + port
   4000-4002 dari IP server lama yang diizinkan — tidak dibuka ke publik).
2. Migrasi database nyata (bukan schema kosong) — `rpc_activity_log` ternyata sudah 18,7
   juta baris/2,9GB (lihat poin cleanup di bawah), jadi dump pakai
   `--exclude-table-data=rpc_activity_log` (282KB, bukan 2,4GB). Sempat FK-order issue saat
   restore (`api_keys`/`usage_hourly`/`usage_daily_quota` gagal karena urutan COPY di dump
   menaruhnya sebelum `users`) — diperbaiki dengan restore ulang 3 tabel itu setelah `users`
   dipastikan ada. Semua row count diverifikasi cocok 100% dengan sumber.
3. **Root cause "port sudah dibuka tapi tetap gagal" (lagi)**: bukan `ufw` (sudah benar),
   tapi **AWS Security Group** milik server lama (`<TESTNET_HOSTA_IP>`, dikonfirmasi AWS EC2
   ap-southeast-1 lewat IMDSv2 token + WHOIS) belum mengizinkan IP server baru. Sempat ada
   dugaan "port otomatis terbuka kalau ada service/container yang jalan" — **terbukti
   salah**: Besu RPC sudah jalan & melayani request berjam-jam sebelum port dibuka, tetap
   tidak bisa diakses dari luar sampai rule Security Group ditambahkan manual di console.
4. Caddy di server lama diarahkan ke server baru (`rpc`/`dashboard`/`explorer`, `netstats`
   tetap lokal). **`caddy reload` sempat tidak benar-benar apply config baru** (tetap dial
   `127.0.0.1` walau file di container sudah benar) — perlu `docker compose restart caddy`
   untuk benar-benar memakainya.
5. Gateway stack lama (`postgres`/`redis`/`gateway`/`dashboard`) di-`stop` (bukan hapus,
   volume tetap ada) di server lama sebagai fallback cepat.

Diverifikasi end-to-end via domain publik (RPC HTTP+WS, dashboard, faucet), dikonfirmasi
lewat isi `rpc_activity_log` di database SERVER BARU — bukan asumsi dari HTTP 200 saja.

**Ditemukan sekalian**: `rpc_activity_log` sudah 18,7 juta baris/2,9GB — dokumentasi lama
bilang "retensi 30 hari" tapi tidak pernah ada job yang benar-benar membersihkannya.
Ditambahkan `scripts/cleanup_activity_log.sh` + cron harian (`30 3 * * *`) untuk hapus baris
>30 hari. Saat ditambahkan, seluruh 18,7 juta baris ternyata masih dalam 30 hari terakhir
(volume trafik memang tinggi, bukan sampah lama) — job ini mencegah pertumbuhan tak
terbatas ke depannya, bukan mengecilkan yang sudah ada.

## 2026-09-10 — Load-splitting Fase 2: Pindahkan validator3, insiden ~37 menit downtime

Melanjutkan Fase 1 (di atas): `validator3` dipindah dari Host A ke Host B (NevaCloud),
kandidat paling rendah risiko karena tidak merangkap RPC. **Realita: proses ini memicu
downtime produksi blok ~37 menit (08:17-08:53 UTC)** — jauh lebih lama dari perkiraan awal
("puluhan detik sampai beberapa menit"), karena 3 masalah bertumpuk plus 1 temuan kritis
yang sudah lama tersembunyi. Testnet 0% fault-tolerant (quorum=3 dari 3) berarti chain
BERHENTI TOTAL begitu validator3 di-stop, sampai kembali online DAN mencapai konsensus.

### Persiapan (tanpa downtime)
Data `validator3/data` (~492MB) di-prestage ke Host B lewat tar+scp relay sementara
validator3 MASIH JALAN di Host A (tidak diganggu). Private key, genesis, config
dipindahkan file-to-file (tidak pernah tercetak di terminal). `static-nodes.json`
validator1+validator2 diupdate menunjuk IP Host B untuk validator3 (aman, Besu cuma baca
file ini saat startup, tidak ada efek langsung ke proses yang masih jalan) — sekalian
dibersihkan 1 entri basi (enode `rpc1` lama, sudah tidak ada sejak digabung ke validator1).

**Firewall 2 lapis lagi**: sama seperti Fase 1, AWS Security Group untuk port
`30303`/`30304` (P2P validator1/2) perlu dibuka manual ke IP Host B — `ufw` di Host A
sudah benar dari awal ("Anywhere"), tapi trafik P2P asli dari luar co-location memang belum
pernah teruji sebelumnya (selalu loopback). **Insiden kecil sampingan**: admin di sisi lain
sempat salah membuka rule `5797`/`5798` di **Host B** (bukan Host A yang seharusnya) via
`ufw` — tidak berbahaya (tidak ada service yang dengar di port itu di Host B, cuma menarik
bot scanner internet), sudah dibersihkan.

### Insiden #1 — Genesis file salah (5 menit downtime tambahan)
Setelah validator3 di-stop dan data final di-sync ke Host B, container gagal start:
`java.lang.IllegalArgumentException: Illegal character '_' found at index 0`. **Root
cause**: file yang disalin adalah `config/genesis.json.**template**` (placeholder
`__EXTRA_DATA__`/`__FAUCET_ADDRESS__` belum diisi), bukan `validator3/config/genesis.json`
yang sudah terisi nilai asli. **Fix**: salin ulang file yang benar dari
`validator3/config/genesis.json` milik Host A.

### Insiden #2 — Red herring: dikira masalah permission file key
Sebelum insiden #1 ditemukan, container awalnya gagal start dengan
`Failed to start Besu: Supplied file does not contain valid keyPair pair` — diduga awalnya
masalah UID/permission (`nodekey3` di-`chown root` di Host B vs `chown ubuntu` di Host A).
**Ternyata BUKAN itu** — Besu image berjalan sebagai `root` (dikonfirmasi via
`docker inspect`), dan isolated test (`besu public-key export-address`) membuktikan file
key valid & sukses dibaca. Root cause SEBENARNYA baru ketemu setelah itu (genesis template,
lihat Insiden #1) — `chmod 644` yang sempat dilakukan tidak salah tapi juga tidak relevan,
cuma kebetulan retry otomatis Docker (`restart: unless-stopped`) yang akhirnya lolos
melewati race/timing awal container.

### Insiden #3 (KRITIS, PRA-EXISTING) — Alamat validator1 di genesis TIDAK COCOK dengan node key aslinya

**Temuan paling signifikan dari insiden ini.** Setelah genesis diperbaiki (Insiden #1),
validator3 berhasil connect & sinkron penuh ke block terbaru — tapi block production TETAP
tidak lanjut selama puluhan menit lagi. Investigasi round-by-round QBFT menunjukkan
`validator1` **sama sekali tidak mengeluarkan log round-change/proposal apa pun** sejak
halt dimulai, padahal proses tetap hidup & responsif RPC.

Dicek langsung: `besu public-key export-address --node-private-key-file=nodekey1`
menghasilkan **`0x4bbab2e3cf13b02d481670aadc761945b442ffec`** — BUKAN
`0x7ac4c91aa6461f0382213a8f1b0f5bc98cf20437` yang tercatat sebagai `VALIDATOR1_ADDRESS` di
`keys/addresses.txt` DAN di-hardcode permanen dalam `extraData` genesis (dikonfirmasi juga
via `qbft_getValidatorsByBlockNumber` — validator set on-chain memang pakai alamat yang
"salah" itu). Dicek `nodekey1` di backup lokal `keys/backup_2026-08-27/` — isinya **identik
byte-per-byte** dengan yang di server sekarang, membuktikan ini **bukan sesuatu yang rusak
hari ini** — mismatch ini sudah ada sejak setup awal testnet, kemungkinan besar
`addresses.txt`/genesis di-generate dengan bug yang sama persis dengan insiden lama
"alamat faucet salah derive, ambil 20 byte pertama pubkey bukan keccak256 yang benar"
(lihat entri 2026-08-27 di atas) — tapi kali ini menimpa validator1, bukan cuma faucet.

**Dampak nyata**: `validator1` TIDAK PERNAH bisa jadi proposer blok yang sah sejak awal
chain ini berjalan — ia bisa import/relay block dan melayani RPC dengan normal, tapi setiap
kali round-robin QBFT jatuh ke gilirannya untuk propose, round itu PASTI timeout (identitas
signing-nya tidak dikenali validator set on-chain). Dalam kondisi normal (semua 3 node
online, latency nyaris nol karena co-located), giliran gagal ini cuma makan beberapa detik
sebelum lanjut ke proposer berikutnya — nyaris tidak terlihat, mungkin sudah terjadi
ratusan/ribuan kali tanpa disadari sejak awal. Baru terlihat jelas hari ini karena
**bersamaan dengan validator3 down**, round-change butuh lebih banyak siklus untuk pulih,
dan beberapa di antaranya kena giliran validator1 — memperpanjang total downtime secara
signifikan (backoff eksponensial round-timer: 40s→80s→160s→320s→640s→1280s per gagal).

**Resolusi insiden hari ini**: bukan dengan memperbaiki key mismatch (terlalu berisiko
dilakukan di tengah insiden aktif), tapi menunggu round-robin proposer bergeser ke
`validator2`/`validator3` (yang key-nya cocok) — dibantu dengan restart `validator2`
(aman, tidak menjalankan RPC) untuk mereset round counter-nya, mempercepat kombinasi round
yang akhirnya cocok. Block production pulih **08:53:49 UTC**, terverifikasi block baru
mengalir normal tiap ~5 detik, termasuk 1 transaksi nyata langsung masuk di block pertama
setelah pulih (bukti trafik asli, bukan simulasi).

**Update 2026-09-11 — DIPERBAIKI PERMANEN.** Dieksekusi via QBFT live validator vote,
persis seperti rencana di atas:
1. Aktifkan sementara RPC loopback-only (`127.0.0.1:15797`, TIDAK ada perubahan firewall
   sama sekali) di `validator2` dan `validator3` supaya bisa memanggil `qbft_*` RPC —
   sebelumnya keduanya tidak punya RPC aktif sama sekali.
2. **Fase 1 (tambah dulu, jangan hapus dulu)**: `qbft_proposeValidatorVote` di
   `validator2`+`validator3` untuk MENAMBAH `0x4bbab2e3cf13b02d481670aadc761945b442ffec`
   (alamat asli `nodekey1` yang benar) sebagai validator. Sengaja tambah dulu sebelum
   hapus supaya fault-tolerance tidak pernah lebih buruk dari kondisi saat itu selama
   transisi (network sempat 4 validator, quorum makin toleran, bukan makin ketat).
   Berhasil ~30 detik kemudian — dikonfirmasi `qbft_getValidatorsByBlockNumber` menunjukkan
   4 alamat, DAN diverifikasi langsung `validator1` berhasil propose+sign block
   `0x1fc3f` (field `miner` cocok persis dengan alamat asli) — **pertama kalinya sejak
   jaringan ini dibuat validator1 benar-benar berhasil jadi proposer yang sah.**
3. **Fase 2**: `qbft_proposeValidatorVote` di `validator1`(pakai RPC utamanya sendiri,
   sekarang identitasnya sudah sah) + `validator2` + `validator3` (3 dari 4 = mayoritas)
   untuk MENGHAPUS `0x7ac4c91aa6461f0382213a8f1b0f5bc98cf20437` (alamat salah). Berhasil
   ~30 detik kemudian — validator set kembali ke 3 anggota, kali ini dengan 3 alamat yang
   BENAR SEMUA.
4. Diverifikasi round-robin proposer bergilir sempurna 5 block berturut-turut:
   validator2→validator3→validator1→validator2→validator3, masing-masing berhasil
   propose+sign (dicek field `miner` tiap block) — block period stabil persis 5 detik,
   tidak ada round-change sama sekali.
5. Cleanup: `qbft_discardValidatorVote` di ketiga node (bersihkan sisa vote state), RPC
   sementara di `validator2`/`validator3` dikembalikan ke `rpc-http-enabled=false` seperti
   semula (postur keamanan asli dipulihkan — cuma `validator1` yang punya RPC aktif).

**Hasil: jaringan ini sekarang BENAR-BENAR 3-dari-3 validator berfungsi penuh**, bukan lagi
2-dari-3 efektif. Fault tolerance kembali sesuai desain asli (quorum 3, semua online).

### Perbaikan lanjutan — `validator3` sekarang lapor ke netstats (2026-09-10, permintaan user)

Sebelumnya diputuskan sebagai trade-off yang diterima ("kosmetik saja"), tapi user minta
diperbaiki karena netstats jadi salah tampilkan `validator3` sebagai mati padahal jalan
normal. Fix: ubah bind netstats dari `127.0.0.1:3001:3000` ke `0.0.0.0:3001:3000` di Host A,
supaya bisa diakses dari Host B — **butuh konfirmasi eksplisit user** karena aksi ini
sempat diblokir classifier keamanan otomatis (perubahan bind port ke publik dianggap
perlu pengawasan ekstra).

**Ditemukan bug infra penting sekaligus**: setelah bind diubah, port 3001 sempat
**terbuka ke SELURUH INTERNET**, bukan cuma ke Host B, padahal rule `ufw allow from
<TESTNET_HOSTB_IP> to any port 3001` sudah ada dan benar. **Root cause: Docker memanipulasi
iptables langsung untuk port yang di-publish via bridge network (`ports:` biasa) — trafik
ini di-DNAT di chain `PREROUTING` SEBELUM sempat diperiksa `ufw` di chain `INPUT`, jadi
`ufw` sama sekali tidak pernah "melihat" trafik ini.** Ini BEDA dari `validator1/2/3`,
`gateway`, dll. yang semua pakai `network_mode: host` (makanya `ufw` bekerja normal untuk
port-port itu) — `netstats` satu-satunya service di topologi ini yang masih pakai bridge
network + port publish biasa.

**Fix yang benar**: tambah rule ke chain `DOCKER-USER` (satu-satunya chain yang dijamin
Docker akan diperiksa untuk trafik container) — `ACCEPT` dari IP Host B ke IP internal
container:3000, lalu `DROP` untuk sumber lain ke tujuan yang sama. Chain ini di-reset
kosong oleh `dockerd` setiap kali restart, jadi dibuatkan systemd service
(`netstats-firewall-restrict.service`, script di
`/usr/local/sbin/netstats-firewall-restrict.sh` di Host A) yang jalan otomatis setelah
`docker.service` start, idempotent (aman dijalankan berulang), dengan retry 60 detik
kalau container netstats belum sempat naik saat service ini jalan (menghindari race
condition saat boot). Diverifikasi 2 arah: dari Host B bisa akses (benar), dari luar/IP
manapun lain tetap diblokir (benar) — dan `validator3` dikonfirmasi berhasil connect
stabil ke ethstats tanpa siklus reconnect.

**Pelajaran**: `ufw` TIDAK CUKUP untuk mengamankan port yang di-publish container lewat
bridge network biasa — kalau butuh restriksi per-IP untuk port semacam itu, harus lewat
`DOCKER-USER` iptables chain langsung, bukan `ufw`. Ini beda dari pelajaran-pelajaran
sebelumnya di migrasi ini (AWS Security Group vs `ufw`) — ini lapisan ketiga yang perlu
diperhatikan khusus untuk container non-host-network.

### Firewall final setelah Fase 2 (sudah termasuk fix netstats di atas)

| Arah | Port | Kenapa |
|---|---|---|
| Host B → Host A | `5797`, `5798` TCP | (dari Fase 1) Gateway → RPC Besu |
| Host B → Host A | `30303`, `30304` TCP+UDP | validator3 → P2P validator1/validator2 |
| Host B → Host A | `3001` TCP | validator3 → netstats (lewat `DOCKER-USER` chain, bukan `ufw`) |
| Host A → Host B | `4000-4002` TCP | (dari Fase 1) Caddy → gateway/dashboard |
| Host A → Host B | `30305` TCP+UDP | validator1/validator2 → P2P validator3 |

Semua terhubung — tidak ada item non-kritis yang tersisa dari Fase 2.

## 2026-09-14 — Rename domain: `tesnet.haratoken.app` → `mampang.haratoken.app`

Permintaan user, berlaku juga untuk produksi (`live.haratoken.app` → `registry.haratoken.app`,
lihat `mainnet_production/STATUS_TERDEPLOY_2026-08-20.md`). Cutover total
(bukan jalan paralel) — domain lama sengaja dimatikan total, bukan sekadar redirect.

**Proses (aman, tanpa downtime nyata)**:
1. Semua config (`Caddyfile` di Host A, `.env` gateway di Host B) diubah & divalidasi
   sintaksnya lebih dulu TANPA di-apply — domain lama tetap 100% jalan normal selama tahap
   ini (dikonfirmasi berkali-kali).
2. Tim infra tambah 9 DNS A record baru (5 `registry`, 4 `mampang`) — dikonfirmasi resolve
   dengan benar via `cloudflare-dns.com` sebelum lanjut (resolver `dns.google` sempat
   timeout dari mesin kerja, ternyata cuma masalah jaringan lokal, bukan DNS-nya).
3. Baru setelah DNS dikonfirmasi benar: `caddy reload` di Host A + restart
   `gateway`/`dashboard` di Host B untuk pick up `.env` baru (`NEXT_PUBLIC_GATEWAY_HTTP_URL`
   dkk.) — dilakukan berurutan, tiap domain langsung dites begitu selesai.
4. Diverifikasi fungsional penuh (bukan cuma status code): `eth_blockNumber` asli via RPC,
   WS upgrade (`HTTP 101`), dashboard, faucet, explorer — semua di domain BARU. Domain LAMA
   dikonfirmasi mati total (`HTTP 000`, TLS gagal — sesuai desain cutover, bukan bug).

**Hasil**: `rpc`/`dashboard`/`netstats`/`explorer.mampang.haratoken.app` semua live.
Domain lama `*.tesnet.haratoken.app` sepenuhnya nonaktif. Semua dokumentasi (README,
ARCHITECTURE, CREDENTIALS, dan release doc tim) sudah diperbarui ke nama baru.

## 2026-09-15 — OOM validator2/validator3 (interim fix) + explorer 404/tanpa-styling

**1. OOM ledger nyata**: `validator2` (Host A) dan `validator3` (Host B) sama-sama
di-OOM-kill kernel pada 2026-09-14 (beda ~1 jam) — `mem_limit` 850MB kelewat kecil
dibanding pertumbuhan state chain. Auto-restart berhasil, block production tidak sampai
macet, tapi keduanya balik ke ~90% pemakaian dalam sehari. Interim fix (bukan solusi
permanen — resize VM ditunda, lihat pembahasan dengan user): `mem_limit`/`memswap_limit`
validator2 `850m→1050m`, validator3 `850m→1200m` (headroom dari RAM host yang masih
available, dicek dulu via `free -h` sebelum diubah, bukan angka sembarang). Diverifikasi:
pemakaian turun ke 52%/43%, block production tetap presisi 5 detik/blok sebelum-selama-
sesudah restart.

**2. Explorer testnet 404 lalu tanpa-styling — 2 bug berurutan di rule Caddy yang sama**

Dilaporkan user (dari feedback temannya): "explorer mati" lalu setelah fix pertama
"tampilannya gak ada styling". Root cause `rewrite * /explorer{uri}` di
`explorer.mampang.haratoken.app` (site block sudah ada sejak awal, ikut dipindah saat
rename ke `mampang` tanggal 14 tapi bug-nya sendiri sudah ada dari awal, baru ketahuan
sekarang):

- **Bug #1 (404)**: `rewrite` di Caddy re-fire di SETIAP request baru, termasuk request
  hasil redirect balik dari app sendiri. App Next.js redirect trailing-slash
  (`/explorer/` → `/explorer`, 308) — client re-request `/explorer` ke domain yang sama,
  Caddy rewrite lagi jadi `/explorer/explorer` → 404. Fix: matcher `@notExplorer { not
  path /explorer* }`, cuma rewrite kalau path BELUM `/explorer*`.
- **Bug #2 (tanpa styling)**: setelah bug #1 fix, HTML akhirnya render, tapi CSS/JS-nya
  404 semua. App ini tidak set `basePath: '/explorer'` di Next.js config-nya, jadi bundle
  JS/CSS-nya direferensikan absolut di root (`/_next/static/...`), bukan
  `/explorer/_next/static/...`. Matcher #1 tidak mengecualikan `/_next*`, jadi ikut kena
  rewrite → 404 juga. Fix: matcher jadi `not path /explorer* /_next*`.

Kedua fix diterapkan via `docker restart hara-tesnet-caddy` (bukan cuma `reload` — pola
gotcha yang sama seperti insiden rename domain, `reload` tidak selalu ke-apply, restart
selalu aman). Diverifikasi fungsional penuh: halaman utama 200 + judul benar, CSS/JS
individual dicek satu-satu (200), link internal ke `/explorer/block/<n>` jalan.

**3. Redundansi RPC gateway — hilangkan single point of failure**

Sebelumnya gateway cuma diarahkan ke SATU backend (`validator1`) — `rpc1` yang dulu
didokumentasikan sebagai node RPC terpisah ternyata sudah tidak dijalankan lagi, jadi ini
genuinely 1 titik gagal: `validator1` restart/OOM = gateway 502 ke semua user.

Fix: aktifkan RPC juga di `validator3` (`config.toml`, host-only `127.0.0.1` — meski Besu
ternyata bind ke `0.0.0.0` di levelnya sendiri, lihat catatan di bawah) sebagai backend
kedua, plus modul baru `gateway/gateway/src/proxy/rpcHealth.ts`: polling `eth_blockNumber`
ke primary tiap 5 detik, 2 kegagalan berturut-turut (~10s) baru failover ke secondary, 2
keberhasilan berturut-turut baru balik ke primary (anti-flapping). `httpProxy.ts` diubah
dari `target` statis ke pola `router` (persis pola yang sudah dipakai di
`mainnet_production`'s `httpProxy.ts`). WS (`wsProxy.ts`) SENGAJA tidak
ikut failover — koneksi WS stateful/long-lived, tidak bisa dipindah tengah jalan; klien WS
akan reconnect sendiri seperti biasa kalau primary restart, tidak berubah dari sebelumnya.

Dua gotcha yang ketemu pas implementasi:
- `docker compose up -d` setelah HANYA mengubah file `config.toml` yang di-mount (bukan
  `docker-compose.yml` itu sendiri) adalah **no-op** — compose tidak mendeteksi perubahan
  butuh recreate, container lama jalan terus dengan config LAMA. Harus `docker restart`
  eksplisit supaya Besu benar-benar re-read file config-nya.
- Besu ternyata bind RPC-nya ke `0.0.0.0` walau `config.toml` diset `rpc-http-host="127.0.0.1"`
  (log `RPC HTTP JSON-RPC config` menunjukkan `host=0.0.0.0` meski TOML jelas `127.0.0.1`) —
  belum diketahui kenapa persis (kemungkinan `profile="ENTERPRISE"` override, belum
  diverifikasi ke source Besu). Karena Host B pakai `network_mode: host`, `ufw` (beda dengan
  kasus netstats yang bridge-networked) BISA dan MEMANG memfilter port ini dengan benar —
  dikonfirmasi via default-deny policy + tes eksternal langsung dari luar (`HTTP 000`,
  benar-benar tidak tercapai). Tambahan: gateway container (bridge network `gateway_net`,
  subnet `172.18.0.0/16`) awalnya JUGA ikut ke-block oleh `ufw` default-deny saat mencoba
  akses `host.docker.internal:5797` dari dalam container — perlu rule eksplisit `ufw allow
  from 172.18.0.0/16 to any port 5797/5798` supaya jalur internal gateway→validator3 tetap
  bisa, sambil akses publik dari internet tetap ketutup.

**Diverifikasi live end-to-end** (bukan cuma unit test): `docker stop
hara-tesnet-validator1` sungguhan → gateway log mencatat failover ke secondary dalam ~10
detik → request `eth_blockNumber` lewat domain publik tetap `HTTP 200` (bukan 502) selama
validator1 mati → `docker start` validator1 → gateway log mencatat fail-back ke primary
begitu 2 health-check berturut sukses → block production lanjut normal ~5 detik/blok.

## 2026-09-16 — Stress test menyeluruh: `rpc-http-max-active-connections` kekecilan

User minta stress test nyata (bukan cuma spot-check) untuk memastikan write/call tidak
sering OOM/timeout di kondisi beban tinggi. Dibangun tool load-test kecil (`ethers` +
`fetch` mentah, bukan library testing berat) yang mengirim burst read-query
(`eth_blockNumber`/`eth_getBalance`/dll.) dan write (`eth_sendRawTransaction`, wallet
sekali-pakai, transfer 0 value — chain gas-free jadi tidak perlu funding) ke gateway lewat
domain publik asli, sambil memantau `docker stats` langsung di server.

**Ditemukan bug nyata**: pada concurrency 100, 392 dari 8000 request read gagal `HTTP 502`
("Upstream RPC connection error"). Root cause dari log `validator1` sendiri: `Rejecting new
connection... Max 50 active connections limit reached` — `rpc-http-max-active-connections`
masih di default Besu yang rendah (50), padahal validator1 sekarang jadi backend RPC publik
utama (bukan cuma validator konsensus). **Bukan masalah memori** — `docker stats` selama
tes menunjukkan memori flat (38-56%) sepanjang waktu, murni connection-limit habis.

**Fix**: `rpc-http-max-active-connections` dinaikkan `50→250` (validator1), `50→200`
(validator3, karena sekarang juga jadi failover target), plus `rpc-ws-max-active-connections`
`25→100`/`80`. Diterapkan via `docker restart` (config-file butuh restart penuh, `docker
compose up -d` tanpa perubahan compose file adalah no-op — gotcha yang sama seperti insiden
RPC failover di atas). **Diverifikasi**: ulang tes identik di concurrency 100 → 8000/8000
sukses. Didorong lebih jauh ke concurrency 200 → 10.000/10.000 sukses juga (memori tetap
flat; sisa keterbatasan di titik ini murni throughput/antrian — latency naik tapi tidak ada
lagi request gagal, ini perilaku degradasi yang wajar).

**Chaos test** (`docker stop validator1` di tengah beban tulis 450 tx): ~70 tx gagal di ~10
detik pertama (sesuai desain — `rpcHealth.ts` butuh 2 kegagalan berturut ~10 detik sebelum
failover, supaya tidak flapping), sisanya sukses, failover & fail-back tercatat benar di
log, txpool bersih setelahnya.

## 2026-09-18 — Sinkronisasi referensi usang + link Netstats di dashboard

User memeriksa langsung testnet/mainnet dan menemukan referensi yang masih mengarah ke
komponen yang sudah mati/pindah. Investigasi (agent Explore) menemukan bahwa working
directory utama (`dev/v3-cloud-testnet`, tempat tim benar-benar bekerja sehari-hari) tidak
pernah disinkronkan dengan perbaikan yang sudah dikerjakan di branch ini (`testnet-final`)
tanggal 2026-09-16 — sudah disinkronkan balik terpisah. Di branch ini sendiri, hal-hal di
bawah ini adalah temuan yang genuinely baru (belum pernah diperbaiki di mana pun
sebelumnya, termasuk saat branch ini pertama dirapikan 2026-09-16):

- `scripts/health_check.sh` — seluruh script salah label, mengecek node bernama `rpc1`
  padahal yang jalan `validator1` (RPC digabung ke situ 2026-08-28); juga tidak
  topology-aware pasca load-splitting 2026-09-10 (`validator3` di Host B tidak akan ikut
  tercek). Diperbaiki + ditambah catatan multi-host, pola sama seperti fix
  `cleanup_quarterly_reset.sh` sebelumnya.
- `docs/DOMAIN_AND_PORTS.md` dan `docs/GATEWAY_FEATURES.md` — keduanya masih bilang
  `explorer.mampang.haratoken.app` "belum aktif, butuh DNS record ke-4" — SUDAH TIDAK
  BENAR sejak 2026-09-15. Diperbaiki jadi "live sejak 2026-09-15".
- `docs/CLEANUP_POLICY.md` — 1 baris contoh backup manual masih menyebut `rpc1` dalam
  daftar node yang di-loop (terlewat saat perbaikan file ini sebelumnya). Diperbaiki.

**Konsolidasi dashboard**: ditambah 1 link "Netstats ↗" di nav dashboard
(`gateway/dashboard/src/app/layout.tsx`), menuju subdomain terpisah yang sudah ada
(bukan konsolidasi path — lihat `mainnet_production/docs/STATUS_TERDEPLOY_2026-08-20.md`
§21 untuk kenapa netstats belum aman dikonsolidasi lewat reverse-proxy path tanpa tes live
dulu; sudah dicatat di `BACKLOG.md` sebagai follow-up).

## 2026-09-21 — Hardening `db.ts` pool timeout (defense-in-depth, dipicu insiden mainnet)

Investigasi laporan "transaksi pending" di mainnet menemukan bug terpisah: gateway
`usage/recorder.ts` mainnet tidak punya guard re-entrancy di `flush()`, menyebabkan dua
flush overlap race pada baris upsert yang sama → deadlock Postgres (`40P01`) →
`db.ts` mainnet tidak punya timeout apa pun sehingga koneksi yang macet tertahan
selamanya → seluruh pool Postgres habis total dan `rpc_activity_log` berhenti mencatat
5+ hari tanpa satu pun error ter-log (detail lengkap di
`mainnet_production/docs/STATUS_TERDEPLOY_2026-08-20.md` §22).

Testnet's `usage/recorder.ts` **sudah** punya guard `isFlushing` ini sejak sebelumnya
(itulah yang jadi rujukan perbaikan mainnet) — jadi testnet tidak pernah kena bug yang
sama persis. Tapi `db.ts` testnet **juga** tidak punya timeout, jadi tetap rentan ke
penyebab hang lain di luar bug spesifik ini. Ditambahkan sebagai pencegahan:
`statement_timeout: 15000`, `query_timeout: 20000`, `connectionTimeoutMillis: 10000`,
`idleTimeoutMillis: 30000` — sekarang query yang macet apa pun sebabnya akan error dalam
waktu terbatas alih-alih menahan slot pool selamanya.

Rebuild + redeploy `hara-tesnet-gateway` (Host B), diverifikasi via
`https://rpc.mampang.haratoken.app/v1/public` — tetap jalan normal, tidak ada regresi.

## 2026-09-22 — Insiden: Block Time Nyangkut 15-64 Detik — Root Cause `validator2` Stuck Sync Loop + OOM Ketiga Validator

**Trigger**: laporan user "sering pending lama blocktimenya" dan "tadi tidak mining sampai
40-50 detik". Diverifikasi langsung: sampel 30 block terakhir menunjukkan pola tidak
stabil — alternating 5 detik / 15 detik, plus outlier 64 detik — padahal genesis
`blockperiodseconds=5`.

**Root cause ganda, ditemukan lewat investigasi bertahap**:

1. **OOM berulang di ketiga validator**: `dmesg` mengonfirmasi kernel OOM-kill proses
   `java` (Besu) tepat jam 06:33:40 UTC hari ini, persis 6 detik sebelum log round-change
   QBFT. `RestartCount` per container: validator1=7, validator2=9, validator3=7 — semua
   sejak 2026-09-19. Ini kelanjutan langsung insiden OOM 15 September: `mem_limit` yang
   dinaikkan waktu itu (interim fix, sudah diperingatkan "mengurangi frekuensi, bukan
   menghilangkan risiko") sekarang kesempitan lagi karena state chain terus tumbuh.
2. **`validator2` stuck permanen di sync loop — akar masalah SEBENARNYA, ditemukan
   setelah OOM diperbaiki tapi pola block time tidak hilang**: log menunjukkan
   `validator2` terjebak loop cepat "Unable to retrieve blocks for block numbers: 282440
   to 282590" — tertinggal **11.000+ block** dari chain tip (~293.700), gagal setiap kali
   dicoba ulang. Penyebab: `sync-mode="SNAP"` di config-nya, padahal `validator1`/
   `validator3` (peer-nya) tidak menyediakan layanan SNAP server ("SNAP Sync server
   disabled" di log mereka sendiri) — persis pola yang sudah pernah didiagnosis di
   mainnet ("SNAP Server = Root Cause"). Akibatnya `BftMiningCoordinator` di `validator2`
   terus start/stop tiap gagal sync, membuatnya TIDAK PERNAH stabil ikut proposing.
   Dikonfirmasi via sampel 20 block: `validator2` (`0x31ad5f...`) tidak muncul SAMA
   SEKALI sebagai `miner` — hanya validator1/3 bergantian. Ini yang bikin tiap giliran
   propose validator2 di round-robin QBFT harus menunggu timeout round-change dulu
   sebelum lanjut ke validator berikutnya → pola 15 detik berulang; ketika ditambah OOM
   di validator lain secara bersamaan → outlier 40-64 detik.

**Fix, diterapkan live + disinkronkan ke source 2026-09-22**:

- `mem_limit`/`memswap_limit` dinaikkan lagi (masih interim, masih pakai RAM nganggur
  Host A/B, TANPA resize VM): validator1 1300m→**1650m**, validator2 1050m→**1400m**,
  validator3 1200m→**1600m**.
- `validator2/config/config.toml`: `sync-mode` diubah `SNAP`→**`FULL`**. Besu menolak
  kombinasi `sync-mode=FULL` + `bonsai-limit-trie-logs-enabled=true` ("Cannot enable
  --bonsai-limit-trie-logs-enabled with --sync-mode=FULL"), jadi trie-log-limit ikut
  dimatikan (`bonsai-limit-trie-logs-enabled=false`) — aman untuk `validator2` karena
  disk Host A masih 32GB available dari 48GB (`validator2/data` cuma ~1.3GB), dan reset
  kuartalan (`CLEANUP_POLICY.md`) tetap membersihkannya tiap 3 bulan. FULL sync tidak
  butuh dukungan SNAP dari peer sama sekali, cuma download+eksekusi block biasa lewat p2p
  — untuk chain testnet sekecil ini, langsung catch-up dalam hitungan detik begitu
  diterapkan.
- **Diverifikasi**: 15 block berturut-turut setelah fix, semua tepat 5 detik, ketiga
  validator (`0x4bbab2e3...`, `0x385c97cf...`, `0x31ad5f87...`) bergiliran normal
  round-robin — tidak ada lagi yang absen.

**Kenapa ini belum ketahuan lebih awal**: tidak ada monitoring aktif untuk "block time
melebihi X detik" atau "validator tidak pernah muncul sebagai miner" — cuma ketahuan
lewat laporan user. Dicatat sebagai gap monitoring di `BACKLOG.md`.

**Cek silang ke mainnet**: kombinasi config yang sama (`sync-mode=SNAP` +
`bonsai-limit-trie-logs-enabled=true` dengan peer yang tidak serve SNAP) berisiko
memicu insiden identik di sana — dicek terpisah, lihat
`mainnet_production/docs/STATUS_TERDEPLOY_2026-08-20.md`.

**Pencegahan — watchdog block-production health (`scripts/hara-block-health-watch.sh`,
baru)**: dipasang sebagai systemd timer (tiap 5 menit, pola sama seperti
`hara-mem-watch`) di Host A, mengecek 2 hal lewat RPC lokal `validator1`
(`http://127.0.0.1:5797`): (1) apakah ketiga address validator memang muncul sebagai
`miner` dalam 20 block terakhir, (2) apakah rata-rata block time 20 block terakhir masih
di bawah 2x `blockperiodseconds` (10 detik). Log-only ke `/var/log/hara-block-health-watch.log`
di server, tidak ada infra alerting baru. Dipilih untuk mengecek RPC **lokal langsung**,
BUKAN lewat gateway/`v1/public` — saat testing sempat dapat false-positive karena gateway
yang failover antar backend kadang balas `null` untuk query persis di block tip (bukan
bug watchdog-nya, tapi race kondisi propagasi gossip antar node lewat gateway). Sengaja
tidak dipasang di ketiga validator sekaligus (cukup satu titik pantau untuk kesehatan
chain-wide, bukan per-host seperti mem-watch). Dipasang juga di mainnet (validator1) —
lihat `mainnet_production/docs/STATUS_TERDEPLOY_2026-08-20.md`.

## 2026-09-28 — Deploy `cleanup_quarterly_reset.sh` Host B Coordination (sebelumnya cuma edit lokal)

Koordinasi Host A↔Host B untuk `scripts/cleanup_quarterly_reset.sh` (ditulis sebelumnya,
lihat komentar header script) ternyata **belum pernah benar-benar di-deploy ke Host A** —
cuma tersimpan di repo lokal. Ketahuan lewat pengecekan kondisi rutin, dengan jadwal
reset kuartal berikutnya (cron `0 3 1 1,4,7,10 *` → **1 Oktober 2026, 03:00 UTC**) tinggal
kurang dari 3 hari lagi.

Di-deploy sekarang: `scp` ke `~/tesnet_server/scripts/cleanup_quarterly_reset.sh` di Host
A, `bash -n` untuk cek syntax (valid), dan pre-flight check (`ssh` ke Host B pakai key
otomasi, phase `status`) diuji langsung — berhasil, Host B terjangkau dan merespons block
number asli. Forced-command restriction key otomasi juga diverifikasi ulang masih benar
(command sembarang tetap ditolak). Script FULL (stop/wipe/start sungguhan) **TIDAK
dijalankan sebagai bagian dari verifikasi ini** — sifatnya destruktif, jadi cukup
diverifikasi lewat syntax check + pre-flight connectivity saja; eksekusi sungguhan akan
terjadi otomatis lewat cron 1 Oktober.
