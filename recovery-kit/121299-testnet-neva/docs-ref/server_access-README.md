# server_access/ — SSH access material (gitignored, kosong di git)

Folder ini di server LIVE berisi kredensial SSH nyata (private key, `access.txt` dengan
IP/user/port/password) untuk kedua host testnet. Seluruh isinya sengaja **tidak pernah
di-commit** (`.gitignore`: `tesnet_server/server_access/*`) — folder ini hanya ada di git
sebagai placeholder struktur (`.gitkeep`), supaya jelas ke mana file akses per-host
seharusnya diletakkan.

## Yang seharusnya ada di sini (di server/mesin kerja lokal, bukan di git)

- `access.txt` — hasil isi dari template `../access.txt.example` (root `tesnet_server/`)
- Private key SSH per host (format `.pem` atau `openssh` biasa, tanpa ekstensi `.pem`
  akan tetap ter-gitignore lewat rule folder ini, bukan lewat pattern nama file)
- `server_additional.txt` atau sejenisnya — catatan password/port tambahan kalau host
  tertentu pakai auth password, bukan key (lihat pola Host B testnet saat ini)

## Topologi saat ini (2 host, lihat `../docs/ARCHITECTURE.md`)

| Host | Peran | Auth |
|---|---|---|
| Host A | validator1 + validator2 + netstats + caddy | SSH key, port custom (bukan 22 default) |
| Host B | validator3 + gateway + dashboard + postgres + redis | SSH key + password fallback |

Isi templatenya di `../access.txt.example` dan `../CREDENTIALS.txt.example` — copy jadi
`access.txt`/`CREDENTIALS.txt` di folder ini (atau di root, sesuai kebiasaan tim), isi
manual, JANGAN commit hasilnya.
