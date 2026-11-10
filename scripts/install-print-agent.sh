#!/usr/bin/env bash
# Install and configure the La Verdu print-agent on a local Linux machine.
#
# Required env:
#   BACKEND_URL     WSS URL of the La Verdu API (e.g. wss://apolonia.tu-dominio.com)
#   BRANCH_ID       UUID of the branch (from admin)
#   BRANCH_TOKEN    Branch agent token (from admin)
#
# Optional env:
#   PRINTER_ADDRESS   tcp://IP:PORT or "usb" (default tcp://127.0.0.1:9100)
#   PRINTER_PORT      (default 9100)
#   INSTALL_DIR       (default /opt/print-agent)
#   CONFIG_PATH       (default $INSTALL_DIR/config.json)
#   BINARY_SOURCE     Path to a prebuilt print-agent binary to copy
#   BINARY_PATH       (default /usr/local/bin/print-agent)
#   SERVICE_NAME      (default print-agent)
#   RUN_USER          (default printagent)
#   ENABLE_SERVICE    (default true)
#   START_SERVICE     (default true)
#
# Usage:
#   sudo BACKEND_URL=wss://apolonia.tu-dominio.com \
#        BRANCH_ID=... BRANCH_TOKEN=... \
#        PRINTER_ADDRESS=tcp://192.168.1.100:9100 \
#        BINARY_SOURCE=/tmp/print-agent \
#        ./scripts/install-print-agent.sh

set -euo pipefail

log() { echo "[print-agent-install] $*"; }
fail() { echo "[print-agent-install] ERROR: $*" >&2; exit 1; }

# ---------- validate ----------
: "${BACKEND_URL:?BACKEND_URL is required (e.g. wss://dominio)}"
: "${BRANCH_ID:?BRANCH_ID is required (UUID de la sucursal)}"
: "${BRANCH_TOKEN:?BRANCH_TOKEN is required (token del agente)}"

PRINTER_ADDRESS="${PRINTER_ADDRESS:-tcp://127.0.0.1:9100}"
PRINTER_PORT="${PRINTER_PORT:-9100}"
USE_TAILSCALE="${USE_TAILSCALE:-false}"
TAILSCALE_IP="${TAILSCALE_IP:-}"
TAILSCALE_PORT="${TAILSCALE_PORT:-3000}"
TAILSCALE_TLS="${TAILSCALE_TLS:-false}"
INSTALL_DIR="${INSTALL_DIR:-/opt/print-agent}"
CONFIG_PATH="${CONFIG_PATH:-$INSTALL_DIR/config.json}"
BINARY_PATH="${BINARY_PATH:-/usr/local/bin/print-agent}"
SERVICE_NAME="${SERVICE_NAME:-print-agent}"
RUN_USER="${RUN_USER:-printagent}"
ENABLE_SERVICE="${ENABLE_SERVICE:-true}"
START_SERVICE="${START_SERVICE:-true}"

if [ "$(id -u)" -ne 0 ]; then
  fail "this script must run as root (use sudo)"
fi

# ---------- user ----------
if ! id "$RUN_USER" >/dev/null 2>&1; then
  log "Creating system user $RUN_USER..."
  useradd -r -s /bin/false "$RUN_USER"
fi

# ---------- directories ----------
log "Creating directories..."
mkdir -p "$INSTALL_DIR"
chown "$RUN_USER:$RUN_USER" "$INSTALL_DIR"

# ---------- binary ----------
if [ -n "${BINARY_SOURCE:-}" ]; then
  if [ ! -f "$BINARY_SOURCE" ]; then
    fail "BINARY_SOURCE not found: $BINARY_SOURCE"
  fi
  log "Installing binary from $BINARY_SOURCE..."
  install -m 0755 "$BINARY_SOURCE" "$BINARY_PATH"
else
  if [ ! -f "$BINARY_PATH" ]; then
    fail "no binary found at $BINARY_PATH and BINARY_SOURCE not provided"
  fi
  log "Using existing binary at $BINARY_PATH"
fi

# ---------- backend URL ----------
if [ "$USE_TAILSCALE" = "true" ]; then
  if [ -z "$TAILSCALE_IP" ]; then
    fail "TAILSCALE_IP is required when USE_TAILSCALE=true"
  fi
  if [ "$TAILSCALE_TLS" = "true" ]; then
    BACKEND_URL="wss://${TAILSCALE_IP}:${TAILSCALE_PORT}"
  else
    BACKEND_URL="ws://${TAILSCALE_IP}:${TAILSCALE_PORT}"
  fi
  log "Using Tailscale backend URL: $BACKEND_URL"
fi

# ---------- config ----------
log "Writing config to $CONFIG_PATH..."
cat > "$CONFIG_PATH" <<EOF
{
  "backend_url": "${BACKEND_URL}",
  "branch_token": "${BRANCH_TOKEN}",
  "branch_id": "${BRANCH_ID}",
  "printer_address": "${PRINTER_ADDRESS}",
  "printer_port": ${PRINTER_PORT}
}
EOF
chown "$RUN_USER:$RUN_USER" "$CONFIG_PATH"
chmod 600 "$CONFIG_PATH"

# ---------- usb permissions ----------
if [ "$PRINTER_ADDRESS" = "usb" ]; then
  log "USB mode: adding $RUN_USER to lp/dialout groups..."
  usermod -aG lp "$RUN_USER" 2>/dev/null || true
  usermod -aG dialout "$RUN_USER" 2>/dev/null || true
fi

# ---------- systemd unit ----------
log "Creating systemd unit $SERVICE_NAME..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=La Verdu Print Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
Group=${RUN_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=${BINARY_PATH} ${CONFIG_PATH}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload

if [ "$ENABLE_SERVICE" = "true" ]; then
  log "Enabling service..."
  systemctl enable "$SERVICE_NAME"
fi

if [ "$START_SERVICE" = "true" ]; then
  log "Starting service..."
  systemctl restart "$SERVICE_NAME"
fi

log "Done."
log "Check status: systemctl status $SERVICE_NAME"
log "Check logs: journalctl -u $SERVICE_NAME -f"