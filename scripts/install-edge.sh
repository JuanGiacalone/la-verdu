#!/usr/bin/env bash
# Install and configure Caddy + Cloudflare Tunnel on a VPS (edge layer).
#
# This script prepares the reverse proxy (Caddy) and the Cloudflare Tunnel
# that exposes La Verdu to the internet with HTTPS + WebSocket support.
#
# Required env:
#   DOMAIN          Public domain (e.g. apolonia.tu-dominio.com)
#
# Optional env:
#   UPSTREAM        Backend to proxy (default http://localhost:3000)
#   TUNNEL_NAME     Cloudflare tunnel name (default la-verdu)
#   TUNNEL_ID       Existing tunnel ID (skip creation)
#   INSTALL_CADDY   true/false (default true)
#   INSTALL_CF      true/false (default true)
#   SETUP_CADDY     true/false (default true)
#   SETUP_TUNNEL    true/false (default true)
#   CADDY_PORT      Port Caddy listens on (default 80)
#
# Usage:
#   sudo DOMAIN=apolonia.tu-dominio.com UPSTREAM=http://localhost:3000 \
#     ./scripts/install-edge.sh
#
# Notes:
#   - Cloudflare Tunnel creation requires a one-time browser login.
#   - The script will print the exact commands if login is needed.

set -euo pipefail

log() { echo "[edge-install] $*"; }
fail() { echo "[edge-install] ERROR: $*" >&2; exit 1; }
warn() { echo "[edge-install] WARN: $*" >&2; }

# ---------- validate ----------
: "${DOMAIN:?DOMAIN is required (e.g. apolonia.tu-dominio.com)}"

UPSTREAM="${UPSTREAM:-http://localhost:3000}"
TUNNEL_NAME="${TUNNEL_NAME:-la-verdu}"
TUNNEL_ID="${TUNNEL_ID:-}"
INSTALL_CADDY="${INSTALL_CADDY:-true}"
INSTALL_CF="${INSTALL_CF:-true}"
SETUP_CADDY="${SETUP_CADDY:-true}"
SETUP_TUNNEL="${SETUP_TUNNEL:-true}"
CADDY_PORT="${CADDY_PORT:-80}"

if [ "$(id -u)" -ne 0 ]; then
  fail "this script must run as root (use sudo)"
fi

# ---------- dependencies ----------
log "Installing base dependencies..."
apt-get update -qq
apt-get install -y -qq curl wget gnupg ca-certificates lsb-release >/dev/null

# ---------- Caddy ----------
if [ "$INSTALL_CADDY" = "true" ]; then
  if command -v caddy >/dev/null 2>&1; then
    log "Caddy already installed: $(caddy version)"
  else
    log "Installing Caddy..."
    apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https >/dev/null
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -qq
    apt-get install -y -qq caddy >/dev/null
    log "Caddy installed."
  fi
fi

if [ "$SETUP_CADDY" = "true" ]; then
  log "Configuring Caddy for $DOMAIN -> $UPSTREAM..."
  cat > /etc/caddy/Caddyfile <<EOF
${DOMAIN} {
    reverse_proxy ${UPSTREAM}
}
EOF
  caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 || warn "Caddyfile validation failed; check syntax."
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy
  log "Caddy configured and restarted."
fi

# ---------- Cloudflare Tunnel ----------
if [ "$INSTALL_CF" = "true" ]; then
  if command -v cloudflared >/dev/null 2>&1; then
    log "cloudflared already installed: $(cloudflared --version)"
  else
    log "Installing cloudflared..."
    ARCH=$(dpkg --print-architecture)
    wget -q "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${ARCH}.deb" -O /tmp/cloudflared.deb
    dpkg -i /tmp/cloudflared.deb >/dev/null 2>&1 || apt-get install -f -y -qq >/dev/null
    rm -f /tmp/cloudflared.deb
    log "cloudflared installed."
  fi
fi

if [ "$SETUP_TUNNEL" = "true" ]; then
  mkdir -p /etc/cloudflared

  # If no TUNNEL_ID, try to create (requires prior login).
  if [ -z "$TUNNEL_ID" ]; then
    if [ -f /root/.cloudflared/cert.pem ]; then
      log "Creating tunnel '$TUNNEL_NAME'..."
      CREATE_OUTPUT=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1) || {
        warn "tunnel creation failed: $CREATE_OUTPUT"
        CREATE_OUTPUT=""
      }
      TUNNEL_ID=$(echo "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
    else
      warn "No Cloudflare login found. Run 'cloudflared tunnel login' first."
    fi
  fi

  if [ -n "$TUNNEL_ID" ]; then
    log "Using tunnel ID: $TUNNEL_ID"
    cat > /etc/cloudflared/config.yml <<EOF
tunnel: ${TUNNEL_ID}
credentials-file: /root/.cloudflared/${TUNNEL_ID}.json

ingress:
  - hostname: ${DOMAIN}
    service: http://localhost:${CADDY_PORT}
  - service: http_status:404
EOF
    # Route DNS if not already.
    cloudflared tunnel route dns "$TUNNEL_NAME" "$DOMAIN" 2>/dev/null || warn "DNS route may already exist or login required."

    # Install as systemd service.
    cloudflared service install 2>/dev/null || true
    systemctl enable cloudflared >/dev/null 2>&1 || true
    systemctl restart cloudflared
    log "Cloudflare Tunnel configured and started."
  else
    warn "TUNNEL_ID not available. Complete manually:"
    echo "  1. cloudflared tunnel login"
    echo "  2. cloudflared tunnel create $TUNNEL_NAME"
    echo "  3. Re-run this script with TUNNEL_ID=<id>"
  fi
fi

log "Edge setup complete."
log "Verify:"
log "  systemctl status caddy"
log "  systemctl status cloudflared"
log "  curl -I https://${DOMAIN}"