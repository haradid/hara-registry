# 131216 ledger — backups and restore

Producers are systemd timers installed by `deploy/ops/install-backup-timers.sh`; every object is
`age`-encrypted to the recipient in `backup.env` (E3) and shipped with rclone to the
`BACKUP_S3_REMOTE` remote (was `nevacloud-s3`). The private key exists **only** on the operator
laptop (`~/.config/age/hara-backups.txt`, E2).

## Stores

| Store | Bucket | Producer script | Cadence (UTC, from the timer installer) | Runs on |
|---|---|---|---|---|
| Postgres logical dump | `hara-backups-postgres` | `deploy/ops/snapshot-postgres.sh` | 02:00 daily | hara-stateful |
| Postgres base backup | `hara-backups-postgres-base` | `deploy/ops/snapshot-postgres-basebackup.sh` | 01:30 daily | hara-stateful |
| Postgres WAL | `hara-backups-postgres-wal` | `deploy/ops/snapshot-postgres-wal.sh` | every 10 min | hara-stateful |
| Redis | `hara-backups-redis` | `deploy/ops/snapshot-redis.sh` | 02:30 daily | hara-stateful |
| MinIO | `hara-backups-minio` | `deploy/ops/snapshot-minio.sh` | 02:45 daily | hara-stateful |
| Validator chain data | `hara-backups-validator` | `deploy/ops/snapshot-validator.sh` | 03:00 + 15 min × validator index (03:00, 03:15, 03:30, 03:45) — one validator stopped at a time | hara-v1..v4 |
| Vault Raft snapshot | `hara-backups-vault` | `deploy/ops/vault-raft-snapshot.sh` | 04:00 daily | hara-stateful |
| Restore drill | — | `pitr-restore-drill.sh`; `snapshot-restore-drill.sh`; `s3-readback-check.sh` | Sunday 05:00 | hara-stateful |

Retention: WAL 14 days, base backups 21 days (`PG_BASE_REMOTE_KEEP_DAYS`), so a base always
exists inside the WAL window. Recovery point objective with WAL shipping: ≤ 5 minutes.

## Restore recipes

Every recipe follows `deploy/ops/RECOVERY.md`; the decrypt pattern is always
`age -d -i ~/.config/age/hara-backups.txt <object>`.

| Store | Recipe (section of `deploy/ops/RECOVERY.md`) | Notes |
|---|---|---|
| Postgres, one database, fast | "Postgres — single database, fast (logical dump)" | `rclone copy` the latest dump, `age -d`, `psql` into the new instance |
| Postgres point-in-time | "Postgres — point-in-time recovery (PITR)" | base backup + WAL replay to a target time; `deploy/ops/standby-bootstrap.sh` builds a standby the same way |
| Redis | "Redis" | RDB file into the volume before start |
| MinIO | "MinIO" | mirror the bucket dump back |
| Vault | "Vault Raft" | `vault operator raft snapshot restore` on an **initialised and unsealed** Vault — needs the E5 unseal keys |
| Validator data | "Validator chain data" | restore the archive into the Besu data volume **with the matching node key from Vault**; or let the node resync from peers |

Drills: `deploy/ops/snapshot-restore-drill.sh` (logical dump), `deploy/ops/pitr-restore-drill.sh`
(PITR), `deploy/ops/validator-snapshot-restore-drill.sh`, `deploy/ops/s3-readback-check.sh`.
Run all four after the first successful backup cycle on the new hosts.

## Known blocker — Nevacloud S3 `GetObject 403`

The S3 credential used for backups is **write-only**: `s3-readback-check.sh` fails with
`GetObject 403`, so nothing has ever proven the objects can be read back. Consequences:

- Do **not** destroy hara-stateful until a read-capable credential exists and
  `s3-readback-check.sh` exits 0 (E17).
- If Nevacloud Object Storage is also being left, `rclone sync nevacloud-s3:<bucket> <new-remote>:<bucket>`
  for all 7 `hara-backups-*` buckets, then set `RCLONE_TARGET` in `backup.env` to the new remote.

## Mainnet / testnet posture (for contrast)

`121212` and `121299` have **no automated Postgres backup** and no snapshot tooling: the E14/E15
`pg_dumpall` extractions are the only copies of their gateway databases, and chain data relies on
peers. See `../121212-mainnet-neva/` and `../121299-testnet-neva/`.
