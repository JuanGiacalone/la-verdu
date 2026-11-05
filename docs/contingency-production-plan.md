# Plan de contingencias y riesgos — La Verdu (producción, perfil B / VPS)

**Proyecto:** La Verdu — asistente WhatsApp para verdulerías (PRD v1.0)
**Perfil:** B (híbrido) sobre VPS con PostgreSQL administrado localmente en el mismo servidor
**Última actualización:** 2026-11-05
**Estado:** Borrador operativo — revisar antes del primer despliegue real
**Documentos relacionados:** `docs/deployment-production.md`, `docs/instrucciones-despliegue-produccion.md`, `docs/runbook-onsite.md`, `PRD.md` (RNF-19, RNF-20, sección 13 y 16)

---

## 1. Alcance y supuestos

- Este plan cubre el **perfil B**: backend Node.js + PostgreSQL en un VPS, LLM/STT provistos por un proveedor externo (OpenAI-compatible), WhatsApp Business Cloud API, impresión vía agente Go por sucursal.
- El **perfil A** (en sitio, LLM/STT locales) se trata solo como contraste; su runbook detallado vive en `docs/runbook-onsite.md`.
- Se asume un único VPS por negocio (sin alta disponibilidad). La continuidad se apoya en backups verificados y en la capacidad de restaurar en un servidor nuevo en < 4 h.
- No se cubre CI/CD ni infraestructura como código; el despliegue es manual asistido por systemd + cron.
- Todo comando asume usuario `laverdu` y directorio `/opt/la-verdu` salvo que se indique otro.

## 2. Inventario de la aplicación

| Componente | Tecnología | Puerto (prod) | Rol |
|---|---|---|---|
| API | Node.js 22 / Fastify | 3000 (interno) | Backend, webhook WhatsApp, admin REST, health/metrics |
| Admin | Vite build estático | servido por Caddy/nginx | Panel de administración |
| PostgreSQL | 16 | 5432 (solo localhost) | Datos operativos |
| Impresión | Agente Go (`apps/print-agent`) | WebSocket/SSE a API | Cola de impresión por sucursal |
| LLM/STT | Proveedor externo OpenAI-compatible | HTTPS | Parsing de pedidos y transcripción de audio |
| WhatsApp | Meta Cloud API | HTTPS webhook | Canal de clientes y personal |
| HTTPS | Caddy o Cloudflare Tunnel | 443/80 | Terminación TLS, proxy a 3000 |
| Backups | `scripts/backup.sh` + cron | — | `pg_dump` diario |

## 3. Variables de entorno

Fuente de verdad: `apps/api/src/config.ts` (validación Zod al arranque, fail-fast). Si falta una variable obligatoria o es inválida, el proceso no inicia.

### 3.1 Producción (obligatorias / relevantes)

| Variable | Obligatoria | Default | Sensible | Validación | Notas |
|---|---|---|---|---|---|
| `NODE_ENV` | sí | `development` | no | enum | Debe ser `production` en prod |
| `PORT` | no | `3000` | no | 1–65535 | Puerto de escucha |
| `DATABASE_URL` | **sí** | — | **sí** | string no vacío | Postgres de producción |
| `TZ_APP` | no | `America/Argentina/Buenos_Aires` | no | IANA tz | Zona horaria de negocio |
| `LOG_LEVEL` | no | `info` | no | enum | `info` o `warn` en prod |
| `SESSION_SECRET` | **sí** | `dev-secret-only` | **sí** | — | Firmado de cookies de admin. **Nunca dejar el default en prod** |
| `WHATSAPP_APP_SECRET` | sí* | `""` | **sí** | — | Si vacío, el webhook no se registra |
| `WHATSAPP_VERIFY_TOKEN` | sí* | `""` | semi | — | Token de verificación del webhook en Meta |
| `WHATSAPP_ACCESS_TOKEN` | sí* | `""` | **sí** | — | Token de la API de WhatsApp |
| `WHATSAPP_PHONE_NUMBER_ID` | sí* | `""` | no | — | ID del número de teléfono |
| `WHATSAPP_API_VERSION` | no | `v22.0` | no | — | Versión de Graph API |
| `CHAT_BASE_URL` | sí | `http://localhost:8082` | no | — | Endpoint OpenAI-compatible del LLM |
| `CHAT_API_KEY` | sí* | `""` | **sí** | — | Vacío solo si el proveedor no requiere key |
| `CHAT_MODEL` | sí | `llm-stub` | no | — | Modelo a usar |
| `STT_BASE_URL` | sí | `http://localhost:8083` | no | — | Endpoint de transcripción |
| `STT_API_KEY` | sí* | `""` | **sí** | — | Vacío solo si el proveedor no requiere key |
| `STT_MODEL` | sí | `stt-stub` | no | — | Modelo STT |

