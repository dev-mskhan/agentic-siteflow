#!/usr/bin/env bash
# SiteFlow — PostgreSQL restore smoke test
# Gap G33/G34: verify backups are restorable
#
# Downloads latest backup from S3, decrypts it, restores to a test DB,
# and runs a basic row-count sanity check.
#
# Required env vars:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD
#   BACKUP_BUCKET, BACKUP_PASSPHRASE
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# Optional: AWS_ENDPOINT_URL

set -euo pipefail

RESTORE_DB="${RESTORE_DB:-siteflow_restore_test}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ENCRYPTED_FILE="/tmp/restore-${TIMESTAMP}.dump.gpg"
DUMP_FILE="/tmp/restore-${TIMESTAMP}.dump"

S3_ARGS=()
if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
  S3_ARGS+=(--endpoint-url "${AWS_ENDPOINT_URL}")
fi

echo "[restore] Starting restore drill — target DB: ${RESTORE_DB}"

# 1. Find latest daily backup
echo "[restore] Finding latest backup..."
LATEST=$(aws s3 ls "${BACKUP_BUCKET}/postgres/daily/" "${S3_ARGS[@]}" \
  | sort \
  | tail -1 \
  | awk '{print $4}')

if [[ -z "${LATEST}" ]]; then
  echo "[restore] ERROR: No backups found in ${BACKUP_BUCKET}/postgres/daily/"
  exit 1
fi

echo "[restore] Latest backup: ${LATEST}"

# 2. Download
echo "[restore] Downloading..."
aws s3 cp "${BACKUP_BUCKET}/postgres/daily/${LATEST}" "${ENCRYPTED_FILE}" "${S3_ARGS[@]}"

# 3. Decrypt
echo "[restore] Decrypting..."
echo "${BACKUP_PASSPHRASE}" | gpg \
  --batch \
  --yes \
  --passphrase-fd 0 \
  --decrypt \
  --output "${DUMP_FILE}" \
  "${ENCRYPTED_FILE}"
rm -f "${ENCRYPTED_FILE}"

# 4. Create restore target DB
echo "[restore] Creating restore database ${RESTORE_DB}..."
PGPASSWORD="${PGPASSWORD}" psql \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-siteflow}" \
  --dbname="postgres" \
  -c "DROP DATABASE IF EXISTS ${RESTORE_DB}; CREATE DATABASE ${RESTORE_DB};"

# 5. Restore
echo "[restore] Restoring..."
PGPASSWORD="${PGPASSWORD}" pg_restore \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-siteflow}" \
  --dbname="${RESTORE_DB}" \
  --no-owner \
  --no-acl \
  "${DUMP_FILE}"

rm -f "${DUMP_FILE}"

# 6. Sanity check
echo "[restore] Running sanity check..."
ROW_COUNT=$(PGPASSWORD="${PGPASSWORD}" psql \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-siteflow}" \
  --dbname="${RESTORE_DB}" \
  -t -c "SELECT COUNT(*) FROM organizations;" \
  | tr -d '[:space:]')

echo "[restore] organizations row count: ${ROW_COUNT}"

# 7. Cleanup
PGPASSWORD="${PGPASSWORD}" psql \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-siteflow}" \
  --dbname="postgres" \
  -c "DROP DATABASE IF EXISTS ${RESTORE_DB};" 2>/dev/null || true

echo "[restore] RESTORE OK — backup is restorable"
exit 0
