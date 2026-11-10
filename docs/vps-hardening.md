# Hardening del VPS — La Verdu (producción)

Checklist y procedimiento para asegurar el VPS que corre La Verdu (perfil B / Coolify).

## 1. Checklist de hardening

### Acceso
- [ ] SSH solo con clave pública (`PasswordAuthentication no`).
- [ ] Root login deshabilitado (`PermitRootLogin no`).
- [ ] Usuario no-root para administración (`laverdu`).
- [ ] Tailscale instalado y SSH restringido a la tailnet (ver `docs/tailscale-vps-access.md`).
- [ ] Fail2ban activo para SSH.

### Sistema
- [ ] Sistema operativo actualizado (`apt update && apt upgrade`).
- [ ] Actualizaciones automáticas de seguridad (unattended-upgrades).
- [ ] Zona horaria correcta (`timedatectl`).
- [ ] NTP sincronizado.

### Red
- [ ] Firewall UFW activo (ver `scripts/configure-firewall.sh`).
- [ ] Solo puertos 80/443 públicos.
- [ ] SSH (22) solo por Tailscale (o cerrado al público).
- [ ] API (3000) solo por Tailscale (si se usa print-agent).
- [ ] PostgreSQL (5432) solo localhost.

### Aplicación
- [ ] `.env` con permisos 600, owner `laverdu`.
- [ ] `SESSION_SECRET` único y fuerte.
- [ ] `ADMIN_PASSWORD` cambiado del default.
- [ ] Secretos no commiteados.
- [ ] Backups cifrados y offsite configurados.
- [ ] Restore drill exitoso.

### Contenedores (Coolify/Dokploy)
- [ ] Volúmenes persistentes para DB y backups.
- [ ] Imágenes actualizadas.
- [ ] No exponer puertos innecesarios.
- [ ] Variables de entorno gestionadas por la plataforma.

### Monitoreo
- [ ] Health checks configurados (`/health/ready`).
- [ ] Alertas de backup (si no hay backup en 25 h).
- [ ] Logs centralizados (`journalctl`).

## 2. Procedimiento detallado

### 2.1 Actualizar el sistema

```bash
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
```

### 2.2 Actualizaciones automáticas de seguridad

```bash
sudo apt install -y unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Verificar `/etc/apt/apt.conf.d/50unattended-upgrades`:
```
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Automatic-Reboot "false";
```

### 2.3 Hardening de SSH

Editar `/etc/ssh/sshd_config`:
```
PasswordAuthentication no
PermitRootLogin no
PubkeyAuthentication yes
AuthenticationMethods publickey
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
```

```bash
sudo systemctl restart sshd
```

### 2.4 Fail2ban

```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

Configurar `/etc/fail2ban/jail.local`:
```ini
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600
findtime = 600
```

```bash
sudo systemctl restart fail2ban
sudo fail2ban-client status sshd
```

### 2.5 Firewall (UFW)

Ver `scripts/configure-firewall.sh` y `docs/tailscale-vps-access.md`.

```bash
sudo EXPOSE_API_TAILSCALE=true /opt/la-verdu/scripts/configure-firewall.sh
```

### 2.6 Tailscale

Ver `docs/tailscale-vps-access.md` y `scripts/install-tailscale.sh`.

### 2.7 Permisos de archivos

```bash
sudo chmod 600 /opt/la-verdu/.env
sudo chown laverdu:laverdu /opt/la-verdu/.env
sudo chmod 600 /opt/print-agent/config.json 2>/dev/null || true
```

### 2.8 Hardening de kernel (sysctl)

Crear `/etc/sysctl.d/99-la-verdu.conf`:
```
# Network hardening
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1
net.ipv4.tcp_syncookies = 1
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Disable IP forwarding (not a router)
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0
```

```bash
sudo sysctl --system
```

### 2.9 Deshabilitar servicios innecesarios

```bash
# Listar servicios activos
systemctl list-units --type=service --state=running

# Deshabilitar lo que no se use (ejemplo)
sudo systemctl disable --now bluetooth 2>/dev/null || true
sudo systemctl disable --now cups 2>/dev/null || true
```

### 2.10 Cifrado de disco (opcional, recomendado)

Para perfil A (en sitio) es obligatorio. Para VPS, depende del proveedor:
- Hetzner: habilitar "Encrypted Volumes".
- DigitalOcean: no soporta cifrado de disco completo; usar LUKS manualmente.
- AWS/GCP: usar volúmenes cifrados (EBS/CMEK).

### 2.11 Backups y recuperación

Ver `docs/backup-sop.md` y `docs/contingency-production-plan.md`.

### 2.12 Monitoreo y alertas

- Configurar alertas para:
  - `/health/ready` != 200.
  - Disco > 80%.
  - Backup no generado en 25 h.
  - Cola de impresión con FAILED/ABANDONED.
  - Conversaciones escaladas > umbral.

## 3. Script automatizado

```bash
sudo /opt/la-verdu/scripts/harden-vps.sh
```

Ver `scripts/harden-vps.sh`.

## 4. Verificación

```bash
# SSH
sudo sshd -t
sudo systemctl status sshd

# Fail2ban
sudo fail2ban-client status

# UFW
sudo ufw status verbose

# Unattended upgrades
sudo unattended-upgrade --dry-run

# Tailscale
tailscale status
```

## 5. Checklist de mantenimiento periódico

- [ ] Semanal: revisar logs (`journalctl -u la-verdu --since "7 days ago"`).
- [ ] Semanal: verificar backups y restore drill.
- [ ] Mensual: actualizar paquetes (`apt update && apt upgrade`).
- [ ] Mensual: revisar usuarios y claves SSH.
- [ ] Trimestral: rotar secretos.
- [ ] Trimestral: probar rollback de migración.

---

**Última actualización:** 2026-11-05