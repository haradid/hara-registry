# HARA Mainnet — chainId 121212

Dokumentasi jaringan mainnet HARA yang live. QBFT, 7 validator, 10 host di 3 cloud
provider (AWS/Azure/NevaCloud), 4-pool RPC di belakang HAProxy, API Gateway + Dashboard.
Status per 2026-09-16 — lihat `docs/ARCHITECTURE.md` untuk topologi terkini, atau
`docs/STATUS_TERDEPLOY_2026-08-20.md` untuk riwayat kronologis lengkap (§1-§20).

## Isi Folder

| File/Folder | Isi |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Topologi & desain SAAT INI — mulai baca di sini |
| [`docs/STATUS_TERDEPLOY_2026-08-20.md`](docs/STATUS_TERDEPLOY_2026-08-20.md) | Riwayat kronologis lengkap, semua insiden & keputusan desain sejak 2026-08-20 |
| [`QA/STRESS_TEST_RESULTS.md`](QA/STRESS_TEST_RESULTS.md) | Hasil seluruh putaran QA/stress test |
| [`BACKLOG.md`](BACKLOG.md) | Item yang belum diselesaikan / sengaja ditunda |
| [`gateway/`](gateway/) | Source code API Gateway + Dashboard (Express + Next.js), lihat [`gateway/README.md`](gateway/README.md) |
| [`config/genesis.json`](config/genesis.json) | Genesis chain live (chainId 121212, 7 validator di extraData) |
| [`config/static-nodes.json`](config/static-nodes.json) | Enode P2P |
| [`access/`](access/) | Kredensial SSH + gateway + key blockchain (**tidak di-commit ke git**, diproteksi `.gitignore`) |

## Ringkasan Cepat

| Item | Value |
|---|---|
| Chain ID | `121212` |
| Consensus | QBFT, 7 validator |
| Block time | ~5 detik |
| Gas | Gratis |
| Host | 10 (5 asli + 5 hasil migrasi 2026-09-15 — lihat `docs/ARCHITECTURE.md`) |

Detail lengkap topologi, RPC layer, dan perbedaan dari testnet: `docs/ARCHITECTURE.md`.

## Isi Folder `access/` (Lokal Saja, Tidak di Git)

| File | Isi |
|---|---|
| `env-hara-registry.md` | Kredensial SSH IP/user/port/key/password untuk semua host (5 asli + 5 hasil migrasi) |
| `access_cloud/` | Key SSH host asli: `validator-1-new-aws.pem`, `Validator-2-new_key.pem`, `archive-new-aws.pem` (aktif) + `archive-old-neva-DEAD.key` (host dimusnahkan permanen, referensi saja) |
| `ideal_network_keys/` | Key SSH untuk 5 host hasil migrasi 2026-09-15 |
| `ideal-network-topology-notes.txt` | Cross-check topologi 5 host baru (1 baris ditandai belum terkonfirmasi — lihat isinya) |
| `KEYS_AND_CUSTODY.md` | Lokasi private key node validator (path saja) + status key akun alloc genesis |
| `credentials_private_key.txt` | Private key + seed phrase ketujuh validator — **konsensus, JANGAN pernah dipakai untuk tx non-konsensus** |
| `GATEWAY_CREDENTIALS.md` | Password Postgres, JWT secret, admin dashboard, API key test, URL endpoint gateway |

## Yang Masih Perlu Ditindaklanjuti

Lihat `BACKLOG.md` untuk daftar lengkap dan status masing-masing.