\* Obligatoria si se usa la funcionalidad correspondiente.

### 3.2 Variables de seed / administración (solo primera carga o reset)

| Variable | Default | Uso |
|---|---|---|
| `ADMIN_USERNAME` | `admin` | `npm run db:seed-admin` |
| `ADMIN_PASSWORD` | `admin` | **Cambiar obligatoriamente** antes del seed en prod |
| `ADMIN_ROLE` | `OWNER` | `OWNER` u `OPERATOR` |
| `BUSINESS_NAME` | `La Verdu` | Seed del registro `business` |
| `BUSINESS_OWNER_NAME` | `Dueño de prueba` | Seed del registro `business` |
| `BUSINESS_PHONE` | `null` | Seed |
| `BUSINESS_ADDRESS` | `null` | Seed |

### 3.3 Variables de entorno solo desarrollo / testing (NO usar en prod)

`TEST_DATABASE_URL`, `WHATSAPP_SIM_*`, `PRINTER_SIM_*`, `LLM_STUB_*`, `STT_STUB_*`, `VITE_API_URL`, `DOCKER_HOST`, `PODMAN_SOCKET`, `BACKUP_DIR`, `RETENTION_DAYS` (estas dos últimas se usan en el script de backup; en prod se pasan por cron).

### 3.4 Reglas de manejo de secretos

1. El archivo `.env` vive en `/opt/la-verdu/.env`, fuera de git (verificar `.gitignore`).
2. Permisos: `chmod 600 /opt/la-verdu/.env`, owner `laverdu`.
3. Nunca loguear `DATABASE_URL`, tokens ni `SESSION_SECRET`. El logger de Fastify ya no imprime el error de readiness por conexión.
4. Rotación: si un secreto se compromete, rotarlo en el proveedor (Meta, LLM/STT) y actualizar `.env` + `systemctl restart la-verdu`.
5. El agente de impresión tiene su propio token (`branch_token` en `print-agent-config.json`); tratarlo como secreto y no commitearlo.

## 4. Base de datos (PostgreSQL 16)

### 4.1 Esquema y convenciones

- ORM: Drizzle (`apps/api/src/db/schema.ts`), migraciones en `apps/api/drizzle/` (0000–0007).
- Rollbacks manuales en `apps/api/drizzle-down/` (un `.down.sql` por migración).
- Tablas sensibles/operativas: `customer`, `message`, `order`, `order_item`, `conversation`, `audit_log`, `admin_user`, `agent_session`, `print_job`, `alert`, `business`.
- `audit_log` es append-only (migración 0002).
- `resetDatabase()` se niega a ejecutarse si el nombre de la DB no termina en `_test`.

### 4.1.1 Nombre de la base de datos (instancia)

El producto/agente se llama **La Verdu**, pero cada instancia pertenece a un negocio. La base de datos (y su DB de test) debe llevar el **slug del negocio**, no `laverdu`. Ejemplos:

- Negocio "Verdulería Don José" → `DB_NAME=verduleria_don_jose` → DB `verduleria_don_jose` y `verduleria_don_jose_test`.
- Negocio "La Verdu" (instancia propia) → puede seguir `laverdu`.

Crear con:
```bash
DB_NAME=verduleria_don_jose DB_USER=laverdu DB_PASSWORD='CONTRASEÑA' /opt/la-verdu/scripts/init-db.sh
```
El resto (usuario OS `laverdu`, servicio `la-verdu`, backups con prefijo `la-verdu_`) se mantiene con el nombre del producto.

### 4.2 Roles y conexiones

```sql
CREATE USER laverdu WITH PASSWORD 'CONTRASEÑA_SEGURA';
CREATE DATABASE laverdu OWNER laverdu;
CREATE DATABASE laverdu_test OWNER laverdu;  -- solo para CI/integration tests
```

- PostgreSQL escucha solo en `127.0.0.1` (no exponer 5432 al exterior).
- `maxConnections = 10` por defecto en el pool de la API (`createDatabase`).
- El usuario de la app no debe ser superuser; solo DDL durante migraciones.

### 4.3 Migraciones

Aplicar (idempotente):

```bash
cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu" npm run db:migrate
```

Revertir N migraciones (nueva → vieja):

```bash
cd /opt/la-verdu/apps/api
npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"
```

Reglas:
1. **Siempre backup antes de migrar** (ver 4.5).
2. Probar la migración en `laverdu_test` primero si es posible.
3. Las migraciones son forward-only en producción; el rollback es de emergencia y puede perder datos si la migración agregó columnas/tablas.
4. `resetDatabase` nunca se ejecuta contra la DB de producción.

### 4.4 Seed

Primera carga (idempotente, `onConflictDoNothing`):

```bash
BUSINESS_NAME="Mi Verdulería" \
BUSINESS_OWNER_NAME="Juan Pérez" \
BUSINESS_PHONE="+54911..." \
BUSINESS_ADDRESS="Av. Siempre Viva 123" \
DATABASE_URL="postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu" \
npm run db:seed
```

Admin:

```bash
ADMIN_USERNAME="admin" ADMIN_PASSWORD="CONTRASEÑA_FUERTE" ADMIN_ROLE="OWNER" \
DATABASE_URL="..." npm run db:seed-admin
```

### 4.5 Backups

Script existente: `scripts/backup.sh` (`pg_dump | gzip`, retención 30 días).
Procedimiento detallado (GPG + offsite): ver `docs/backup-sop.md`.

Cron recomendado (3 AM):

```bash
echo "0 3 * * * root DATABASE_URL=postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu BACKUP_DIR=/var/backups/la-verdu RETENTION_DAYS=30 /opt/la-verdu/scripts/backup.sh" | sudo tee /etc/cron.d/la-verdu-backup
```

### 4.5.1 Cifrado GPG (recomendado)

Se provee `scripts/backup-secure.sh`, que reemplaza a `scripts/backup.sh` en producción.

**Opción A — clave asimétrica (recomendada):**

1. Generar un par de claves dedicado al backup (en una máquina segura, no en el VPS):
   ```bash
   gpg --full-generate-key
   # Tipo: RSA 4096, sin expiración o con expiración larga.
   # UID: backup@la-verdu
   ```
2. Exportar la clave pública e importarla en el VPS:
   ```bash
   gpg --armor --export backup@la-verdu > la-verdu-backup.pub
   scp la-verdu-backup.pub laverdu@vps:/tmp/
   sudo -u laverdu gpg --import /tmp/la-verdu-backup.pub
   sudo -u laverdu gpg --list-keys backup@la-verdu
   ```
3. Guardar la clave privada en un lugar seguro (offline, bóveda, gestor de contraseñas). **Si se pierde, los backups son irrecuperables.**
4. Configurar el cron:
   ```bash
   echo "0 3 * * * root DATABASE_URL=postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu /opt/la-verdu/scripts/backup-secure.sh" | sudo tee /etc/cron.d/la-verdu-backup
   ```

