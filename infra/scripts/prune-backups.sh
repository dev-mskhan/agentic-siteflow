#!/usr/bin/env bash
# SiteFlow — Prune old PostgreSQL backups from S3
# Gap G31: enforce retention policy
#
# Retention:
#   daily   — keep 7 most recent
#   weekly  — keep 4 most recent
#   monthly — keep 3 most recent
#
# Required env vars: BACKUP_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# Optional: AWS_ENDPOINT_URL (for MinIO)

set -euo pipefail

prune_tier() {
  local tier="$1"
  local keep="$2"
  local prefix="${BACKUP_BUCKET}/postgres/${tier}/"

  echo "[prune] Checking ${tier} backups (keep=${keep})..."

  local s3_args=()
  if [[ -n "${AWS_ENDPOINT_URL:-}" ]]; then
    s3_args+=(--endpoint-url "${AWS_ENDPOINT_URL}")
  fi

  # List objects sorted by LastModified (oldest first)
  local files
  files=$(aws s3 ls "${prefix}" "${s3_args[@]}" \
    | sort \
    | awk '{print $4}' \
    | grep '\.dump\.gpg$')

  local count
  count=$(echo "${files}" | grep -c '.' || true)

  if [[ "${count}" -le "${keep}" ]]; then
    echo "[prune] ${tier}: ${count} backups, nothing to prune"
    return
  fi

  local to_delete
  to_delete=$(echo "${files}" | head -n $(( count - keep )))

  while IFS= read -r file; do
    echo "[prune] Deleting ${tier}/${file}..."
    aws s3 rm "${prefix}${file}" "${s3_args[@]}"
  done <<< "${to_delete}"

  echo "[prune] ${tier}: pruned $(( count - keep )) backup(s)"
}

echo "[prune] Starting backup pruning..."
prune_tier "daily"   7
prune_tier "weekly"  4
prune_tier "monthly" 3
echo "[prune] Pruning complete"
