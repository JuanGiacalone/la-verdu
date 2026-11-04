# Instrucciones para despliegue a producción

Guía práctica para buildear y desplegar nuevas versiones de La Verdu (perfil B, híbrido), incluyendo las funcionalidades recientes: `reference_price` en productos y la tabla `business` para personalización por negocio.

## 1. Prerrequisitos del servidor

- Node.js 22+ (`.nvmrc`).
- PostgreSQL 16+.
- Podman o Docker con compose (o systemd para correr Node directo).
- Dominio propio con HTTPS (Cloudflare Tunnel o Caddy).
- Cuenta de Meta Business con número de WhatsApp verificado.

## 2. Preparar el servidor (primera vez)

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs postgresql-16 postgresql-client-16 podman podman-compose uidmap

sudo -u postgres psql -c "CREATE USER laverdu WITH PASSWORD 'CONTRASEÑA_SEGURA';"
sudo -u postgres psql -c "CREATE DATABASE laverdu OWNER laverdu;"
sudo -u postgres psql -c "CREATE DATABASE laverdu_test OWNER laverdu;"

git clone <repo-url> /opt/la-verdu
cd /opt/la-verdu
cp .env.example .env
# Editar .env con los valores reales (WhatsApp, LLM, STT, DB, secretos)
```

## 3. Buildear las apps

```bash
cd /opt/la-verdu
npm ci
npm run build
# - apps/api/dist/        (backend compilado)
# - apps/admin/dist/      (bundle estático de Vite)

# Agente de impresión (Go) — por sucursal
cd apps/print-agent
CGO_ENABLED=0 go build -o print-agent .
# o con Docker:
# docker build -t la-verdu-print-agent .
```

## 4. Aplicar migraciones

Incluye `0005_product_reference_price` y `0006_business`, además de las anteriores. Es idempotente.

```bash
cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://laverdu:CONTRASEÑA@host:5432/laverdu" npm run db:migrate
```

## 5. Seed del negocio (primera vez o reset de datos de prueba)

Configurar el negocio antes de seedear:

```bash
BUSINESS_NAME="Mi Verdulería" \
BUSINESS_OWNER_NAME="Juan Pérez" \
BUSINESS_PHONE="+54911..." \
BUSINESS_ADDRESS="Av. Siempre Viva 123" \
DATABASE_URL="postgres://laverdu:CONTRASEÑA@host:5432/laverdu" \
npm run db:seed
```

El seed carga sucursales, personal, productos, métodos de pago, clientes de prueba y el registro del negocio. Es idempotente (`onConflictDoNothing`).

## 6. Servir el admin

El admin es un build estático (Vite). Servilo con nginx/Caddy o que Fastify sirva `apps/admin/dist/`. Asegurate de que la ruta `/admin/*` apunte al bundle.

## 7. Levantar el servicio

### Con systemd (recomendado)

```bash
sudo tee /etc/systemd/system/la-verdu.service <<'EOF'
[Unit]
Description=La Verdu API
After=network.target postgresql.service

[Service]
Type=simple
User=laverdu
WorkingDirectory=/opt/la-verdu
ExecStart=/usr/bin/node apps/api/dist/server.js
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

### Con podman/compose

```bash
docker-compose -f infra/compose/dev.yml up -d
```

## 8. Configurar WhatsApp Business

1. Crear app en Meta for Developers y agregar el producto "WhatsApp".
2. Verificar el número de teléfono.
3. Obtener `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
4. Configurar webhook: `https://tu-dominio.com/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, suscribirse a "messages".
5. Crear plantillas de mensaje (M-04, M-06, M-11, M-15, M-17) y esperar aprobación.

La verificación de negocio con Meta puede tardar días o semanas: iniciá el proceso lo antes posible.

## 9. SSL/TLS

**Opción A — Cloudflare (recomendado):** agregar dominio a Cloudflare, crear tunnel apuntando a `http://localhost:3000`.

**Opción B — Caddy:**

```bash
sudo apt install -y caddy
# /etc/caddy/Caddyfile
tu-dominio.com {
    reverse_proxy localhost:3000
}
sudo systemctl restart caddy
```

## 10. Backups

```bash
echo "0 3 * * * root DATABASE_URL=postgres://... BACKUP_DIR=/var/backups/la-verdu /opt/la-verdu/scripts/backup.sh" | sudo tee /etc/cron.d/la-verdu-backup
```

## 11. Verificar

```bash
curl https://tu-dominio.com/health/ready
# {"status":"ready","checks":{"database":"ok"}}

curl https://tu-dominio.com/admin/business
# {"name":"Mi Verdulería",...}
```

## 12. Rollback

```bash
cd /opt/la-verdu
git log --oneline -5
git checkout <commit-anterior>
npm ci && npm run build

# Revertir migraciones si hace falta (N = cantidad a revertir):
cd apps/api
npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"

sudo systemctl restart la-verdu
```

## 13. Checklist de seguridad

- [ ] Secretos en variables de entorno, no en código.
- [ ] `.env` no está en git.
- [ ] PostgreSQL solo acepta conexiones locales.
- [ ] Firewall: solo puertos 22 (SSH), 80, 443 abiertos.
- [ ] SSH con clave pública, password deshabilitado.
- [ ] Backups cifrados y en ubicación separada.
- [ ] Logs sin datos personales en claro.
- [ ] Cifrado de disco (perfil A).
- [ ] Acceso físico restringido (perfil A).

## 14. Troubleshooting

**Webhook no recibe mensajes:** verificar túnel HTTPS (`curl https://tu-dominio.com/health/live`), firma (`WHATSAPP_APP_SECRET`), suscripción a "messages" en Meta, logs (`journalctl -u la-verdu -f`).

**Impresora no imprime:** verificar agente conectado (`curl .../admin/ops/status`), IP de impresora en admin, conexión TCP (`nc -zv <ip> 9100`), cola (`.../admin/print-jobs?status=FAILED`).

**LLM no responde:** verificar proveedor (`curl $CHAT_BASE_URL/health`), API key, logs de timeout. El sistema escala automáticamente al personal si el LLM falla.

**Base de datos llena:** verificar tamaño (`psql -c "SELECT pg_size_pretty(pg_database_size('laverdu'))"`), ejecutar purga (`curl -X POST .../admin/privacy/purge`), verificar backups y rotación.
