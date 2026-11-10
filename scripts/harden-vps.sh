#!/usr/bin/env bash
# Harden a VPS for La Verdu production.
#
# This script applies safe, idempotent hardening steps:
#   - System update
#   - Unattended security upgrades
#   - SSH hardening (disable password, root login)
#   - Fail2ban
#   - Basic sysctl network hardening
#   - Timezone/NTP
#
# It does NOT modify firewall (use configure-firewall.sh) or Tailscale.
#
# Usage:
#   sudo ./scripts/harden-vps.sh
#
# Optional env:
#   SSH_PORT           (default 22)
#   TIMEZONE           (default America/Argentina/Buenos_Aires)
#   INSTALL_FAIL2BAN   true/false (default true)
#   ENABLE_UNATTENDED  true/false (default true)

set -euo pipefail

log() { echo "[harden] $*"; }
fail() { echo "[harden] ERROR: $*" >&2; exit 1; }
warn() { echo "[harden] WARN: $*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
  fail "this script must run as root (use sudo)"
fi

SSH_PORT="${SSH_PORT:-22}"
TIMEZONE="${TIMEZONE:-America/Argentina/Buenos_Aires}"
INSTALL_FAIL2BAN="${INSTALL_FAIL2BAN:-true}"
ENABLE_UNATTENDED="${ENABLE_UNATTENDED:-true}"

# ---------- system update ----------
log "Updating system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq

# ---------- timezone & NTP ----------
log "Setting timezone to $TIMEZONE..."
timedatectl set-timezone "$TIMEZONE" 2>/dev/null || true
apt-get install -y -qq systemd-timesyncd >/dev/null 2>&1 || true
systemctl enable systemd-timesyncd >/dev/null 2>&1 || true
systemctl start systemd-timesyncd >/dev/null 2>&1 || true

# ---------- unattended upgrades ----------
if [ "$ENABLE_UNATTENDED" = "true" ]; then
  log "Configuring unattended-upgrades..."
  apt-get install -y -qq unattended-upgrades >/dev/null
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  cat > /etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
  systemctl enable unattended-upgrades >/dev/null 2>&1 || true
  systemctl restart unattended-upgrades >/dev/null 2>&1 || true
fi

# ---------- SSH hardening ----------
log "Hardening SSH..."
SSHD_CONFIG="/etc/ssh/sshd_config"
# Backup
cp -a "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%Y%m%d)" 2>/dev/null || true

# Apply settings (idempotent via sed)
set_ssh() {
  local key="$1" value="$2"
  if grep -qE "^[#[:space:]]*${key}" "$SSHD_CONFIG"; then
    sed -i "s|^[#[:space:]]*${key}.*|${key} ${value}|" "$SSHD_CONFIG"
  else
    echo "${key} ${value}" >> "$SSHD_CONFIG"
  fi
}

set_ssh "PasswordAuthentication" "no"
set_ssh "PermitRootLogin" "no"
set_ssh "PubkeyAuthentication" "yes"
set_ssh "MaxAuthTries" "3"
set_ssh "ClientAliveInterval" "300"
set_ssh "ClientAliveCountMax" "2"

# Validate and restart
if sshd -t 2>/dev/null; then
  systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
  log "SSH hardened and restarted."
else
  warn "sshd config validation failed; restoring backup."
  cp "${SSHD_CONFIG}.bak."* "$SSHD_CONFIG" 2>/dev/null || true
fi

# ---------- fail2ban ----------
if [ "$INSTALL_FAIL2BAN" = "true" ]; then
  log "Installing and configuring fail2ban..."
  apt-get install -y -qq fail2ban >/dev/null
  cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
EOF
  systemctl enable fail2ban >/dev/null 2>&1 || true
  systemctl restart fail2ban >/dev/null 2>&1 || true
  log "Fail2ban configured."
fi

# ---------- sysctl hardening ----------
log "Applying sysctl network hardening..."
cat > /etc/sysctl.d/99-la-verdu.conf <<'EOF'
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0
EOF
sysctl --system >/dev/null 2>&1 || true

# ---------- disable unnecessary services ----------
log "Disabling unnecessary services..."
for svc in bluetooth cups avahi-daemon; do
  systemctl disable --now "$svc" >/dev/null 2>&1 || true
done

# ---------- cleanup ----------
apt-get autoremove -y -qq >/dev/null 2>&1 || true
apt-get autoclean -qq >/dev/null 2>&1 || true

log "Hardening complete."
log "Verify:"
log "  sshd -t"
log "  fail2ban-client status"
log "  sysctl net.ipv4.tcp_syncookies"