**Opción B — passphrase simétrica (más simple, menos seguro):**

1. Generar una passphrase larga (>= 32 caracteres) y guardarla en un gestor de contraseñas.
2. Crear `/opt/la-verdu/.backup-passphrase` con permisos 600:
   ```bash
   echo 'PASSPHRASE_LARGA_AQUI' | sudo -u laverdu tee /opt/la-verdu/.backup-passphrase
   sudo chmod 600 /opt/la-verdu/.backup-passphrase
   ```
3. Cron:
   ```bash
   echo "0 3 * * * root DATABASE_URL=... BACKUP_PASSPHRASE=\$(cat /opt/la-verdu/.backup-passphrase) BACKUP_DIR=/var/backups/la-verdu /opt/la-verdu/scripts/backup-secure.sh" | sudo tee /etc/cron.d/la-verdu-backup
   ```
   Nota: pasar el passphrase por cron expone el valor en la línea de proceso; preferir Opción A.

**Restauración desde backup cifrado:**
```bash
# Descifrar
GPG_RECIPIENT=backup@la-verdu ./scripts/verify-backup.sh /var/backups/la-verdu/la-verdu_YYYYMMDD_HHMMSS.sql.gz.gpg
# O manual:
gpg --decrypt /var/backups/la-verdu/la-verdu_YYYYMMDD_HHMMSS.sql.gz.gpg > /tmp/restore.sql.gz
gunzip -c /tmp/restore.sql.gz | psql "$DATABASE_URL"
shred -u /tmp/restore.sql.gz
```

### 4.5.2 Copia offsite

**Con rclone (recomendado):**

1. Instalar rclone: `curl https://rclone.org/install.sh | sudo bash`.
2. Configurar un remote: `rclone config` (ej: `backup-remote` hacia S3, Backblaze B2, Google Drive, o un segundo servidor vía SFTP).
3. Probar: `rclone ls backup-remote:`.
4. Activar en el cron:
   ```bash
   echo "0 3 * * * root DATABASE_URL=... GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TARGET=backup-remote:la-verdu /opt/la-verdu/scripts/backup-secure.sh" | sudo tee /etc/cron.d/la-verdu-backup
   ```

**Con rsync a un segundo servidor:**

1. Generar clave SSH para el usuario de backup y autorizarla en el servidor secundario.
2. Cron:
   ```bash
   echo "0 3 * * * root DATABASE_URL=... GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TOOL=rsync OFFSITE_TARGET=backup@backup-server:/backups/la-verdu /opt/la-verdu/scripts/backup-secure.sh" | sudo tee /etc/cron.d/la-verdu-backup
   ```

**Reglas offsite:**
- El backup offsite debe estar cifrado (el script ya lo hace).
- Usar un bucket/región distinta del VPS.
- Verificar la copia: `rclone ls backup-remote:la-verdu` o `rsync --dry-run`.
- Retención offsite puede ser mayor (ej. 90 días) configurando un lifecycle rule en el bucket.

### 4.5.3 Verificación semanal

```bash
crontab -e
# Domingos 4 AM:
0 4 * * 0 root VERIFY_DB_URL=postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu_verify GPG_RECIPIENT=backup@la-verdu /opt/la-verdu/scripts/verify-backup.sh $(ls -t /var/backups/la-verdu/la-verdu_*.gpg | head -1)
```

El script `verify-backup.sh` recrea el schema, restaura y muestra counts de tablas clave. Falla si la restauración no completa.

### 4.5.4 Otras mejoras

1. **Formato custom**: modificar el script para usar `pg_dump -Fc` si se necesita restauración selectiva/paralela (requiere `pg_restore`).
2. **Retención escalonada**: mantener 7 diarios + 4 semanales + 3 mensuales (configurar lifecycle en el bucket offsite).
3. **Alerta si el backup no se genera**: monitorear que exista un `.gpg` con mtime < 25 h.

