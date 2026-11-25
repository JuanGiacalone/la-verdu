#!/usr/bin/env bash
# Source this file to load all La Verdu environment variables:
#   source scripts/setup-env.sh
# Then edit the values. Secrets are left empty.

export DB_USER="${DB_USER:-laverdu}"
export DB_PASSWORD="${DB_PASSWORD:-}"
export DB_NAME="${DB_NAME:-laverdu}"
export DATABASE_URL="${DATABASE_URL:-postgres://${DB_USER}:${DB_PASSWORD}@db:5432/${DB_NAME}}"
export TZ_APP="${TZ_APP:-America/Argentina/Buenos_Aires}"
export LOG_LEVEL="${LOG_LEVEL:-info}"
export NODE_ENV="${NODE_ENV:-production}"
export PORT="${PORT:-3000}"

export ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
export ADMIN_ROLE="${ADMIN_ROLE:-OWNER}"

export CHAT_BASE_URL="${CHAT_BASE_URL:-https://generativelanguage.googleapis.com/v1beta/openai/}"
export CHAT_API_KEY="${CHAT_API_KEY:-}"
export CHAT_MODEL="${CHAT_MODEL:-gemini-3.5-flash-lite}"

export STT_BASE_URL="${STT_BASE_URL:-http://stt-stub:8083}"
export STT_API_KEY="${STT_API_KEY:-}"
export STT_MODEL="${STT_MODEL:-stt-stub}"

export WHATSAPP_APP_SECRET="${WHATSAPP_APP_SECRET:-}"
export WHATSAPP_VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-}"
export WHATSAPP_ACCESS_TOKEN="${WHATSAPP_ACCESS_TOKEN:-}"
export WHATSAPP_PHONE_NUMBER_ID="${WHATSAPP_PHONE_NUMBER_ID:-}"
export WHATSAPP_API_VERSION="${WHATSAPP_API_VERSION:-v22.0}"

export GPG_RECIPIENT="${GPG_RECIPIENT:-backup@la-verdu}"
export OFFSITE_ENABLED="${OFFSITE_ENABLED:-false}"
export OFFSITE_TARGET="${OFFSITE_TARGET:-}"

echo "La Verdu env loaded. Complete DB_PASSWORD, ADMIN_PASSWORD, CHAT_API_KEY, WHATSAPP_*."
EOF