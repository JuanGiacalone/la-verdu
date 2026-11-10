# Despliegue del agente de impresión (print-agent)

**Producto:** La Verdu
**Componente:** `apps/print-agent` (binario Go)
**Perfil:** B (VPS con Coolify + Caddy + Cloudflare Tunnel)

---

## 1. Arquitectura

```
┌─────────────────────┐         WSS          ┌──────────────────────┐
│  Local del negocio  │ ───────────────────► │  VPS (Coolify/Caddy) │
│  print-agent (Go)   │ ◄─────────────────── │  API La Verdu        │
│  + impresora TCP    │     WebSocket        │  /ws/print           │
└─────────────────────┘                      └──────────────────────┘
```

- El **print-agent** corre en una máquina del local del negocio.
- Se conecta por **WebSocket seguro (WSS)** al VPS, al endpoint `/ws/print?branch=...&token=...`.
- Recibe trabajos de impresión y los envía a la impresora por **TCP (puerto 9100)** o USB.
- Mantiene un **spool local (SQLite)** para deduplicación y reintentos.
- Envía heartbeats y acks (PRINTED/FAILED) al backend.

El usuario no está equivocado: **sí se necesita una computadora pequeña con Linux** (o cualquier SO compatible) en el local, conectada a la impresora y con acceso a internet, corriendo el agente como servicio (systemd recomendado).

## 2. Requisitos del equipo local

| Componente | Mínimo | Recomendado |
|---|---|---|
| CPU | 1 core | 2 cores |
| RAM | 512 MB | 1 GB |
| Disco | 1 GB libre | 4 GB (spool + logs) |
| Red | Ethernet/Wi-Fi al router del local | Ethernet dedicado |
| SO | Linux (Ubuntu 22.04/Debian 12) o Windows/macOS | Linux (systemd) |
| Impresora | Red (TCP 9100) o USB | Red (TCP 9100) |

Notas:
- No necesita GPU ni mucho almacenamiento.
- Debe tener salida a internet (solo HTTPS/WSS al dominio del VPS).
- La impresora debe estar en la misma red local (o accesible por IP) desde el agente.

## 3. Requisitos de red

- El agente se conecta al VPS por **HTTPS/WSS** (puerto 443). No se necesita abrir puertos entrantes en el local.
- Cloudflare Tunnel / Caddy deben soportar **WebSocket upgrade** (Cloudflare lo soporta en planes gratuitos; Caddy lo hace por defecto).
- La impresora debe aceptar conexiones TCP en el puerto 9100 (o el configurado) desde el agente.
- Firewall del local: permitir salida 443 (HTTPS). No hace falta abrir 9100 al exterior.

## 4. Preparar la sucursal en el admin

1. Ingresar al admin de La Verdu.
2. Ir a **Sucursales** y seleccionar la sucursal.
3. Configurar:
   - **ID de sucursal** (UUID) → se usará como `branch_id`.
   - **Token del agente** → generar/asignar un token seguro (`branch_token`).
   - **Dirección de impresora** → `tcp://<IP_IMPRESORA>:9100` (o `usb` si aplica).
4. Guardar.

El token de rama es un secreto: no commitearlo ni compartirlo.

## 5. Instalar el agente en el equipo local

### 5.1 Instalar Go (solo para buildear) o usar binario precompilado

Opción A — Buildear en el equipo:
```bash
sudo apt update && sudo apt install -y golang-go
cd /opt
sudo git clone <repo-url> la-verdu
cd la-verdu/apps/print-agent
CGO_ENABLED=0 go build -o /usr/local/bin/print-agent .
```

Opción B — Copiar un binario precompilado (recomendado para equipos pequeños):
```bash
scp print-agent laverdu@equipo-local:/usr/local/bin/print-agent
sudo chmod +x /usr/local/bin/print-agent
```

### 5.2 Crear usuario y directorio

```bash
sudo useradd -r -s /bin/false printagent 2>/dev/null || true
sudo mkdir -p /opt/print-agent
sudo chown printagent:printagent /opt/print-agent
```

### 5.3 Crear config.json

Ejemplo (ver `docs/examples/print-agent.config.json`):

```json
{
  "backend_url": "wss://apolonia.tu-dominio.com",
  "branch_token": "TOKEN_DE_LA_SUCURSAL",
  "branch_id": "UUID_DE_LA_SUCURSAL",
  "printer_address": "tcp://192.168.1.100:9100",
  "printer_port": 9100
}
```

Instalación automatizada (recomendada):

