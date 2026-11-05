# Despliegue en Dokploy / Coolify

Guía específica para desplegar La Verdu en una plataforma PaaS (Dokploy o Coolify) sobre tu VPS. Usa contenedores Docker y el compose de producción provisto.

## 1. Prerrequisitos

- VPS con Docker instalado (Dokploy/Coolify lo instalan).
- Dominio apuntando al VPS (DNS A record).
- Repositorio Git accesible (GitHub/GitLab) o subida manual.
- Cuenta en Meta for Developers (WhatsApp).

## 2. Archivos relevantes

- `Dockerfile.api` — imagen de la API.
- `apps/admin/Dockerfile` — imagen del admin (Vite + nginx).
- `Dockerfile.backup` — imagen para backups.
- `infra/compose/prod.yml` — compose de producción (db + api + admin + backup).

## 3. Variables de entorno

Configurar en la plataforma (no commitear). Usar `.env.example` como base.

Mínimas para producción:

```
DB_NAME=apolonia
DB_USER=laverdu
DB_PASSWORD=CONTRASEÑA_SEGURA
DATABASE_URL=postgres://laverdu:CONTRASEÑA_SEGURA@db:5432/apolonia
NODE_ENV=production
PORT=3000
SESSION_SECRET=SECRETO_LARGO_UNICO
TZ_APP=America/Argentina/Buenos_Aires
LOG_LEVEL=info

WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
WHATSAPP_API_VERSION=v22.0

CHAT_BASE_URL=...
CHAT_API_KEY=...
CHAT_MODEL=...

STT_BASE_URL=...
STT_API_KEY=...
STT_MODEL=...

GPG_RECIPIENT=backup@la-verdu
OFFSITE_ENABLED=true
OFFSITE_TARGET=la-verdu-backup:la-verdu
```

## 4. Opción A — Despliegue con Compose (recomendado)

### 4.1 Crear el proyecto

1. En Dokploy/Coolify, crear un nuevo proyecto de tipo **Compose** (o "Docker Compose").
2. Conectar el repositorio Git.
3. Seleccionar el archivo `infra/compose/prod.yml` como compose file.
4. Configurar el **build context** a la raíz del repositorio (donde está `Dockerfile.api`).

### 4.2 Variables y dominio

1. Cargar las variables de entorno en la sección "Environment" de la plataforma.
2. Asignar el dominio al servicio `admin` (ej. `apolonia.tu-dominio.com`). La plataforma configura el reverse proxy y SSL automáticamente.
3. El servicio `api` queda interno (no expuesto) salvo que quieras acceder a `/health/ready` directamente.

### 4.3 Desplegar

1. Lanzar el deploy. La plataforma buildea las imágenes y levanta `db`, `api`, `admin`.
2. Verificar logs del servicio `api`: debe mostrar "migrations applied" si se corren al arranque, o correrlas manualmente (sección 6).

### 4.4 Volúmenes

- `db-data`: datos de Postgres (persistente).
- `backups`: backups locales (persistente).

No borrar estos volúmenes al redeploy.

## 5. Opción B — Servicios separados

Si la plataforma no soporta compose multi-service, crear tres servicios:

1. **Database**: imagen `postgres:16-alpine`, variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, volumen `/var/lib/postgresql/data`.
2. **API**: build desde `Dockerfile.api`, variables de entorno, depende de la DB. Dominio opcional para `/health/ready`.
3. **Admin**: build desde `apps/admin/Dockerfile`, dominio principal. Configurar el reverse proxy de la plataforma para que `/api`, `/admin`, `/health`, `/webhooks`, `/metrics`, `/ws` apunten al servicio API (si la plataforma lo permite) o usar el nginx incluido en la imagen admin.

La opción A es más simple porque el nginx del admin ya proxea al servicio `api`.

## 6. Migraciones y seed

Las migraciones no se corren automáticamente al arrancar la API (para evitar carreras). Opciones:

- **Manual via consola de la plataforma**: ejecutar en el contenedor `api`:
  ```bash
  # Producción (compilado)
  node apps/api/dist/src/db/migrate.js
  node apps/api/dist/src/db/seed.js
  node apps/api/dist/src/db/seed-admin.js
  
  # Desarrollo (con tsx)
  npm run db:migrate -w @la-verdu/api
  npm run db:seed -w @la-verdu/api
  npm run db:seed-admin -w @la-verdu/api
  ```
- **Seed (solo primera vez)**:
  ```bash
  BUSINESS_NAME='Apolonia' ... npm run db:seed -w @la-verdu/api
  ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run db:seed-admin -w @la-verdu/api
  ```
- O usar el script `scripts/bootstrap-instance.sh` dentro del contenedor `api` (requiere bash y las herramientas).

## 7. Backups en la plataforma

El servicio `backup` del compose usa `Dockerfile.backup` y corre `backup-secure.sh`. Como tiene `restart: "no"` y profile `backup`, no se levanta automáticamente.

Opciones:

