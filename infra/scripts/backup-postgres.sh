#!/usr/bin/env bash
# SiteFlow — PostgreSQL logical backup script
# Gap G29/G32: automated pg_dump with S3 upload and GPG encryption
#
# Required env vars:
#   PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
#   BACKUP_BUCKET       — S3 bucket name (e.g. s3://siteflow-backups or minio alias)
#   BACKUP_PASSPHRASE   — GPG symmetric encryption passphrase
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   AWS_ENDPOINT_URL    — optional; set for MinIO (e.g. http://localhost:9000)
#
# Usage:
#   ./infra/scripts/backup-postgres.sh
#   BACKUP_TYPE=weekly ./infra/scripts/backup-postgres.sh

set -euo pipefail

BACKUP_TYPE="${BACKUP_TYPE:-daily}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="/tmp/siteflow-${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.gpg"
S3_KEY="postgres/${BACKUP_TYPE}/siteflow-${TIMESTAMP}.dump.gpg"

echo "[backup] Starting PostgreSQL backup — type=${BACKUP_TYPE} timestamp=${TIMESTAMP}"

# 1. Dump
echo "[backup] Running pg_dump..."
PGPASSWORD="${PGPASSWORD}" pg_dump \
  --host="${PGHOST:-localhost}" \
  --port="${PGPORT:-5432}" \
  --username="${PGUSER:-siteflow}" \
  --dbname="${PGDATABASE:-siteflow}" \
  --format=custom \
  --compress=9 \
  --file="${DUMP_FILE}"

echo "[backup] Dump complete: ${DUMP_FILE} ($(du -sh "${DUMP_FILE}" | cut -f1))"

# 2. Encrypt
echo "[backup] Encrypting with GPG..."
echo "${BACKUP_PASSPHRASE}" | gpg \
  --batch \
  --yes \
  --passphrase-fd 0 \
  --symmetric \
  --cipher-algo AES256 \
  --output "${ENCRYPTED_FILE}" \
  "${DUMP_FILE}"

rm -f "${DUMP_FILE}"
echo "[backup] Encrypted: ${ENCRYPTED_FILE}"

# 3. Upload to S3 / MinIO
echo "[backup] Uploading to ${BACKUP_BUCKET}/${S3_KEY}..."
if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
  aws s3 cp "${ENCRYPTED_FILE}" "${BACKUP_BUCKET}/${S3_KEY}" \
    --endpoint-url "${AWS_ENDPOINT_URL}"
else
  aws s3 cp "${ENCRYPTED_FILE}" "${BACKUP_BUCKET}/${S3_KEY}"
fi

rm -f "${ENCRYPTED_FILE}"
echo "[backup] Upload complete. Backup stored at ${BACKUP_BUCKET}/${S3_KEY}"
echo "[backup] SUCCESS"
