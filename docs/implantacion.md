# Implantación de una instancia de La Verdu

**Producto / agente:** La Verdu
**Tipo:** Guía general para implantar una nueva instancia en un VPS (perfil B)

Esta guía es genérica. Reemplazá los placeholders `<...>` por los valores del negocio.

Placeholders usados:
- `<BUSINESS_NAME>`: nombre comercial del negocio (ej. "Apolonia").
- `<DB_NAME>`: slug de la base de datos (ej. `apolonia`), minúsculas, sin espacios.
- `<DB_USER>`: usuario Postgres (default `laverdu`).
- `<DB_PASSWORD>`: contraseña del usuario Postgres.
- `<DOMAIN>`: dominio público (ej. `apolonia.tu-dominio.com`).
- `<OWNER_NAME>`, `<BUSINESS_PHONE>`, `<BUSINESS_ADDRESS>`.

---

## 1. Prerrequisitos del servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs postgresql-16 postgresql-client-16 podman podman-compose uidmap caddy

curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

## 2. Usuario y directorio

```bash
sudo useradd -m -s /bin/bash laverdu
sudo mkdir -p /opt/la-verdu
sudo chown laverdu:laverdu /opt/la-verdu
```

## 3. Clonar el repositorio

```bash
sudo -u laverdu git clone <repo-url> /opt/la-verdu
cd /opt/la-verdu
```

## 4. Crear la base de datos (nombre del negocio)

La base de datos debe llevar el slug del negocio, no `laverdu`. El resto (usuario, servicio, directorio) puede mantenerse como `laverdu`.

```bash
sudo DB_NAME=<DB_NAME> DB_USER=<DB_USER> DB_PASSWORD='<DB_PASSWORD>' \
  /opt/la-verdu/scripts/init-db.sh
```

Esto crea `<DB_NAME>` y `<DB_NAME>_test`.

## 5. Configurar variables de entorno

```bash
sudo -u laverdu cp /opt/la-verdu/.env.example /opt/la-verdu/.env
sudo -u laverdu chmod 600 /opt/la-verdu/.env
```

Editar `/opt/la-verdu/.env`:

```bash
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>
TZ_APP=America/Argentina/Buenos_Aires
LOG_LEVEL=info

SESSION_SECRET=<SECRETO_LARGO_Y_UNICO>

WHATSAPP_APP_SECRET=<...>
WHATSAPP_VERIFY_TOKEN=<...>
WHATSAPP_ACCESS_TOKEN=<...>
WHATSAPP_PHONE_NUMBER_ID=<...>
WHATSAPP_API_VERSION=v22.0

CHAT_BASE_URL=<URL_LLM>
CHAT_API_KEY=<KEY_LLM>
CHAT_MODEL=<MODELO_LLM>

STT_BASE_URL=<URL_STT>
STT_API_KEY=<KEY_STT>
STT_MODEL=<MODELO_STT>
```

## 6. Bootstrap automatizado (opcional)

En lugar de ejecutar los pasos 7–9 manualmente, usar el script:

```bash
cd /opt/la-verdu
sudo BUSINESS_NAME='<BUSINESS_NAME>' \
  DB_NAME=<DB_NAME> \
  DB_USER=<DB_USER> \
  DB_PASSWORD='<DB_PASSWORD>' \
  BUSINESS_OWNER_NAME='<OWNER_NAME>' \
  BUSINESS_PHONE='<BUSINESS_PHONE>' \
  BUSINESS_ADDRESS='<BUSINESS_ADDRESS>' \
  ADMIN_PASSWORD='<ADMIN_PASSWORD>' \
  /opt/la-verdu/scripts/bootstrap-instance.sh
```

El script valida variables, crea la DB, instala dependencias, buildea, migra y seedea. Los pasos de HTTPS, systemd, WhatsApp y backups quedan manuales (secciones 10–14).

### Opciones adicionales del bootstrap

| Variable                                          | Default                 | Efecto                                                                                        |
| ------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `GENERATE_ENV`                                    | `true`                  | Genera `/opt/la-verdu/.env` si no existe (con placeholders para secretos).                    |
| `FORCE_ENV`                                       | `false`                 | Sobrescribe `.env` existente (usar con cuidado).                                              |
| `SETUP_CRON`                                      | `false`                 | Crea `/etc/cron.d/la-verdu-backup` con backup diario + restore drill semanal (requiere root). |
| `GPG_RECIPIENT`                                   | `backup@la-verdu`       | UID de la clave GPG usada por el cron.                                                        |
| `BACKUP_DIR`                                      | `/var/backups/la-verdu` | Destino local de backups.                                                                     |
| `OFFSITE_ENABLED`                                 | `false`                 | Activa copia offsite en el cron.                                                              |
| `OFFSITE_TARGET`                                  | ``                      | Remote rclone o destino rsync.                                                                |
| `PORT`                                            | `3000`                  | Puerto de la app en el `.env` generado.                                                       |
| `TZ_APP`, `LOG_LEVEL`                             | defaults                | Se propagan al `.env`.                                                                        |
| `SESSION_SECRET`, `WHATSAPP_*`, `CHAT_*`, `STT_*` | vacío/placeholder       | Se propagan al `.env` si se pasan.                                                            |

Ejemplo con generación de `.env` y cron:

```bash
sudo BUSINESS_NAME='Apolonia' \
  DB_NAME=apolonia \
  DB_PASSWORD='CONTRASEÑA' \
  ADMIN_PASSWORD='CONTRASEÑA_ADMIN' \
  SESSION_SECRET='secreto-largo' \
  WHATSAPP_APP_SECRET='...' \
  WHATSAPP_VERIFY_TOKEN='...' \
  WHATSAPP_ACCESS_TOKEN='...' \
  WHATSAPP_PHONE_NUMBER_ID='...' \
  CHAT_BASE_URL='https://llm.example/v1' \
  CHAT_API_KEY='...' \
  CHAT_MODEL='...' \
  STT_BASE_URL='https://stt.example/v1' \
  STT_API_KEY='...' \
  STT_MODEL='...' \
  SETUP_CRON=true \
  OFFSITE_ENABLED=true \
  OFFSITE_TARGET='la-verdu-backup:la-verdu' \
  /opt/la-verdu/scripts/bootstrap-instance.sh
```

Si no se pasan los secretos, el `.env` se genera con placeholders/vacíos y el script avisa. Completarlos antes de iniciar la app.

## 7. Build y migraciones (manual)

```bash
cd /opt/la-verdu
sudo -u laverdu npm ci
sudo -u laverdu npm run build

cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>" \
  sudo -u laverdu npm run db:migrate
```

## 8. Seed del negocio (manual)

```bash
cd /opt/la-verdu/apps/api
BUSINESS_NAME='<BUSINESS_NAME>' \
BUSINESS_OWNER_NAME='<OWNER_NAME>' \
BUSINESS_PHONE='<BUSINESS_PHONE>' \
BUSINESS_ADDRESS='<BUSINESS_ADDRESS>' \
DATABASE_URL="postgres://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>" \
  sudo -u laverdu npm run db:seed

ADMIN_USERNAME="admin" \
ADMIN_PASSWORD='<ADMIN_PASSWORD>' \
ADMIN_ROLE="OWNER" \
DATABASE_URL="postgres://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>" \
  sudo -u laverdu npm run db:seed-admin
```

## 9. HTTPS (Caddy)

```
# /etc/caddy/Caddyfile
<DOMAIN> {
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
Description=La Verdu API
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

## 12. WhatsApp Business

1. Crear app en Meta for Developers.
2. Agregar producto WhatsApp y verificar el número del negocio.
3. Obtener `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
4. Configurar webhook: `https://<DOMAIN>/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, suscribirse a `messages`.
5. Crear plantillas M-04, M-06, M-11, M-15, M-17 y esperar aprobación.

## 12.5 Agente de impresión (local del negocio)

Para imprimir tickets en el local, instalar el print-agent en una computadora pequeña con Linux conectada a la impresora.

Ver guía detallada: `docs/print-agent-deployment.md`.

Resumen:
1. Crear la sucursal en el admin y obtener `branch_id` + `branch_token`.
2. Buildear/copiar el binario `print-agent` en el equipo local.
3. Crear `/opt/print-agent/config.json` con `backend_url: "wss://<DOMAIN>"`.
4. Crear servicio systemd `print-agent`.
5. Verificar conexión en `/admin/ops/status`.

## 13. Backups

Usar `scripts/backup-secure.sh` y `scripts/verify-backup.sh`. La DB es `<DB_NAME>`, pero el prefijo de archivo y el servicio siguen `la-verdu`.

Ejemplo de cron:

```bash
echo "0 3 * * * root DATABASE_URL=postgres://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME> GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TARGET=la-verdu-backup:la-verdu /opt/la-verdu/scripts/backup-secure.sh >> /var/log/la-verdu-backup.log 2>&1" | sudo tee /etc/cron.d/la-verdu-backup
```

Ver detalle en `docs/backup-sop.md`.

## 14. Verificación final

```bash
curl -s https://<DOMAIN>/health/live
curl -s https://<DOMAIN>/health/ready
# {"status":"ready","checks":{"database":"ok"}}

curl -s https://<DOMAIN>/admin/business
# {"name":"<BUSINESS_NAME>",...}

curl -s https://<DOMAIN>/admin/ops/status
```

Enviar un mensaje de prueba al número de WhatsApp del negocio.

## 15. Checklist

- [ ] Servidor preparado.
- [ ] Usuario `laverdu` y directorio `/opt/la-verdu`.
- [ ] DB `<DB_NAME>` y `<DB_NAME>_test` creadas.
- [ ] `.env` configurado con `DATABASE_URL=.../<DB_NAME>`.
- [ ] Build y migraciones aplicadas.
- [ ] Seed del negocio y admin ejecutados.
- [ ] HTTPS funcionando.
- [ ] Servicio systemd activo.
- [ ] Firewall configurado.
- [ ] WhatsApp webhook verificado.
- [ ] Backups configurados y verificados.
- [ ] `/health/ready` responde 200.
- [ ] `/admin/business` devuelve `<BUSINESS_NAME>`.

## 16. Rollback

```bash
cd /opt/la-verdu
git log --oneline -5
git checkout <commit-anterior>
sudo -u laverdu npm ci && sudo -u laverdu npm run build

cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://<DB_USER>:<DB_PASSWORD>@127.0.0.1:5432/<DB_NAME>" \
  npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"

sudo systemctl restart la-verdu
```

---

**Última actualización:** 2026-11-05
