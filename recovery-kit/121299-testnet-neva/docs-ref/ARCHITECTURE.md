# Testnet — Arsitektur Saat Ini (2026-09-11)

Sejak 2026-09-10, testnet berjalan di **2 server fisik** (sebelumnya 1) — beban dibagi
dalam 2 fase: Fase 1 (gateway+dashboard+DB pindah ke Host B) dan Fase 2 (`validator3`
pindah ke Host B). Detail proses migrasi & alasan tiap keputusan: `docs/CHANGELOG.md`.

## ✅ Isu kritis pra-existing — DIPERBAIKI 2026-09-11

`validator1` sempat menandatangani blok dengan key yang alamatnya tidak cocok dengan yang
tertanam di `extraData` genesis (bug lama sejak setup awal, ditemukan saat migrasi Fase 2 —
inilah penyebab downtime ~37 menit saat itu). Sudah diperbaiki lewat QBFT live validator
vote (tanpa downtime, tanpa reset chain) — validator set sekarang berisi 3 alamat yang
benar semua, dikonfirmasi round-robin proposer bergilir sempurna ke ketiganya. Detail
proses lengkap: `docs/CHANGELOG.md` bagian "Insiden #3 (KRITIS)" dan update 2026-09-11.

## Diagram

```
                              Internet (pengguna)
                                      │
                                      │ HTTPS (443)
                                      ▼
┌───────────────────────────────────────────────────────────────────────┐
│ HOST A — AWS EC2 ap-southeast-1 (<TESTNET_HOSTA_IP>)  "server lama"        │
│ 2 vCPU / 4GB RAM / 50GB disk                                          │
│                                                                        │
│   ┌────────┐        ┌────────────────────────────────────┐           │
│   │ Caddy  │───443──▶ rpc / dashboard / explorer          │──┐        │
│   │ (TLS)  │        │ *.mampang.haratoken.app               │  │        │
│   └───┬────┘        └────────────────────────────────────┘  │        │
│       │ netstats.mampang.haratoken.app (lokal, tidak pindah)   │        │
│       ▼                                                        │        │
│   ┌─────────┐                                                  │        │
│   │netstats │◀╌╌╌╌ (validator3 lapor ke sini lewat port 3001,   │        │
│   └─────────┘       dibatasi DOCKER-USER chain ke IP Host B)     │        │
│                                                                  │        │
│   ┌────────────┐  P2P (30303/30304)  ┌────────────┐            │        │
│   │ validator1 │◀───────────────────▶│ validator2 │            │        │
│   │ + RPC      │                     │            │            │        │
│   │ (5797/5798)│                     │            │            │        │
│   └─────┬──────┘                    └─────┬──────┘             │        │
│         │                                  │                    │        │
└─────────┼──────────────────────────────────┼────────────────────┼────────┘
          │ P2P 30303/30304 ke Host B        │ P2P 30303/30304 ke Host B
          │ RPC 5797/5798 ke Host B          │
          ▼                                  ▼
┌───────────────────────────────────────────────────────────────────────┐
│ HOST B — NevaCloud (<TESTNET_HOSTB_IP>)  "server baru"                    │
│ 3 vCPU / 3.8GB RAM                                                     │
│                                                                        │
│   ┌────────────┐ P2P 30305 ke Host A                                 │
│   │ validator3 │──────────────────────▶ (ke validator1 & validator2) │
│   └────────────┘                                                      │
│                                                                        │
│   ┌─────────┐   ┌───────────┐   ┌──────────┐   ┌───────┐             │
│   │ gateway │──▶│ dashboard │   │ postgres │   │ redis │             │
│   │ :4000/  │   │ :4002     │   │ (users,  │   │(rate  │             │
│   │ :4001   │   │           │   │ api_keys,│   │limit) │             │
│   └─────────┘   └───────────┘   │ faucet,  │   └───────┘             │
│                                  │ activity)│                         │
│                                  └──────────┘                         │
└───────────────────────────────────────────────────────────────────────┘
```

## Kenapa dibagi begini (bukan cara lain)

- **Caddy TETAP di Host A, bukan ikut pindah**: DNS (`*.mampang.haratoken.app`) sudah
  menunjuk ke IP Host A. Dengan Caddy tetap di situ dan cuma reverse-proxy ke Host B, TIDAK
  ADA perubahan DNS yang dibutuhkan.
- **`netstats` TIDAK ikut pindah**: ringan, dan butuh koneksi WS langsung dari tiap node
  Besu — lebih murah dibiarkan lokal. `validator3` (Host B) tetap bisa lapor ke sini lewat
  port 3001 yang dibuka khusus untuk IP Host B (lihat bagian firewall di bawah — perlu
  penanganan khusus lewat `DOCKER-USER` chain, `ufw` saja tidak cukup untuk container ini).
- **`validator3` dipilih sebagai kandidat pindah (bukan validator1/2)**: satu-satunya yang
  tidak merangkap RPC, sehingga pemindahannya tidak menyentuh jalur RPC publik sama sekali.

## Firewall (2 lapis: cloud + OS — lihat `docs/CHANGELOG.md` untuk kronologi penemuannya)

| Arah | Port | Kenapa |
|---|---|---|
| Host B → Host A | `5797`, `5798` TCP | Gateway di Host B baca/tulis RPC ke Besu di Host A |
| Host B → Host A | `30303`, `30304` TCP+UDP | `validator3` (Host B) → P2P `validator1`/`validator2` |
| Host A → Host B | `4000`, `4001`, `4002` TCP | Caddy di Host A reverse-proxy ke gateway/dashboard di Host B |
| Host A → Host B | `30305` TCP+UDP | `validator1`/`validator2` → P2P `validator3` (Host B) |
| Host B → Host A | `3001` TCP | `validator3` (Host B) lapor ke netstats di Host A |

Semua dibatasi HANYA dari/ke IP satu sama lain (bukan dibuka ke publik) — di level `ufw` di
kedua host, DAN di level **AWS Security Group** untuk Host A (lapisan cloud, terpisah dari
`ufw`, harus dibuka manual di console — port P2P dan RPC di Host A ternyata TIDAK PERNAH
diuji untuk trafik eksternal asli sebelum migrasi ini, karena semua node dulunya co-located
dan komunikasi selalu lewat loopback).

**Kasus khusus port `3001` (netstats)**: berbeda dari semua service lain di atas (yang
semua pakai `network_mode: host`), `netstats` pakai bridge network + port publish biasa —
`ufw` TIDAK BISA membatasi ini sama sekali (Docker men-DNAT trafik SEBELUM `ufw` sempat
memeriksanya). Restriksinya harus lewat chain `DOCKER-USER` langsung, dijaga tetap ada
lewat systemd service `netstats-firewall-restrict.service` di Host A (chain ini di-reset
kosong oleh `dockerd` tiap restart). Detail lengkap: `docs/CHANGELOG.md`.

## Yang masih perlu dikerjakan

Tidak ada item terbuka untuk topologi ini saat ini — lihat `docs/CHANGELOG.md` untuk
riwayat lengkap kalau butuh konteks historis.
