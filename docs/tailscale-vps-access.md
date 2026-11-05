# Acceso seguro al VPS con Tailscale

Tailscale crea una **red privada (mesh VPN)** entre tus dispositivos y el VPS. Todo el tráfico va cifrado y autenticado, sin exponer puertos al internet público.

## 1. Para qué sirve en La Verdu

- **SSH seguro**: conectarte al VPS sin abrir el puerto 22 a internet.
- **Acceso a servicios internos**: Coolify, base de datos, métricas, admin, sin exponerlos públicamente.
- **Control de acceso**: solo dispositivos autorizados en tu tailnet pueden conectarse.
- **MagicDNS**: acceder al VPS por nombre (`vps-la-verdu`) en vez de IP.
- **Auditoría**: Tailscale registra conexiones y dispositivos.

## 2. Instalación

### 2.1 En el VPS

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

El comando imprime una URL para autenticar el dispositivo en tu cuenta de Tailscale. Abrila en el navegador y autorizá.

### 2.2 En tu máquina local (operador)

Instalar Tailscale en tu laptop/PC (Linux/macOS/Windows) y autenticarse con la misma cuenta. Ambos dispositivos quedan en la misma tailnet.

### 2.3 Script automatizado

```bash
sudo /opt/la-verdu/scripts/install-tailscale.sh
```

Ver `scripts/install-tailscale.sh`.

## 3. Configuración recomendada

### 3.1 Acceso SSH solo por Tailscale

Una vez que Tailscale funciona:

```bash
# En el VPS
sudo ufw delete allow 22/tcp 2>/dev/null || true
sudo ufw allow in on tailscale0
sudo ufw reload
```

Opcional: usar Tailscale SSH (sin claves SSH tradicionales):
```bash
sudo tailscale up --ssh
```

### 3.2 Acceso a servicios internos

- **Coolify**: en vez de exponer el panel al público, acceder por la IP de Tailscale del VPS (`http://100.x.x.x:8000` o el puerto configurado).
- **Base de datos**: conectar con `psql` a la IP de Tailscale, sin exponer 5432.
- **Métricas**: `/metrics` solo accesible por Tailscale.

### 3.3 ACLs (control de acceso)

En la consola de Tailscale (https://login.tailscale.com/admin/acls), definir quién puede acceder a qué:

```json
{
  "acls": [
    {"action": "accept", "src": ["group:admins"], "dst": ["tag:vps:*"]},
    {"action": "accept", "src": ["tag:vps"], "dst": ["tag:vps:*"]}
  ],
  "tagOwners": {
    "tag:vps": ["group:admins"]
  }
}
```

## 4. Integración con La Verdu

- El VPS sigue exponiendo solo 443 (HTTPS) al público para el webhook de WhatsApp y el admin.
- SSH (22), Coolify, DB, métricas y print-agent admin quedan accesibles solo por Tailscale.
- El print-agent del local se conecta al VPS por el dominio público (WSS 443), no necesita Tailscale (aunque podría usarlo para mayor seguridad).
- Backups offsite no se ven afectados.

## 5. Verificación

```bash
# Desde tu máquina (con Tailscale activo)
tailscale status
ping vps-la-verdu  # o la IP de Tailscale del VPS
ssh laverdu@vps-la-verdu
curl http://vps-la-verdu:3000/health/ready
```

## 5.5 Exponer la API por Tailscale (para print-agent)

### 5.5.1 Con Docker Compose (override)

Usar el override `infra/compose/prod.tailscale.yml`:

```bash
TAILSCALE_BIND_IP=100.x.x.x \
  docker compose -f infra/compose/prod.yml -f infra/compose/prod.tailscale.yml up -d
```

Esto mapea el puerto 3000 **solo** a la IP de Tailscale, sin exponerlo al público.

### 5.5.2 Con Coolify

1. En el servicio `api`, ir a **Ports** y agregar un mapeo: `100.x.x.x:3000:3000`.
2. Asegurar que el firewall del VPS solo permita 3000 en `tailscale0`:
   ```bash
   sudo ufw allow in on tailscale0 to any port 3000 proto tcp
   sudo ufw deny 3000/tcp
   ```
3. Verificar: `curl http://100.x.x.x:3000/health/ready` desde el equipo con Tailscale.

### 5.5.3 Con Traefik (Coolify) — hostname de Tailscale

Si preferís usar un dominio en vez de IP:
1. Agregar el hostname de Tailscale (ej. `vps-la-verdu.tailnet.ts.net`) como dominio en Coolify.
2. Coolify genera el certificado SSL y enruta al servicio `api`.
3. El print-agent usa `wss://vps-la-verdu.tailnet.ts.net`.

### 5.5.4 Verificación

```bash
# Desde el equipo del local (con Tailscale activo)
curl http://100.x.x.x:3000/health/ready
# {"status":"ready","checks":{"database":"ok"}}
```

### 5.5.5 Firewall automatizado

Usar el script provisto:

```bash
# Sin exponer API por Tailscale
sudo /opt/la-verdu/scripts/configure-firewall.sh

# Exponiendo API solo en Tailscale
sudo EXPOSE_API_TAILSCALE=true /opt/la-verdu/scripts/configure-firewall.sh

# Forzar SSH público (sin Tailscale)
sudo ALLOW_SSH_PUBLIC=true /opt/la-verdu/scripts/configure-firewall.sh
```

El script:
- Deniega entrada por defecto, permite salida.
- Abre 80/443 públicamente.
- SSH: solo en `tailscale0` si Tailscale está activo; si no, públicamente (con advertencia).
- API (3000): solo en `tailscale0` si `EXPOSE_API_TAILSCALE=true`; si no, denegado.
- Habilita UFW.

```bash
# Desde el equipo del local (con Tailscale activo)
curl http://100.x.x.x:3000/health/ready
# {"status":"ready","checks":{"database":"ok"}}
```

## 6. Troubleshooting

| Problema | Causa | Acción |
|---|---|---|
| No conecta | Dispositivo no autorizado | Autorizar en la consola de Tailscale |
| SSH rechazado | Puerto 22 cerrado sin Tailscale SSH | Usar `tailscale up --ssh` o abrir 22 solo en tailscale0 |
| DNS no resuelve | MagicDNS deshabilitado | Habilitar en la consola de Tailscale |
| Servicio no arranca | Login pendiente | Ejecutar `sudo tailscale up` y autorizar |

## 7. Checklist

- [ ] Tailscale instalado en VPS y máquina local.
- [ ] Dispositivos autorizados en la misma tailnet.
- [ ] SSH accesible solo por Tailscale.
- [ ] Puertos internos no expuestos al público.
- [ ] ACLs configuradas.
- [ ] Verificación de conectividad exitosa.

---

**Última actualización:** 2026-11-05