#!/usr/bin/env bash
# Bootstrap a La Verdu instance (profile B) on a prepared VPS.
#
# Required env:
#   BUSINESS_NAME   Commercial name of the business.
#   DB_NAME         Database slug (lowercase, a-z0-9_-).
#   DB_PASSWORD     Postgres password for DB_USER.
#
# Optional env:
#   DB_USER (default laverdu)
#   DB_HOST (default 127.0.0.1)
#   DB_PORT (default 5432)
#   BUSINESS_OWNER_NAME, BUSINESS_PHONE, BUSINESS_ADDRESS
#   ADMIN_USERNAME (default admin), ADMIN_PASSWORD (default: required)
#   INSTALL_DEPS (default true)
#   BUILD (default true)
#   RUN_MIGRATIONS (default true)
#   RUN_SEED (default true)
#   SKIP_DB_CREATE (default false)
#
# Usage:
#   sudo BUSINESS_NAME='Apolonia' DB_NAME=apolonia DB_PASSWORD='...' \
#     ADMIN_PASSWORD='...' ./scripts/bootstrap-instance.sh

set -euo pipefail

# ---------- helpers ----------
log() { echo "[bootstrap] $*"; }
fail() { echo "[bootstrap] ERROR: $*" >&2; exit 1; }

run_as_postgres() {
  if [ "$(id -un)" = "postgres" ]; then
    "$@"
  else
    sudo -u postgres "$@"
  fi
}

run_as_app() {
  if [ "$(id -un)" = "laverdu" ]; then
    "$@"
  elif [ "$(id -un)" = "root" ]; then
    sudo -u laverdu "$@"
  else
    "$@"
  fi
}

# ---------- validate ----------
: "${BUSINESS_NAME:?BUSINESS_NAME is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"

DB_USER="${DB_USER:-laverdu}"
DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
BUSINESS_OWNER_NAME="${BUSINESS_OWNER_NAME:-Dueño de ${BUSINESS_NAME}}"
BUSINESS_PHONE="${BUSINESS_PHONE:-}"
BUSINESS_ADDRESS="${BUSINESS_ADDRESS:-}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
INSTALL_DEPS="${INSTALL_DEPS:-true}"
BUILD="${BUILD:-true}"
RUN_MIGRATIONS="${RUN_MIGRATIONS:-true}"
RUN_SEED="${RUN_SEED:-true}"
SKIP_DB_CREATE="${SKIP_DB_CREATE:-false}"

if [[ ! "$DB_NAME" =~ ^[a-z][a-z0-9_-]*$ ]]; then
  fail "DB_NAME must start with a letter and contain only lowercase letters, digits, _ or -"
fi

if [ -z "$ADMIN_PASSWORD" ]; then
  fail "ADMIN_PASSWORD is required"
fi

APP_DIR="${APP_DIR:-/opt/la-verdu}"
FORCE_ENV="${FORCE_ENV:-false}"
GENERATE_ENV="${GENERATE_ENV:-true}"
SETUP_CRON="${SETUP_CRON:-false}"
GPG_RECIPIENT="${GPG_RECIPIENT:-backup@la-verdu}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/la-verdu}"
OFFSITE_ENABLED="${OFFSITE_ENABLED:-false}"
OFFSITE_TARGET="${OFFSITE_TARGET:-}"
PORT="${PORT:-3000}"

if [ ! -d "$APP_DIR" ]; then
  fail "application directory $APP_DIR not found (clone the repo first)"
fi

ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ] || [ "$FORCE_ENV" = "true" ]; then
  if [ "$GENERATE_ENV" = "true" ]; then
    log "Generating $ENV_FILE ..."
    cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=${PORT}
DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}
TZ_APP=${TZ_APP:-America/Argentina/Buenos_Aires}
LOG_LEVEL=${LOG_LEVEL:-info}

SESSION_SECRET=${SESSION_SECRET:-CHANGE_ME_SESSION_SECRET}

WHATSAPP_APP_SECRET=${WHATSAPP_APP_SECRET:-}
WHATSAPP_VERIFY_TOKEN=${WHATSAPP_VERIFY_TOKEN:-}
WHATSAPP_ACCESS_TOKEN=${WHATSAPP_ACCESS_TOKEN:-}
WHATSAPP_PHONE_NUMBER_ID=${WHATSAPP_PHONE_NUMBER_ID:-}
WHATSAPP_API_VERSION=${WHATSAPP_API_VERSION:-v22.0}

CHAT_BASE_URL=${CHAT_BASE_URL:-}
CHAT_API_KEY=${CHAT_API_KEY:-}
CHAT_MODEL=${CHAT_MODEL:-}

STT_BASE_URL=${STT_BASE_URL:-}
STT_API_KEY=${STT_API_KEY:-}
STT_MODEL=${STT_MODEL:-}
EOF
    chown laverdu:laverdu "$ENV_FILE" 2>/dev/null || true
    chmod 600 "$ENV_FILE"
    log "Generated $ENV_FILE. Review and complete any CHANGE_ME/empty values."
  else
    fail ".env not found at $ENV_FILE and GENERATE_ENV=false"
  fi
fi

if grep -q 'CHANGE_ME\|^WHATSAPP_APP_SECRET=$\|^CHAT_BASE_URL=$' "$ENV_FILE" 2>/dev/null; then
  log "WARNING: $ENV_FILE contains placeholders or empty secrets. Complete them before starting the app."
