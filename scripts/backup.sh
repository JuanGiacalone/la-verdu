#!/usr/bin/env bash
# Daily backup script for La Verdu (PRD RNF-19).
# Dumps the database and stores it in a dated file.
# Run via cron: 0 3 * * * /path/to/backup.sh

set -euo pipefail

DB_URL="${DATABASE_URL:-postgres://laverdu:laverdu_dev_only@localhost:5432/laverdu_dev}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/la-verdu}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/la-verdu_${TIMESTAMP}.sql.gz"

echo "Backing up to $BACKUP_FILE..."

pg_dump "$DB_URL" | gzip > "$BACKUP_FILE"

echo "Backup complete: $(du -h "$BACKUP_FILE" | cut -f1)"

# Remove old backups.
find "$BACKUP_DIR" -name "la-verdu_*.sql.gz" -mtime +$RETENTION_DAYS -delete

echo "Old backups (older than $RETENTION_DAYS days) removed."
EOF