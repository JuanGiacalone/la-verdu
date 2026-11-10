#!/usr/bin/env bash
# Secure daily backup for La Verdu (PRD RNF-19).
#
# Produces an AES-256/GPG-encrypted, checksummed dump and optionally copies it
# offsite. Replaces scripts/backup.sh for production use.
#
# Required:
#   DATABASE_URL        Postgres connection string.
#   One of:
#     GPG_RECIPIENT     Public-key ID/email to encrypt to (recommended).
#     BACKUP_PASSPHRASE  Symmetric passphrase (fallback).
#
# Optional:
#   BACKUP_DIR          Local destination (default /var/backups/la-verdu).
#   RETENTION_DAYS      Local retention (default 30).
#   OFFSITE_ENABLED     "true" to copy offsite (default false).
#   OFFSITE_TARGET      rclone remote:path OR rsync destination (user@host:/path).
#   OFFSITE_TOOL        "rclone" (default) or "rsync".
#   SHRED_PLAINTEXT     "true" to shred the plaintext dump (default true).
#
# Cron example:
#   0 3 * * * root DATABASE_URL=... GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TARGET=backup-remote:la-verdu /opt/la-verdu/scripts/backup-secure.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://laverdu:laverdu_dev_only@localhost:5432/laverdu_dev}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/la-verdu}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"
BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"
OFFSITE_ENABLED="${OFFSITE_ENABLED:-false}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"
OFFSITE_TOOL="${OFFSITE_TOOL:-rclone}"
SHRED_PLAINTEXT="${SHRED_PLAINTEXT:-true}"

if [[ -z "$GPG_RECIPIENT" && -z "$BACKUP_PASSPHRASE" ]]; then
  echo "ERROR: set GPG_RECIPIENT (recommended) or BACKUP_PASSPHRASE" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date -u +%Y%m%d_%H%M%S)
BASENAME="la-verdu_${TIMESTAMP}"
PLAIN_FILE="$BACKUP_DIR/${BASENAME}.sql.gz"
ENC_FILE="$BACKUP_DIR/${BASENAME}.sql.gz.gpg"
# Remove plaintext on exit (success or failure).
trap 'rm -f "$PLAIN_FILE"' EXIT
SHA_FILE="$BACKUP_DIR/${BASENAME}.sha256"

echo "[$(date -u +%FT%TZ)] dumping database..."
pg_dump "$DB_URL" | gzip > "$PLAIN_FILE"

echo "[$(date -u +%FT%TZ)] writing checksum..."
sha256sum "$PLAIN_FILE" > "$SHA_FILE"

echo "[$(date -u +%FT%TZ)] encrypting..."
if [[ -n "$GPG_RECIPIENT" ]]; then
  gpg --batch --yes --trust-model always \
    --recipient "$GPG_RECIPIENT" \
    --output "$ENC_FILE" \
    --encrypt "$PLAIN_FILE"
else
  gpg --batch --yes --pinentry-mode loopback \
    --passphrase "$BACKUP_PASSPHRASE" \
    --symmetric --cipher-algo AES256 \
    --output "$ENC_FILE" "$PLAIN_FILE"
fi

if [[ "$SHRED_PLAINTEXT" == "true" ]]; then
  if command -v shred >/dev/null 2>&1; then
    shred -u "$PLAIN_FILE"
  else
    rm -f "$PLAIN_FILE"
  fi
else
  rm -f "$PLAIN_FILE"
fi

echo "[$(date -u +%FT%TZ)] backup complete: $(du -h "$ENC_FILE" | cut -f1)"

# Offsite copy.
if [[ "$OFFSITE_ENABLED" == "true" ]]; then
  if [[ -z "$OFFSITE_TARGET" ]]; then
    echo "ERROR: OFFSITE_TARGET is required when OFFSITE_ENABLED=true" >&2
    exit 1
  fi
  echo "[$(date -u +%FT%TZ)] copying offsite via $OFFSITE_TOOL..."
  if [[ "$OFFSITE_TOOL" == "rclone" ]]; then
    command -v rclone >/dev/null 2>&1 || { echo "rclone not found" >&2; exit 1; }
    rclone copy "$ENC_FILE" "$OFFSITE_TARGET" --checksum
    rclone copy "$SHA_FILE" "$OFFSITE_TARGET" --checksum
  elif [[ "$OFFSITE_TOOL" == "rsync" ]]; then
    rsync -az --checksum "$ENC_FILE" "$SHA_FILE" "$OFFSITE_TARGET"/
  else
    echo "ERROR: unknown OFFSITE_TOOL=$OFFSITE_TOOL" >&2
    exit 1
  fi
  echo "[$(date -u +%FT%TZ)] offsite copy done"
fi

# Retention.
find "$BACKUP_DIR" -name 'la-verdu_*.gpg'  -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'la-verdu_*.sha256' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -u +%FT%TZ)] old backups (>${RETENTION_DAYS}d) removed"
