#!/usr/bin/env bash
# Install Tailscale on a VPS and optionally restrict SSH to the tailnet.
#
# Usage:
#   sudo ./scripts/install-tailscale.sh
#   sudo ./scripts/install-tailscale.sh --ssh-only
#
# Options (env):
#   ENABLE_TAILSCALE_SSH   true/false (default false)  -> tailscale up --ssh
#   DISABLE_PUBLIC_SSH     true/false (default false)  -> close port 22 on UFW
#   ADVERTISE_ROUTES       CIDR to advertise (optional, e.g. 10.0.0.0/24)

set -euo pipefail

log() { echo "[tailscale-install] $*"; }
fail() { echo "[tailscale-install] ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  fail "this script must run as root (use sudo)"
fi

ENABLE_TAILSCALE_SSH="${ENABLE_TAILSCALE_SSH:-false}"
DISABLE_PUBLIC_SSH="${DISABLE_PUBLIC_SSH:-false}"
ADVERTISE_ROUTES="${ADVERTISE_ROUTES:-}"

# ---------- install ----------
if command -v tailscale >/dev/null 2>&1; then
  log "Tailscale already installed: $(tailscale version | head -1)"
else
  log "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
  log "Tailscale installed."
fi

# ---------- up ----------
UP_ARGS=()
[ "$ENABLE_TAILSCALE_SSH" = "true" ] && UP_ARGS+=(--ssh)
[ -n "$ADVERTISE_ROUTES" ] && UP_ARGS+=(--advertise-routes="$ADVERTISE_ROUTES")

log "Starting Tailscale (authentication required)..."
if [ ${#UP_ARGS[@]} -gt 0 ]; then
  tailscale up "${UP_ARGS[@]}"
else
  tailscale up
fi

log "Tailscale status:"
tailscale status || true

# ---------- firewall ----------
if [ "$DISABLE_PUBLIC_SSH" = "true" ]; then
  log "Restricting SSH to Tailscale interface..."
  if command -v ufw >/dev/null 2>&1; then
    ufw delete allow 22/tcp 2>/dev/null || true
    ufw allow in on tailscale0 to any port 22 proto tcp 2>/dev/null || true
    ufw reload >/dev/null 2>&1 || true
    log "Port 22 closed to public; allowed on tailscale0."
  else
    warn "ufw not found; skipping firewall changes."
  fi
fi

log "Done."
log "Verify from your machine: tailscale status && ssh laverdu@<tailscale-ip>"