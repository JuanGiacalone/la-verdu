#!/usr/bin/env bash
# Configure UFW firewall for a La Verdu VPS.
#
# Defaults:
#   - Deny incoming, allow outgoing.
#   - Allow 80/443 (HTTP/HTTPS) publicly.
#   - SSH (22): only on Tailscale interface if Tailscale is active,
#     otherwise publicly (with a warning).
#   - API port 3000: only on Tailscale interface if EXPOSE_API_TAILSCALE=true.
#
# Usage:
#   sudo ./scripts/configure-firewall.sh
#   sudo EXPOSE_API_TAILSCALE=true ./scripts/configure-firewall.sh
#
# Optional env:
#   SSH_PORT              (default 22)
#   ALLOW_SSH_PUBLIC      true/false (default: auto-detect Tailscale)
#   EXPOSE_API_TAILSCALE  true/false (default false)
#   TAILSCALE_IFACE       (default tailscale0)
#   API_PORT              (default 3000)

set -euo pipefail

log() { echo "[firewall] $*"; }
fail() { echo "[firewall] ERROR: $*" >&2; exit 1; }
warn() { echo "[firewall] WARN: $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
  fail "this script must run as root (use sudo)"
fi

if ! command -v ufw >/dev/null 2>&1; then
  log "Installing ufw..."
  apt-get update -qq
  apt-get install -y -qq ufw >/dev/null
fi

SSH_PORT="${SSH_PORT:-22}"
EXPOSE_API_TAILSCALE="${EXPOSE_API_TAILSCALE:-false}"
TAILSCALE_IFACE="${TAILSCALE_IFACE:-tailscale0}"
API_PORT="${API_PORT:-3000}"

# Auto-detect Tailscale
TAILSCALE_ACTIVE=false
if ip link show "$TAILSCALE_IFACE" >/dev/null 2>&1; then
  TAILSCALE_ACTIVE=true
fi

if [ -z "${ALLOW_SSH_PUBLIC:-}" ]; then
  if [ "$TAILSCALE_ACTIVE" = "true" ]; then
    ALLOW_SSH_PUBLIC=false
  else
    ALLOW_SSH_PUBLIC=true
  fi
fi

log "Tailscale active: $TAILSCALE_ACTIVE"
log "Allow SSH public: $ALLOW_SSH_PUBLIC"
log "Expose API on Tailscale: $EXPOSE_API_TAILSCALE"

# ---------- reset rules (idempotent) ----------
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming
ufw default allow outgoing

# ---------- public ports ----------
ufw allow 80/tcp
ufw allow 443/tcp
log "Allowed 80/tcp and 443/tcp (public)."

# ---------- SSH ----------
if [ "$ALLOW_SSH_PUBLIC" = "true" ]; then
  ufw allow "${SSH_PORT}/tcp"
  log "Allowed ${SSH_PORT}/tcp (public). WARNING: SSH exposed to internet."
else
  ufw allow in on "$TAILSCALE_IFACE" to any port "${SSH_PORT}" proto tcp
  log "Allowed ${SSH_PORT}/tcp only on $TAILSCALE_IFACE."
fi

# ---------- API on Tailscale ----------
if [ "$EXPOSE_API_TAILSCALE" = "true" ]; then
  ufw allow in on "$TAILSCALE_IFACE" to any port "${API_PORT}" proto tcp
  ufw deny "${API_PORT}/tcp"
  log "Allowed ${API_PORT}/tcp only on $TAILSCALE_IFACE; denied publicly."
else
  ufw deny "${API_PORT}/tcp" 2>/dev/null || true
  log "Denied ${API_PORT}/tcp publicly (not exposed)."
fi

# ---------- enable ----------
ufw --force enable
log "UFW enabled."
ufw status verbose