### 4.6 Restauración

```bash
# 1. Detener la app
sudo systemctl stop la-verdu

# 2. (Opcional) backup de seguridad del estado actual
DATABASE_URL=... /opt/la-verdu/scripts/backup.sh

# 3. Restaurar
gunzip -c /var/backups/la-verdu/la-verdu_YYYYMMDD_HHMMSS.sql.gz | psql "$DATABASE_URL"

# 4. Re-aplicar migraciones si el backup es de una versión anterior
cd /opt/la-verdu/apps/api && DATABASE_URL=... npm run db:migrate

# 5. Arrancar
sudo systemctl start la-verdu
curl https://tu-dominio.com/health/ready
```

Para restauración selectiva o paralela, usar `pg_restore` con formato custom.

### 4.7 Privacidad y retención de datos

- Endpoint de purga: `POST /admin/privacy/purge` con `{ "retentionMonths": N }` (1–60, default 12).
- Endpoints ARCO: `/admin/privacy/export/:customerId`, `/admin/privacy/rectify/:customerId`, `/admin/privacy/suppress/:customerId`.
- `audit_log` es append-only; no purgar sin decisión legal.
- Recomendación: cron mensual de purga con `retentionMonths: 6` o 12 según política del negocio y ley aplicable (Argentina: Ley 25.326).

## 5. Despliegue en VPS (perfil B)

### 5.1 Preparación del servidor

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y nodejs postgresql-16 postgresql-client-16 podman podman-compose uidmap caddy
# Node 22 si el repo de Ubuntu no lo trae:
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

### 5.2 Usuario y permisos

```bash
sudo useradd -m -s /bin/bash laverdu
sudo mkdir -p /opt/la-verdu
sudo chown laverdu:laverdu /opt/la-verdu
```

### 5.3 PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER laverdu WITH PASSWORD 'CONTRASEÑA_SEGURA';"
sudo -u postgres psql -c "CREATE DATABASE laverdu OWNER laverdu;"
sudo -u postgres psql -c "CREATE DATABASE laverdu_test OWNER laverdu;"
# Restringir a localhost en pg_hba.conf / postgresql.conf (listen_addresses = 'localhost')
sudo systemctl restart postgresql
```

### 5.4 Clonar y configurar

```bash
sudo -u laverdu git clone <repo-url> /opt/la-verdu
cd /opt/la-verdu
sudo -u laverdu cp .env.example .env
sudo -u laverdu chmod 600 .env
# Editar .env con valores reales
sudo chown laverdu:laverdu /opt/la-verdu/.env
```

### 5.5 Build

```bash
cd /opt/la-verdu
npm ci
npm run build
cd apps/api && DATABASE_URL=... npm run db:migrate
# Seed solo primera vez
```

### 5.6 HTTPS

Opción A — Cloudflare Tunnel (recomendado):

```bash
cloudflared tunnel create la-verdu
# Configurar ingress a http://localhost:3000
```

Opción B — Caddy:

```
# /etc/caddy/Caddyfile
tu-dominio.com {
    reverse_proxy localhost:3000
}
```

```bash
sudo systemctl restart caddy
```

### 5.7 Servicio systemd

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

### 5.8 Firewall

```bash
sudo ufw default deny incoming
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

SSH: solo clave pública, password deshabilitado (`/etc/ssh/sshd_config`: `PasswordAuthentication no`).

### 5.9 WhatsApp Business

1. Crear app en Meta for Developers, agregar producto WhatsApp.
2. Verificar número de teléfono.
3. Obtener `WHATSAPP_ACCESS_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID`.
4. Configurar webhook: `https://tu-dominio.com/webhooks/whatsapp`, verify token = `WHATSAPP_VERIFY_TOKEN`, suscribirse a `messages`.
5. Crear plantillas M-04, M-06, M-11, M-15, M-17 y esperar aprobación.

**Iniciar la verificación de negocio con Meta lo antes posible** (puede tardar días/semanas).

