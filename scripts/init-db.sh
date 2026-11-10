#!/usr/bin/env bash
# Initialize a La Verdu production database and user.
#
# Defaults keep backward compatibility with "laverdu". For a new instance,
# override DB_NAME/DB_USER/DB_PASSWORD to match the business.
#
# Usage:
#   DB_NAME=verduleria_don_jose DB_USER=verduleria DB_PASSWORD='...' \
#     sudo -u postgres ./scripts/init-db.sh

set -euo pipefail

DB_NAME="${DB_NAME:-laverdu}"
DB_USER="${DB_USER:-laverdu}"
DB_PASSWORD="${DB_PASSWORD:-CONTRASEÑA_SEGURA}"
DB_TEST_NAME="${DB_NAME}_test"

echo "Creating user $DB_USER (if not exists)..."
psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${DB_USER}') THEN
    CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
  END IF;
END
\$\$;
SQL

echo "Creating database $DB_NAME (if not exists)..."
psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
SELECT 'CREATE DATABASE ${DB_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_NAME}')\gexec
SQL

echo "Creating test database $DB_TEST_NAME (if not exists)..."
psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<SQL
SELECT 'CREATE DATABASE ${DB_TEST_NAME} OWNER ${DB_USER}'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${DB_TEST_NAME}')\gexec
SQL

echo "Done. DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}"