1. **Cron de la plataforma**: programar un job que ejecute el contenedor `backup` con las variables de entorno. Dokploy/Coolify tienen sección "Cron Jobs" o "Scheduled Tasks".
2. **Ejecución manual**: lanzar el servicio `backup` desde la UI cuando se quiera.
3. **Contenedor dedicado con crond**: modificar `Dockerfile.backup` para instalar `dcron` y correr en loop (no incluido por defecto).

Configurar offsite (`OFFSITE_ENABLED=true`, `OFFSITE_TARGET=...`) igual que en el SOP de backups.

## 8. Dominios y SSL

- Asignar el dominio principal al servicio `admin`.
- La plataforma emite el certificado SSL automáticamente (Let's Encrypt).
- El webhook de WhatsApp debe apuntar a `https://<DOMAIN>/webhooks/whatsapp`.

## 9. Verificación

```bash
curl -s https://<DOMAIN>/health/live
curl -s https://<DOMAIN>/health/ready
curl -s https://<DOMAIN>/admin/business
```

Enviar un mensaje de prueba al número de WhatsApp del negocio.

## 10. Rollback

- En Dokploy/Coolify, usar el botón de rollback a un deploy anterior.
- Si la migración falló, correr `rollbackMigrations` en el contenedor `api`:
  ```bash
  npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"
  ```

## 11. Troubleshooting

- **Build falla**: verificar que el build context sea la raíz del repo y que `Dockerfile.api`/`apps/admin/Dockerfile` existan.
- **API no conecta a DB**: verificar `DATABASE_URL` y que el servicio `db` esté healthy.
- **Admin no carga**: revisar logs de nginx y que el build de Vite haya generado `dist`.
- **Webhook 404**: verificar `WHATSAPP_APP_SECRET` y que el proxy pase `/webhooks/`.
- **WebSockets (impresora)**: verificar que el proxy soporte upgrade (el nginx incluido lo hace).

## 11.5 WebSocket y agente de impresión (Coolify + Cloudflare)

El print-agent se conecta por WSS a `/ws/print`. Para que funcione:

- **Coolify/Traefik**: enruta `/ws/*` al servicio `api` automáticamente. El heartbeat del agente (cada 30 s) mantiene la conexión.
- **Cloudflare**: soporta WebSocket en plan gratuito; timeout de inactividad ~100 s. El heartbeat evita el corte.
- **Túnel**: apuntar a Coolify/Traefik, no directamente al contenedor.
- **Config del agente**: `backend_url` debe ser `wss://<DOMAIN>`.
- Ver guía completa: `docs/print-agent-deployment.md`.

## 11.6 Caddy como alternativa a Traefik

Si preferís Caddy (más simple y completo para HTTPS/WebSocket):

1. Deshabilitar el reverse proxy automático de Coolify (o usar Coolify solo para contenedores).
2. Instalar Caddy en el VPS:
   ```bash
   sudo apt install -y caddy
   ```
3. Configurar `/etc/caddy/Caddyfile`:
   ```
   apolonia.tu-dominio.com {
       reverse_proxy localhost:3000
   }
   ```
   Si Coolify expone la API en otro puerto, ajustar.
4. Reiniciar: `sudo systemctl restart caddy`.

Caddy maneja SSL (Let's Encrypt) y WebSocket automáticamente. Ideal si usás Cloudflare Tunnel apuntando a Caddy.

## 11.6 Exponer la API en Tailscale (para print-agent)

Si usás Tailscale para el print-agent:

- Usar el override `infra/compose/prod.tailscale.yml`:
  ```bash
  TAILSCALE_BIND_IP=100.x.x.x docker compose -f infra/compose/prod.yml -f infra/compose/prod.tailscale.yml up -d
  ```
- O en Coolify, mapear el puerto 3000 del servicio `api` a la IP de Tailscale.
- Restringir el firewall: `ufw allow in on tailscale0 to any port 3000 proto tcp` y `ufw deny 3000/tcp`.
- Ver `docs/tailscale-vps-access.md` sección 5.5.

## 11.7 Edge: Caddy + Cloudflare Tunnel (script automatizado)

Para preparar el VPS con Caddy y Cloudflare Tunnel:

```bash
sudo DOMAIN=apolonia.tu-dominio.com \
     UPSTREAM=http://localhost:3000 \
     /opt/la-verdu/scripts/install-edge.sh
```

El script:
1. Instala Caddy y cloudflared (si faltan).
2. Configura `/etc/caddy/Caddyfile` con el dominio y upstream.
3. Reinicia Caddy.
4. Crea/configura el túnel de Cloudflare (si hay login previo) y el servicio systemd.
5. Si falta login, imprime los comandos manuales.

Variables opcionales: `TUNNEL_NAME`, `TUNNEL_ID`, `INSTALL_CADDY`, `INSTALL_CF`, `SETUP_CADDY`, `SETUP_TUNNEL`, `CADDY_PORT`.

Ver `docs/print-agent-deployment.md` para el diagrama y flujo detallado.

## 12. Notas

- El servicio `backup` no se levanta por defecto (profile `backup`). Activalo manualmente o via cron de la plataforma.
- Para producción con alto tráfico, considerar un Postgres gestionado externo en vez del contenedor `db`.
- Mantener los volúmenes `db-data` y `backups` en backups externos (snapshots del VPS).