fi

# Verify DATABASE_URL points to the expected DB (best-effort).
if ! grep -q "DATABASE_URL=.*${DB_NAME}" "$ENV_FILE"; then
  log "WARNING: $ENV_FILE DATABASE_URL does not obviously reference ${DB_NAME}. Continue anyway."
fi

cd "$APP_DIR"

# ---------- create database ----------
if [ "$SKIP_DB_CREATE" != "true" ]; then
  log "Creating database ${DB_NAME} (and ${DB_NAME}_test)..."
  DB_NAME="$DB_NAME" DB_USER="$DB_USER" DB_PASSWORD="$DB_PASSWORD" \
    run_as_postgres "$APP_DIR/scripts/init-db.sh"
else
  log "Skipping database creation (SKIP_DB_CREATE=true)"
fi

# ---------- install deps ----------
if [ "$INSTALL_DEPS" = "true" ]; then
  log "Installing dependencies..."
  run_as_app npm ci
else
  log "Skipping dependency install"
fi

# ---------- build ----------
if [ "$BUILD" = "true" ]; then
  log "Building application..."
  run_as_app npm run build
else
  log "Skipping build"
fi

# ---------- migrate ----------
if [ "$RUN_MIGRATIONS" = "true" ]; then
  log "Running migrations..."
  if [ -f "$APP_DIR/apps/api/dist/src/db/migrate.js" ]; then
    run_as_app env DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
      node "$APP_DIR/apps/api/dist/src/db/migrate.js"
  else
    run_as_app env DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
      npm run db:migrate -w @la-verdu/api
  fi
else
  log "Skipping migrations"
fi

# ---------- seed ----------
if [ "$RUN_SEED" = "true" ]; then
  log "Seeding business '${BUSINESS_NAME}'..."
  if [ -f "$APP_DIR/apps/api/dist/src/db/seed.js" ]; then
    run_as_app env \
      BUSINESS_NAME="$BUSINESS_NAME" \
      BUSINESS_OWNER_NAME="$BUSINESS_OWNER_NAME" \
      BUSINESS_PHONE="$BUSINESS_PHONE" \
      BUSINESS_ADDRESS="$BUSINESS_ADDRESS" \
      DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
      node "$APP_DIR/apps/api/dist/src/db/seed.js"
  else
    run_as_app env \
      BUSINESS_NAME="$BUSINESS_NAME" \
      BUSINESS_OWNER_NAME="$BUSINESS_OWNER_NAME" \
      BUSINESS_PHONE="$BUSINESS_PHONE" \
      BUSINESS_ADDRESS="$BUSINESS_ADDRESS" \
      DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
      npm run db:seed -w @la-verdu/api
  fi

  log "Seeding admin user '${ADMIN_USERNAME}'..."
  if [ -f "$APP_DIR/apps/api/dist/src/db/seed-admin.js" ]; then
    run_as_app env \
      ADMIN_USERNAME="$ADMIN_USERNAME" \
      ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      ADMIN_ROLE="OWNER" \
      DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
      node "$APP_DIR/apps/api/dist/src/db/seed-admin.js"
  else
    run_as_app env \
      ADMIN_USERNAME="$ADMIN_USERNAME" \
      ADMIN_PASSWORD="$ADMIN_PASSWORD" \
      ADMIN_ROLE="OWNER" \
      DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}" \
      npm run db:seed-admin -w @la-verdu/api
  fi
else
  log "Skipping seed"
fi

# ---------- optional cron setup ----------
if [ "$SETUP_CRON" = "true" ]; then
  if [ "$(id -u)" -ne 0 ]; then
    log "WARNING: SETUP_CRON requires root; skipping cron setup."
  else
    log "Configuring daily backup cron..."
    mkdir -p /var/backups/la-verdu /var/log
    CRON_FILE="/etc/cron.d/la-verdu-backup"
    cat > "$CRON_FILE" <<EOF
0 3 * * * root DATABASE_URL=postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME} GPG_RECIPIENT=${GPG_RECIPIENT} BACKUP_DIR=${BACKUP_DIR} OFFSITE_ENABLED=${OFFSITE_ENABLED} OFFSITE_TARGET=${OFFSITE_TARGET} /opt/la-verdu/scripts/backup-secure.sh >> /var/log/la-verdu-backup.log 2>&1
0 4 * * 0 root VERIFY_DB_URL=postgres://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}_verify GPG_RECIPIENT=${GPG_RECIPIENT} /opt/la-verdu/scripts/verify-backup.sh \$(ls -t ${BACKUP_DIR}/la-verdu_*.gpg | head -1) >> /var/log/la-verdu-backup.log 2>&1
EOF
    chmod 644 "$CRON_FILE"
    log "Cron configured at $CRON_FILE"
  fi
fi

log "Bootstrap completed successfully."
log "Next manual steps:"
log "  1. Configure HTTPS (Caddy/Cloudflare) for your domain."
log "  2. Create and enable the systemd service (la-verdu.service)."
log "  3. Configure WhatsApp webhook in Meta."
log "  4. Set up backups (scripts/backup-secure.sh) and cron."
log "  5. Verify: curl https://<DOMAIN>/health/ready"