### 5.10 Agente de impresión (por sucursal)

- Buildear `apps/print-agent` (Go) y desplegarlo en la red del local o en el VPS según arquitectura.
- Configurar `print-agent-config.json` con `backend_url`, `branch_token`, `branch_id`, `printer_address`.
- El token de rama es secreto; no commitear.

## 6. Monitoreo y observabilidad

| Señal | Endpoint / fuente | Uso |
|---|---|---|
| Liveness | `GET /health/live` | Proceso vivo |
| Readiness | `GET /health/ready` | DB accesible (200/503) |
| Métricas | `GET /metrics` | Prometheus (prom-client) |
| Ops status | `GET /admin/ops/status` | Cola de impresión, alertas, agentes, conversaciones escaladas, drafts |
| Logs | `journalctl -u la-verdu -f` | Errores de app |
| DB | `psql` / `pg_stat_activity` | Conexiones, tamaño |

Alertas recomendadas (implementar con cron o monitoreo externo):
- `/health/ready` != 200 por > 2 min → alerta.
- Cola de impresión con `failed` o `abandoned` > 0 → alerta.
- Conversaciones `ESCALATED` > umbral → alerta.
- Disco > 80% → alerta.
- Backup no generado en 25 h → alerta.

## 7. Matriz de riesgos

| # | Riesgo | Prob. | Impacto | Mitigación | Detección |
|---|---|---|---|---|---|
| R1 | Pérdida de datos por fallo de disco/DB | Media | Alto | Backups diarios + offsite + restore drill | Backup job, health check |
| R2 | Secreto comprometido (token, DB password) | Baja | Alto | Rotación, permisos 600, no git | Auditoría de acceso, alertas Meta |
| R3 | Caída del proveedor LLM/STT | Media | Medio | Escalado automático a personal, fallback de modelo | Logs, métricas de error |
| R4 | Webhook WhatsApp caído o firma inválida | Media | Alto | Verificar `WHATSAPP_APP_SECRET`, túnel HTTPS, suscripción | `/health/live`, logs, prueba inbound |
| R5 | Impresora offline / cola bloqueada | Alta | Medio | Alertas, retry, estado HELD/FAILED, runbook | `/admin/ops/status` |
| R6 | Migración fallida en producción | Baja | Alto | Backup previo, prueba en `_test`, rollback scripts | Logs de migración |
| R7 | Disco lleno | Media | Alto | Purga periódica, rotación de logs/backups, monitoreo | `df`, alerta |
| R8 | Meta rechaza plantillas o bloquea número | Media | Alto | Enviar plantillas temprano, texto libre como fallback | Estado en Meta, webhooks |
| R9 | Pérdida del VPS / proveedor | Baja | Alto | Backups offsite, documentación de restore, IaC futuro | Monitoreo externo |
| R10 | Vulnerabilidad en dependencias | Media | Medio | `npm audit`, actualizaciones periódicas | CI / manual |
| R11 | PII mal manejada / incumplimiento | Baja | Alto | Endpoints ARCO, purga, audit log, no logs en claro | Revisión de código y logs |
| R12 | Sesión admin insegura (cookie sin HTTPS) | Baja | Alto | `isProduction`, `SESSION_SECRET` fuerte, HTTPS obligatorio | Revisión de config |

## 8. Plan de contingencias por escenario

### C1 — Base de datos no responde

**Síntoma:** `/health/ready` 503, logs de conexión.
**Acciones:**
1. Verificar Postgres: `sudo systemctl status postgresql`, `pg_isready`.
2. Revisar espacio en disco y conexiones (`SELECT count(*) FROM pg_stat_activity`).
3. Reiniciar Postgres si es seguro: `sudo systemctl restart postgresql`.
4. Si está corrupta: detener app, restaurar último backup (4.6), re-aplicar migraciones.
5. Notificar al negocio: pedidos por WhatsApp pueden fallar; escalar a manual.