```bash
sudo BACKEND_URL=wss://apolonia.tu-dominio.com \
     BRANCH_ID=UUID_DE_LA_SUCURSAL \
     BRANCH_TOKEN=TOKEN_DE_LA_SUCURSAL \
     PRINTER_ADDRESS=tcp://192.168.1.100:9100 \
     BINARY_SOURCE=/tmp/print-agent \
     /opt/la-verdu/scripts/install-print-agent.sh
```

Esto crea el usuario, directorio, config, servicio systemd y lo habilita.

```bash
sudo tee /opt/print-agent/config.json <<'EOF'
{
  "backend_url": "wss://<DOMAIN>",
  "branch_token": "TOKEN_DE_LA_SUCURSAL",
  "branch_id": "UUID_DE_LA_SUCURSAL",
  "printer_address": "tcp://192.168.1.100:9100",
  "printer_port": 9100
}
EOF
sudo chmod 600 /opt/print-agent/config.json
sudo chown printagent:printagent /opt/print-agent/config.json
```

Notas:
- `backend_url` debe ser **WSS** (WebSocket Secure) si el VPS usa HTTPS.
- `branch_id` y `branch_token` deben coincidir con los configurados en el admin.

### 5.4 Crear el servicio systemd

```bash
sudo tee /etc/systemd/system/print-agent.service <<'EOF'
[Unit]
Description=La Verdu Print Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=printagent
Group=printagent
WorkingDirectory=/opt/print-agent
ExecStart=/usr/local/bin/print-agent /opt/print-agent/config.json
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable print-agent
sudo systemctl start print-agent
```

### 5.5 Verificar

```bash
sudo systemctl status print-agent
sudo journalctl -u print-agent -f
```

Debe mostrar:
```
connecting to wss://<DOMAIN>/ws/print?branch=...&token=...
loaded N printed job IDs
```

En el admin, `/admin/ops/status` debe listar el agente en `agents` con `lastSeen` reciente.

## 6. Impresora: conexión y prueba

### 6.1 Impresora de red (TCP)

- Conectar la impresora por Ethernet al router del local.
- Asignar IP fija (ej. `192.168.1.100`).
- Configurar en el admin: `printer_address = tcp://192.168.1.100:9100`.
- Probar conexión TCP desde el agente:
  ```bash
  nc -zv 192.168.1.100 9100
  ```

### 6.2 Impresora USB

- Configurar `printer_address = usb` en `config.json`.
- El agente debe tener permisos para acceder al dispositivo USB (grupo `lp` o `dialout`).
- Agregar el usuario `printagent` al grupo correspondiente:
  ```bash
  sudo usermod -aG lp printagent
  ```

### 6.3 Prueba de impresión

1. Crear un pedido de prueba desde el admin o WhatsApp.
2. Verificar que el trabajo aparezca en `/admin/print-jobs?status=QUEUED`.
3. El agente debe imprimir y enviar ack `PRINTED`.
4. El trabajo debe pasar a estado `PRINTED` y desaparecer de la cola.

## 7. Seguridad

- `branch_token` es un secreto: guardarlo solo en `config.json` (permisos 600) y en la DB (admin).
- El agente solo necesita salida HTTPS/WSS al VPS; no exponer puertos entrantes.
- El spool local (`spool.db`) contiene payloads de impresión; proteger el directorio `/opt/print-agent`.
- Rotar el token si se compromete: actualizar en admin y en `config.json`, reiniciar el agente.

## 8. Actualización del agente

```bash
cd /opt/la-verdu/apps/print-agent
git pull
CGO_ENABLED=0 go build -o /usr/local/bin/print-agent .
sudo systemctl restart print-agent
```

O copiar el nuevo binario y reiniciar.

## 9. Troubleshooting

| Problema | Causa probable | Acción |
|---|---|---|
| `dial: ...` / no conecta | URL incorrecta, WSS no soportado, firewall | Verificar `backend_url`, Cloudflare/Caddy WebSocket, salida 443 |
| `cannot read config` | Ruta o permisos | Verificar `/opt/print-agent/config.json` y permisos |
| Impresora no imprime | IP/puerto incorrectos, impresora offline | `nc -zv <ip> 9100`, revisar config y cola |
| Jobs en `FAILED`/`ABANDONED` | Impresora rechaza payload, timeout | Revisar logs del agente y `/admin/print-jobs?status=FAILED` |
| Agente no aparece en `/admin/ops/status` | Token/branch incorrectos, no conecta | Verificar `branch_id`, `branch_token`, logs |
| Spool crece | Jobs no ackeados | Reiniciar agente, verificar conectividad |

