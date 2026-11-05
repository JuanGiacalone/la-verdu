#!/usr/bin/env bash
# Verify a La Verdu encrypted backup by restoring it into a TEST database.
#
# Usage:
#   GPG_RECIPIENT=... (or BACKUP_PASSPHRASE=...) \
#   VERIFY_DB_URL=postgres://laverdu:...@127.0.0.1:5432/laverdu_verify \
#   ./scripts/verify-backup.sh /var/backups/la-verdu/la-verdu_YYYYMMDD_HHMMSS.sql.gz.gpg
#
# The target DB name MUST end in _verify or _test (safety guard).

set -euo pipefail

ENC_FILE="${1:?usage: verify-backup.sh <file.gpg>}"
VERIFY_DB_URL="${VERIFY_DB_URL:?VERIFY_DB_URL is required}"
GPG_RECIPIENT="${GPG_RECIPIENT:-}"
BACKUP_PASSPHRASE="${BACKUP_PASSPHRASE:-}"

DB_NAME=$(python3 -c "import urllib.parse,sys; print(urllib.parse.urlparse('$VERIFY_DB_URL').path.lstrip('/'))" 2>/dev/null || echo "")
case "$DB_NAME" in
  *_verify|*_test) ;;
  *) echo "ERROR: DB name must end in _verify or _test (got '$DB_NAME')" >&2; exit 1 ;;
esac

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

PLAIN="$TMPDIR/restore.sql.gz"

echo "Decrypting..."
if [[ -n "$GPG_RECIPIENT" ]]; then
  gpg --batch --yes --decrypt --output "$PLAIN" "$ENC_FILE"
else
  gpg --batch --yes --pinentry-mode loopback --passphrase "$BACKUP_PASSPHRASE" \
    --decrypt --output "$PLAIN" "$ENC_FILE"
fi

echo "Restoring into $DB_NAME..."
# Recreate schema.
psql "$VERIFY_DB_URL" -c "DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;" >/dev/null
gunzip -c "$PLAIN" | psql "$VERIFY_DB_URL" >/dev/null

echo "Verifying row counts..."
for t in customer '"order"' product branch staff message; do
  count=$(psql "$VERIFY_DB_URL" -tAc "SELECT count(*) FROM $t;" 2>/dev/null || echo "N/A")
  echo "  $t: $count"
done

echo "OK: backup verified"
