# SiteFlow — Infrastructure Scripts

Scripts for database backup, pruning, and restore operations.

## Scripts

| Script                | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `backup-postgres.sh`  | Logical pg_dump with GPG encryption and S3 upload            |
| `prune-backups.sh`    | Remove old backups from S3 based on retention policy         |
| `restore-postgres.sh` | Download, decrypt, and restore a backup for drill/validation |

## Usage

### Backup

```bash
# Daily backup (default)
./infra/scripts/backup-postgres.sh

# Weekly backup
BACKUP_TYPE=weekly ./infra/scripts/backup-postgres.sh
```

Required env vars: `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `BACKUP_BUCKET`, `BACKUP_PASSPHRASE`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`.  
Optional: `AWS_ENDPOINT_URL` (for MinIO).

### Prune

```bash
./infra/scripts/prune-backups.sh
```

### Manual Restore Drill

```bash
./infra/scripts/restore-postgres.sh
```

<!-- Drill log: date=2026-09-09, dump_size=TBD (run drill against live backup), restore_time=TBD -->

## RTO / RPO Targets

| Metric                         | Target                    |
| ------------------------------ | ------------------------- |
| RPO (Recovery Point Objective) | ≤ 24 hours (daily backup) |
| RTO (Recovery Time Objective)  | ≤ 4 hours                 |

---

## Point-in-Time Recovery (PITR)

WAL archiving is configured in `infra/docker/postgres/postgresql.conf` (commented out by default).

For production deployments, uncomment the WAL settings and set `BACKUP_BUCKET`:

```conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p $BACKUP_BUCKET/postgres/wal/%f'
archive_timeout = 300
```

**Note:** On managed databases (AWS RDS, Cloud SQL, Supabase), WAL archiving / PITR is built-in via the provider console — the above config is only for self-hosted PostgreSQL.

### PITR Restore Procedure

1. Restore a base backup:

```bash
pg_restore --host=localhost --port=5432 --username=siteflow \
  --dbname=siteflow_restore --format=custom backup.dump
```

2. Configure recovery target in `postgresql.auto.conf` (PostgreSQL 12+):

```conf
restore_command = 'aws s3 cp $BACKUP_BUCKET/postgres/wal/%f %p'
recovery_target_time = '2026-09-09 03:00:00'
recovery_target_action = 'promote'
```

3. Create `recovery.signal` file in the data directory, then start PostgreSQL — it will replay WAL up to the target time.

---

## Row-Level Security (RLS)

RLS policies are defined in migration `20260909200000_rls`. They apply to the `siteflow_app` role.

**For migrations:** Always run as the superuser (`siteflow` user), not `siteflow_app`. The superuser bypasses RLS by default (`BYPASSRLS` is granted implicitly to superusers).

**For production:** Connect the application as `siteflow_app` and set `app.org_id` per session. See the comment in `server/src/infrastructure/database/client.ts` for the activation path.