## 10. Integración con Coolify / Cloudflare Tunnel

### 10.0 Diagrama de red

```
┌────────────────────┐         HTTPS/WSS          ┌──────────────────────────┐
│  Local del negocio │ ─────────────────────────► │  Cloudflare (DNS/Tunnel) │
│  print-agent (Go)  │ ◄───────────────────────── │  Tunnel → VPS            │
└────────┬───────────┘                            └────────────┬─────────────┘
         │ TCP 9100                                            │
         ▼                                                     ▼
┌────────────────────┐                            ┌──────────────────────────┐
│  Impresora (red)   │                            │  VPS: Coolify/Traefik    │
│  192.168.x.x:9100  │                            │  └─ API La Verdu :3000   │
└────────────────────┘                            │     /ws/print            │
                                                  └──────────────────────────┘
```

### 10.0.1 Ejemplo de configuración de Cloudflare Tunnel (`config.yml`)

Archivo: `~/.cloudflared/config.yml` (en el VPS o en la máquina que corre el túnel)

```yaml
# ~/.cloudflared/config.yml
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: apolonia.tu-dominio.com
    service: http://localhost:80  # Coolify/Traefik
    originRequest:
      noTLSVerify: false
  - service: http_status:404
```

Comandos:
```bash
# Crear el túnel
cloudflared tunnel create la-verdu

# Asignar DNS
cloudflared tunnel route dns la-verdu apolonia.tu-dominio.com

# Ejecutar
cloudflared tunnel run la-verdu
```

> Nota: Cloudflare soporta WebSocket en el plan gratuito. El túnel debe apuntar a Coolify/Traefik (puerto 80/443), no directamente al contenedor de la API.

### 10.0.3 cloudflared como servicio systemd (VPS)

Para que el túnel se levante automáticamente al reiniciar el VPS:

```bash
# Instalar cloudflared
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Crear el túnel y credenciales (una sola vez)
sudo cloudflared tunnel create la-verdu
sudo cloudflared tunnel route dns la-verdu apolonia.tu-dominio.com

# Crear el archivo de configuración
sudo mkdir -p /etc/cloudflared
sudo tee /etc/cloudflared/config.yml <<'EOF'
tunnel: <TUNNEL_ID>
credentials-file: /root/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: apolonia.tu-dominio.com
    service: http://localhost:80
  - service: http_status:404
EOF

# Instalar como servicio
sudo cloudflared service install
sudo systemctl enable cloudflared
sudo systemctl start cloudflared

# Verificar
sudo systemctl status cloudflared
sudo journalctl -u cloudflared -f
```

Notas:
- El túnel apunta a `localhost:80` (Caddy/Traefik). Si usás otro puerto, ajustar.
- Cloudflare soporta WebSocket en el plan gratuito; el heartbeat de 30 s mantiene la conexión.
- Si el túnel se cae, cloudflared se reinicia automáticamente (systemd).

### 10.0.4 Flujo detallado de impresión

```
1. Cliente envía pedido por WhatsApp
   │
   ▼
2. API crea orden + genera print job (QUEUED)
   │
   ▼
3. API envía job por WebSocket al print-agent
   │  (payload base64: ticket ESC/POS)
   ▼
4. print-agent recibe job → spool local (SQLite)
   │
   ▼
5. print-agent envía payload a impresora por TCP 9100
   │
   ├──► Éxito → ack PRINTED → job pasa a PRINTED
   │
   └──► Fallo → ack FAILED → job pasa a FAILED/HELD
        (reintento automático según política)
   │
   ▼
6. Backend actualiza estado del job y orden
   │
   ▼
7. Heartbeat cada 30 s mantiene la conexión WSS
```

Estados del job: `QUEUED` → `PRINTED` / `FAILED` / `HELD` / `ABANDONED`.

### 10.0.2 Caddy como alternativa/complemento

Caddy es un reverse proxy que maneja HTTPS y WebSocket de forma automática y sencilla.

**Opción A — Caddy en el VPS (fuera de Coolify):**
```
# /etc/caddy/Caddyfile
apolonia.tu-dominio.com {
    reverse_proxy localhost:3000  # o el puerto de Coolify/Traefik
}
```
```bash
sudo systemctl restart caddy
```

**Opción B — Caddy dentro de Coolify:**
Coolify permite usar Caddy como reverse proxy en lugar de Traefik. Configurar en la plataforma y asignar el dominio al servicio `admin`.

