# Implantación — Instancia "Apolonia" (ejemplo)

> Guía general: `docs/implantacion.md`. Este documento es un ejemplo concreto para el negocio Apolonia.

**Producto / agente:** La Verdu
**Negocio:** Apolonia
**Slug de instancia:** `apolonia`
**Base de datos:** `apolonia` (+ `apolonia_test`)
**Usuario Postgres:** `laverdu`
**Directorio de instalación:** `/opt/la-verdu`
**Servicio systemd:** `la-verdu`
**Prefijo de backups:** `la-verdu_` (producto), DB `apolonia`

Este documento es un ejemplo completo y detallado para implantar una instancia de La Verdu para el negocio **Apolonia** en un VPS (perfil B).

---

## 1. Datos de la instancia

| Campo | Valor |
|---|---|
| Nombre del negocio | Apolonia |
| Slug (DB) | `apolonia` |
| Teléfono del negocio | `+54911...` (completar) |
| Dirección | (completar) |
| Owner / responsable | (completar) |
| Dominio público | `apolonia.tu-dominio.com` |
| VPS | (IP / proveedor) |
| LLM provider | OpenAI-compatible (URL + key + modelo) |
| STT provider | OpenAI-compatible (URL + key + modelo) |

## 2. Prerrequisitos del servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs postgresql-16 postgresql-client-16 podman podman-compose uidmap caddy

# Node 22 si el repo de Ubuntu no lo trae
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

node --version   # >= 22
psql --version   # >= 16
```

## 3. Usuario y directorio

```bash
sudo useradd -m -s /bin/bash laverdu
sudo mkdir -p /opt/la-verdu
sudo chown laverdu:laverdu /opt/la-verdu
```

## 4. PostgreSQL — crear DB para Apolonia

```bash
# Usar el script provisto (DB name = slug del negocio)
sudo DB_NAME=apolonia DB_USER=laverdu DB_PASSWORD='CONTRASEÑA_SEGURA' \
  /opt/la-verdu/scripts/init-db.sh
```

Esto crea:
- Usuario `laverdu` (si no existe).
- DB `apolonia` (owner `laverdu`).
- DB `apolonia_test` (owner `laverdu`).

Verificar:

```bash
sudo -u postgres psql -c "\l" | grep apolonia
sudo -u laverdu psql -d apolonia -c "select current_database(), current_user;"
```

## 5. Clonar y configurar

```bash
sudo -u laverdu git clone <repo-url> /opt/la-verdu
cd /opt/la-verdu
sudo -u laverdu cp .env.example .env
sudo -u laverdu chmod 600 .env
sudo chown laverdu:laverdu /opt/la-verdu/.env
```

Editar `/opt/la-verdu/.env` con los valores reales (ver sección 6).

## 6. Variables de entorno (Apolonia)

Archivo `/opt/la-verdu/.env`:

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia
TZ_APP=America/Argentina/Buenos_Aires
LOG_LEVEL=info

SESSION_SECRET=CAMBIAR_POR_SECRETO_LARGO_Y_UNICO

WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_API_VERSION=v22.0

CHAT_BASE_URL=https://proveedor-llm.example/v1
CHAT_API_KEY=...
CHAT_MODEL=...

STT_BASE_URL=https://proveedor-stt.example/v1
STT_API_KEY=...
STT_MODEL=...
```

Notas:
- `DATABASE_URL` apunta a `apolonia`, no a `laverdu`.
- `SESSION_SECRET` debe ser único por instalación.
- Los secretos de WhatsApp se obtienen de Meta for Developers.

## 7. Build y migraciones

```bash
cd /opt/la-verdu
sudo -u laverdu npm ci
sudo -u laverdu npm run build

# Migraciones sobre la DB de Apolonia
cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia" \
  sudo -u laverdu npm run db:migrate
```

## 8. Seed del negocio (Apolonia)

```bash
cd /opt/la-verdu/apps/api
BUSINESS_NAME="Apolonia" \
BUSINESS_OWNER_NAME="Nombre del dueño" \
BUSINESS_PHONE="+54911..." \
BUSINESS_ADDRESS="Dirección de Apolonia" \
DATABASE_URL="postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia" \
  sudo -u laverdu npm run db:seed
```

Admin:

```bash
ADMIN_USERNAME="admin" \
ADMIN_PASSWORD="CONTRASEÑA_ADMIN_FUERTE" \
ADMIN_ROLE="OWNER" \
DATABASE_URL="postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia" \
  sudo -u laverdu npm run db:seed-admin
```

## 9. HTTPS (Caddy)

```
# /etc/caddy/Caddyfile
apolonia.tu-dominio.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

## 10. Servicio systemd

```bash
sudo tee /etc/systemd/system/la-verdu.service <<'EOF'
[Unit]
Description=La Verdu API - Apolonia
After=network.target postgresql.service

[Service]
Type=simple
User=laverdu
WorkingDirectory=/opt/la-verdu
ExecStart=/usr/bin/node apps/api/dist/src/server.js
Restart=always
RestartSec=5
EnvironmentFile=/opt/la-verdu/.env

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable la-verdu
sudo systemctl start la-verdu
```

## 11. Firewall

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

SSH solo con clave pública (`PasswordAuthentication no`).

## 12. WhatsApp Business (Apolonia)

1. Crear app en Meta for Developers.
2. Agregar producto WhatsApp y verificar el número de Apolonia.
3. Obtener `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
4. Configurar webhook: `https://apolonia.tu-dominio.com/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, suscribirse a `messages`.
5. Crear plantillas M-04, M-06, M-11, M-15, M-17 y esperar aprobación.

Iniciar la verificación de negocio con Meta lo antes posible.

## 13. Backups (Apolonia)

La DB es `apolonia`, pero el prefijo de archivo sigue el producto (`la-verdu_`).

### 13.1 GPG

Usar la clave pública del backup (UID `backup@la-verdu` o crear `backup@apolonia` si se prefiere). Importar al VPS:

```bash
sudo -u laverdu gpg --import /tmp/la-verdu-backup.pub
```

### 13.2 Cron diario

```bash
echo "0 3 * * * root DATABASE_URL=postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TARGET=la-verdu-backup:la-verdu /opt/la-verdu/scripts/backup-secure.sh >> /var/log/la-verdu-backup.log 2>&1" | sudo tee /etc/cron.d/la-verdu-backup
```

### 13.3 Restore drill semanal

```bash
echo "0 4 * * 0 root VERIFY_DB_URL=postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia_verify GPG_RECIPIENT=backup@la-verdu /opt/la-verdu/scripts/verify-backup.sh \$(ls -t /var/backups/la-verdu/la-verdu_*.gpg | head -1) >> /var/log/la-verdu-backup.log 2>&1" | sudo tee -a /etc/cron.d/la-verdu-backup
```

## 14. Verificación final

```bash
curl -s https://apolonia.tu-dominio.com/health/live
curl -s https://apolonia.tu-dominio.com/health/ready
# {"status":"ready","checks":{"database":"ok"}}

curl -s https://apolonia.tu-dominio.com/admin/business
# {"name":"Apolonia",...}

curl -s https://apolonia.tu-dominio.com/admin/ops/status
```

Enviar un mensaje de prueba al número de WhatsApp de Apolonia y verificar que el webhook lo recibe.

## 15. Checklist de implantación (Apolonia)

- [ ] Servidor preparado (Node 22, Postgres 16, Caddy).
- [ ] Usuario `laverdu` y directorio `/opt/la-verdu` creados.
- [ ] DB `apolonia` y `apolonia_test` creadas.
- [ ] `.env` configurado con `DATABASE_URL=.../apolonia`.
- [ ] Build y migraciones aplicadas.
- [ ] Seed de negocio (Apolonia) y admin ejecutados.
- [ ] HTTPS funcionando.
- [ ] Servicio systemd activo.
- [ ] Firewall configurado.
- [ ] WhatsApp webhook verificado y plantillas enviadas.
- [ ] Backups configurados y primer backup verificado.
- [ ] Restore drill exitoso.
- [ ] `/health/ready` responde 200.
- [ ] `/admin/business` devuelve "Apolonia".

## 16. Rollback

```bash
cd /opt/la-verdu
git log --oneline -5
git checkout <commit-anterior>
sudo -u laverdu npm ci && sudo -u laverdu npm run build

cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://laverdu:CONTRASEÑA_SEGURA@127.0.0.1:5432/apolonia" \
  npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"

sudo systemctl restart la-verdu
```

---

**Última actualización:** 2026-11-05
**Instancia:** Apolonia (`apolonia`)