### C2 — Webhook WhatsApp no recibe mensajes

**Síntoma:** mensajes no llegan, no hay conversaciones nuevas.
**Acciones:**
1. `curl https://tu-dominio.com/health/live`.
2. Verificar túnel/HTTPS y DNS.
3. Verificar firma: `WHATSAPP_APP_SECRET` coincide con Meta.
4. Verificar suscripción a `messages` en Meta.
5. Revisar logs: `journalctl -u la-verdu -f`.
6. Probar envío manual con WhatsApp.

### C3 — LLM no responde / timeout

**Síntoma:** pedidos no se parsean, errores `LLM failed`.
**Acciones:**
1. `curl $CHAT_BASE_URL/health` (o endpoint del proveedor).
2. Verificar API key y modelo.
3. El sistema escala automáticamente al personal; confirmar que el personal recibe la alerta.
4. Cambiar `CHAT_BASE_URL`/`CHAT_MODEL` a un proveedor de respaldo y reiniciar.
5. Si es persistente, operar en modo manual (personal toma pedidos por WhatsApp).

### C4 — STT (audio) falla

**Síntoma:** audios no se transcriben.
**Acciones:**
1. Verificar `STT_BASE_URL` y API key.
2. Pedir al cliente que envíe texto (el bot puede pedirlo).
3. Desactivar procesamiento de audio temporalmente si el proveedor está caído (requiere cambio de código o config).

### C5 — Impresora offline / cola bloqueada

**Síntoma:** `failed`/`abandoned`/`held` > 0 en `/admin/ops/status`.
**Acciones:**
1. Verificar agente conectado: `/admin/ops/status` → `agents`.
2. Verificar IP de impresora en admin y conexión TCP: `nc -zv <ip> 9100`.
3. Reintentar jobs fallidos (según implementación) o reimprimir desde admin.
4. Si la impresora está rota: imprimir en otra sucursal o manualmente.

### C6 — Migración fallida

**Síntoma:** `npm run db:migrate` falla, app no arranca.
**Acciones:**
1. Leer el error; no reintentar a ciegas.
2. Si la migración parcial dejó la DB inconsistente: restaurar backup pre-migración.
3. Usar rollback scripts para las migraciones aplicadas: `rollbackMigrations(DATABASE_URL, N)`.
4. Corregir la migración y reintentar en `laverdu_test` primero.

### C7 — Disco lleno

**Síntoma:** writes fallan, logs de `no space left`.
**Acciones:**
1. `df -h`; identificar qué ocupa espacio (DB, logs, backups).
2. Ejecutar purga: `curl -X POST .../admin/privacy/purge -d '{"retentionMonths":6}'`.
3. Rotar/eliminar backups antiguos (verificar retención).
4. Limpiar logs de journald: `journalctl --vacuum-time=7d`.
5. Ampliar disco o mover backups offsite.

### C8 — Secreto comprometido

**Acciones:**
1. Rotar el secreto en el proveedor (Meta, LLM/STT, DB password).
2. Actualizar `/opt/la-verdu/.env`.
3. `sudo systemctl restart la-verdu`.
4. Si es DB password: actualizar también el usuario en Postgres.
5. Revisar logs y `audit_log` por uso anómalo.
6. Si el token del agente de impresión: regenerar y redistribuir config.

### C9 — Pérdida del VPS

**Acciones:**
1. Provisionar nuevo VPS (sección 5).
2. Restaurar último backup offsite (4.6).
3. Reconfigurar DNS / túnel.
4. Re-desplegar agente de impresión.
5. Verificar plantillas Meta (el número no cambia).

### C10 — Actualización de código falla

**Acciones:**
1. `git log --oneline -5`; identificar commit anterior.
2. `git checkout <commit-anterior>`; `npm ci && npm run build`.
3. Revertir migraciones si la nueva versión las aplicó: `rollbackMigrations(..., N)`.
4. `sudo systemctl restart la-verdu`.