Ventajas de Caddy:
- Configuración mínima (el Caddyfile es muy legible).
- HTTPS automático (Let's Encrypt).
- WebSocket soportado por defecto.
- Recarga sin downtime (`caddy reload`).

Recomendación: usar **Caddy** si preferís simplicidad y control manual; usar **Traefik (Coolify default)** si preferís integración automática con la plataforma.

### 10.1 Coolify (Traefik)

- El endpoint WebSocket es `/ws/print` en el servicio `api`.
- Coolify/Traefik soporta WebSocket por defecto; no requiere configuración especial.
- Asegurarse de que el servicio `api` esté en la misma red interna que Traefik y que el puerto 3000 esté expuesto.
- Si se usa un dominio personalizado, Coolify genera el certificado SSL y enruta `/ws/*` al servicio `api`.
- Verificar que no haya middlewares que eliminen el header `Upgrade`.
- El heartbeat del agente se envía cada 30 s, lo que mantiene la conexión viva frente a timeouts del proxy.

### 10.2 Cloudflare Tunnel

- Cloudflare soporta WebSocket en el plan gratuito.
- Timeout de inactividad en plan gratuito: ~100 s. El heartbeat de 30 s evita el corte.
- El túnel debe apuntar al reverse proxy de Coolify (o al puerto del servicio `api` si no se usa proxy).
- Configurar el túnel con `cloudflared`:
  ```bash
  cloudflared tunnel route dns la-verdu apolonia.tu-dominio.com
  cloudflared tunnel run la-verdu
  ```
- Verificar que el túnel permita conexiones WSS: `wscat -c wss://apolonia.tu-dominio.com/ws/print` (requiere token/branch).

### 10.3 Checklist de conectividad WebSocket

- [ ] Dominio resuelve a Cloudflare/Coolify.
- [ ] Certificado SSL válido (HTTPS).
- [ ] Traefik/Caddy enruta `/ws/print` al servicio `api`.
- [ ] Heartbeat cada 30 s llega al backend (ver logs del agente).
- [ ] Agente aparece en `/admin/ops/status` con `lastSeen` reciente.
- [ ] Prueba de impresión exitosa.

- El agente usa `wss://<DOMAIN>/ws/print`. Cloudflare Tunnel soporta WebSocket en el plan gratuito.
- Caddy (en el VPS) maneja el upgrade automáticamente.
- No se necesita exponer puertos adicionales en el VPS; solo 443.
- El agente no necesita conocer la IP del VPS, solo el dominio.

## 10.5 Uso del print-agent con Tailscale (opcional)

Si el VPS y el equipo del local están en la misma tailnet, el agente puede conectarse por la red privada en vez del dominio público.

Ventajas:
- Sin TLS (Tailscale ya cifra).
- Menor latencia.
- No depende de Cloudflare/DNS.

Requisitos:
- El VPS debe exponer el puerto 3000 de la API en la interfaz Tailscale (o usar un proxy que escuche en tailscale0).
- En Coolify, mapear el puerto 3000 del contenedor `api` al host en `127.0.0.1:3000` o usar un router de Traefik para el dominio de Tailscale.

Instalación con Tailscale:
```bash
sudo BACKEND_URL=wss://placeholder \
     USE_TAILSCALE=true \
     TAILSCALE_IP=100.x.x.x \
     TAILSCALE_PORT=3000 \
     TAILSCALE_TLS=false \
     BRANCH_ID=UUID_DE_LA_SUCURSAL \
     BRANCH_TOKEN=TOKEN_DE_LA_SUCURSAL \
     PRINTER_ADDRESS=tcp://192.168.1.100:9100 \
     BINARY_SOURCE=/tmp/print-agent \
     /opt/la-verdu/scripts/install-print-agent.sh
```

El script genera `backend_url: "ws://100.x.x.x:3000"` (o `wss://` si `TAILSCALE_TLS=true`).

Si preferís mantener TLS, dejá `TAILSCALE_TLS=true` y asegurate de que el proxy sirva HTTPS en la IP de Tailscale.

## 11. Checklist de instalación

- [ ] Sucursal creada en admin con `branch_id` y `branch_token`.
- [ ] Impresora con IP fija y accesible por TCP 9100.
- [ ] Equipo local con Linux y acceso a internet.
- [ ] Binario `print-agent` instalado en `/usr/local/bin`.
- [ ] `config.json` creado con permisos 600.
- [ ] Servicio systemd creado y habilitado.
- [ ] Agente conectado (logs muestran "connecting to wss://...").
- [ ] Agente aparece en `/admin/ops/status`.
- [ ] Prueba de impresión exitosa.
- [ ] Token guardado de forma segura.

---

**Última actualización:** 2026-11-05