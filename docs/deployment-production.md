# Guía de despliegue a producción

## Prerrequisitos

### Cuentas y servicios

- Cuenta de Meta Business (para WhatsApp Business API).
- Número de teléfono verificado en Meta.
- Dominio propio con DNS configurable (para el webhook HTTPS).
- Servidor o VPS (perfil B) o máquina local (perfil A).

### Software del servidor

- Node.js 22+ (`.nvmrc`).
- PostgreSQL 16+.
- Podman o Docker con compose.
- (Perfil A) Ollama o llama.cpp para LLM local.
- (Perfil A) faster-whisper o whisper.cpp para STT local.
- (Perfil A) Cloudflare Tunnel o Caddy para HTTPS.

## Perfil B (híbrido) - Recomendado para el primer despliegue

### 1. Preparar el servidor

```bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar PostgreSQL 16
sudo apt install -y postgresql-16 postgresql-client-16

# Instalar podman y compose
sudo apt install -y podman podman-compose uidmap
```

### 2. Configurar PostgreSQL

```bash
# La base de datos debe llevar el nombre del negocio (slug), no "laverdu".
# Ejemplo: DB_NAME=verduleria_don_jose DB_USER=laverdu DB_PASSWORD='...' /opt/la-verdu/scripts/init-db.sh
sudo -u postgres psql -c "CREATE USER laverdu WITH PASSWORD 'CONTRASEÑA_SEGURA';"
sudo -u postgres psql -c "CREATE DATABASE <DB_NAME> OWNER laverdu;"
sudo -u postgres psql -c "CREATE DATABASE <DB_NAME>_test OWNER laverdu;"
```

### 3. Clonar y configurar

```bash
git clone <repo-url> /opt/la-verdu
cd /opt/la-verdu
cp .env.example .env
# Editar .env con los valores reales
```

### 4. Configurar WhatsApp Business

1. Crear una app en Meta for Developers (https://developers.facebook.com).
2. Agregar el producto "WhatsApp" a la app.
3. Configurar el número de teléfono (verificación por SMS o llamada).
4. Obtener el `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
5. Configurar el webhook:
   - URL: `https://tu-dominio.com/webhooks/whatsapp`
   - Verify token: el valor de `WHATSAPP_VERIFY_TOKEN` en tu `.env`
   - Suscribirse a "messages".
6. Crear las plantillas de mensaje (M-04, M-06, M-11, M-15, M-17) y esperar aprobación.

**Importante:** La verificación de negocio con Meta puede tardar días o semanas. Iniciar el proceso lo antes posible.

### 5. Instalar dependencias y migrar

```bash
npm ci
cd apps/api
npm run db:migrate
npm run db:seed  # Solo para desarrollo. En producción, crear datos manualmente.
```

### 6. Configurar SSL/TLS

Opción A: Cloudflare (recomendado)
- Agregar el dominio a Cloudflare.
- Crear un tunnel: `cloudflared tunnel create la-verdu`
- Configurar el tunnel para apuntar a `http://localhost:3000`.
- El tunnel provee HTTPS automáticamente.

Opción B: Caddy
```bash
# Instalar Caddy
sudo apt install -y caddy

# /etc/caddy/Caddyfile
tu-dominio.com {
    reverse_proxy localhost:3000
}
sudo systemctl restart caddy
```

### 7. Levantar el servicio

```bash
# Con systemd (recomendado para producción)
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

### 8. Configurar backups

```bash
# Cron diario a las 3 AM
echo "0 3 * * * root DATABASE_URL=postgres://... BACKUP_DIR=/var/backups/la-verdu /opt/la-verdu/scripts/backup.sh" | sudo tee /etc/cron.d/la-verdu-backup
```

### 9. Verificar

```bash
curl https://tu-dominio.com/health/ready
# Debe responder: {"status":"ready","checks":{"database":"ok"}}

# Enviar un mensaje de prueba al número de WhatsApp
# Verificar que el webhook recibe el mensaje
```

## Perfil A (en sitio)

Ver `docs/runbook-onsite.md` para instrucciones detalladas.

Diferencias clave con perfil B:
- El backend corre en una máquina local del negocio.
- El LLM y STT corren localmente (Ollama + faster-whisper).
- Se necesita un túnel HTTPS para el webhook (Cloudflare Tunnel).
- La impresora está en la misma red local.
- Los backups son locales + copia remota.

## Checklist de seguridad

- [ ] Secretos en variables de entorno, no en código.
- [ ] `.env` no está en git (verificar `.gitignore`).
- [ ] PostgreSQL solo acepta conexiones locales.
- [ ] Firewall: solo puertos 22 (SSH), 80, 443 abiertos.
- [ ] SSH con clave pública, password deshabilitado.
- [ ] Backups cifrados y en ubicación separada.
- [ ] Logs no contienen datos personales en claro.
- [ ] Cifrado de disco (perfil A).
- [ ] Acceso físico restringido (perfil A).

## Rollback

Si una actualización falla:

```bash
cd /opt/la-verdu
git log --oneline -5  # Identificar el commit anterior
git checkout <commit-anterior>
npm ci
npm run build
sudo systemctl restart la-verdu
```

Para revertir migraciones de base de datos:

```bash
cd apps/api
# Rollback N migraciones
npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"
```

## Troubleshooting

### El webhook no recibe mensajes

1. Verificar que el túnel HTTPS funciona: `curl https://tu-dominio.com/health/live`
2. Verificar la firma: revisar `WHATSAPP_APP_SECRET`.
3. Verificar que el webhook está suscrito a "messages" en Meta.
4. Revisar logs: `journalctl -u la-verdu -f`.

### La impresora no imprime

1. Verificar que el agente está conectado: `curl http://localhost:3000/admin/ops/status`.
2. Verificar la IP de la impresora en el admin.
3. Probar conexión TCP: `nc -zv <ip-impresora> 9100`.
4. Revisar la cola: `curl http://localhost:3000/admin/print-jobs?status=FAILED`.

### El LLM no responde

1. Verificar que el proveedor está disponible: `curl $CHAT_BASE_URL/health`.
2. Verificar la API key.
3. Revisar logs del API para errores de timeout.
4. El sistema escala automáticamente al personal si el LLM falla.

### Base de datos llena

1. Verificar tamaño: `psql -c "SELECT pg_size_pretty(pg_database_size('laverdu'))"`.
2. Ejecutar purga: `curl -X POST http://localhost:3000/admin/privacy/purge -d '{"retentionMonths":6}'`.
3. Verificar backups y rotación.