## 9. Seguridad y cumplimiento

- Secretos solo en `.env`, permisos 600, owner `laverdu`.
- `.env` en `.gitignore` (verificar).
- PostgreSQL solo localhost; firewall solo 22/80/443.
- SSH con clave pública, password deshabilitado.
- HTTPS obligatorio (Caddy/Cloudflare).
- `SESSION_SECRET` fuerte y único por instalación.
- Logs sin PII en claro (revisar handlers y logger).
- Retención y purga configurables (sección 4.7).
- Endpoints ARCO para datos de clientes.
- `audit_log` append-only para trazabilidad.
- Cifrado de disco recomendado (perfil A obligatorio; en VPS depende del proveedor).

## 10. Pruebas de contingencia (drills)

Realizar antes del go-live y luego cada trimestre:

| Drill | Criterio de éxito |
|---|---|
| Restore de backup en `laverdu_test` | Restauración completa en < 30 min, counts coinciden |
| Failover LLM | El personal recibe la escalación, el cliente recibe mensaje de espera |
| Impresora offline | Alerta generada, jobs en HELD/FAILED, recuperación sin pérdida |
| Rollback de migración | `rollbackMigrations` ejecuta sin error, app arranca |
| Rotación de secreto | Nuevo token funciona, el viejo deja de funcionar |
| Webhook signature inválida | Rechazado con 401/403, log de alerta |

## 11. Checklist pre-producción

- [ ] `.env` creado desde `.env.example`, sin valores default de desarrollo.
- [ ] `NODE_ENV=production`.
- [ ] `SESSION_SECRET` fuerte y único.
- [ ] `ADMIN_PASSWORD` cambiado.
- [ ] PostgreSQL con usuario no-superuser, solo localhost.
- [ ] Firewall configurado (22/80/443).
- [ ] SSH con clave pública.
- [ ] HTTPS funcionando (Caddy/Cloudflare).
- [ ] Migraciones aplicadas y verificadas.
- [ ] Seed de negocio y admin ejecutados.
- [ ] WhatsApp webhook verificado y plantillas enviadas.
- [ ] Backups configurados (cron, cifrado GPG) y primer backup verificado.
- [ ] Copia offsite configurada y verificada.
- [ ] Restore drill (verify-backup.sh) exitoso.
- [ ] Restore drill exitoso.
- [ ] `/health/ready` responde 200.
- [ ] `/admin/ops/status` sin alertas críticas.
- [ ] Monitoreo/alertas configurados.
- [ ] Documentación de contacto y escalamiento actualizada.

## 12. Responsabilidades (plantilla)

| Rol | Responsable | Contacto |
|---|---|---|
| Owner del negocio | — | — |
| Operador técnico | — | — |
| Soporte LLM/STT | Proveedor | — |
| Soporte Meta/WhatsApp | Meta | — |
| Proveedor VPS | — | — |

## 13. Anexo — Comandos útiles

```bash
# Estado del servicio
sudo systemctl status la-verdu
journalctl -u la-verdu -f --since "1 hour ago"

# Health
curl -s https://tu-dominio.com/health/live
curl -s https://tu-dominio.com/health/ready
curl -s -H "Cookie: ..." https://tu-dominio.com/admin/ops/status

# DB
psql "$DATABASE_URL" -c "SELECT count(*) FROM \"order\";"
psql "$DATABASE_URL" -c "SELECT pg_size_pretty(pg_database_size('laverdu'));"

# Backup manual
DATABASE_URL=... BACKUP_DIR=/var/backups/la-verdu /opt/la-verdu/scripts/backup.sh

# Migraciones
cd /opt/la-verdu/apps/api
DATABASE_URL=... npm run db:migrate
```

---

**Nota:** Este documento es un borrador operativo. Antes del go-live, completar los campos de contacto, validar los comandos en el servidor real y ajustar la retención según la política del negocio y la legislación aplicable.