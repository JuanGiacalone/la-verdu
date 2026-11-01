# Runbook: Despliegue en sitio (Perfil A)

## Requisitos de hardware (propuesta, a validar con T7.6)

| Componente | Mínimo                       | Recomendado                       |
| ---------- | ---------------------------- | --------------------------------- |
| CPU        | 4 cores                      | 8 cores                           |
| RAM        | 16 GB                        | 32 GB                             |
| Disco      | 256 GB SSD                   | 512 GB SSD (NVMe)                 |
| GPU        | No requerida (CPU inference) | GPU con 8+ GB VRAM para LLM local |
| Red        | Ethernet al router del local | Ethernet dedicado                 |

El LLM local (7-8B cuantizado) necesita ~8-12 GB de RAM. El STT (Whisper small) necesita ~2 GB. PostgreSQL y el backend necesitan ~2 GB. Total: ~16 GB mínimo.

## Instalación

### 1. Sistema operativo

- Ubuntu 22.04 LTS o Debian 12.
- Cifrado de disco completo (LUKS) obligatorio (PRD 13.2, 16.3).
- Acceso físico restringido al servidor.

### 2. Instalar Docker y podman

```bash
# Docker (para compose)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# O podman (alternativa rootless)
# Ver README.md sección "Puesta en marcha"
```

### 3. Configurar el túnel HTTPS

El webhook de WhatsApp requiere HTTPS. Opciones:
- **Cloudflare Tunnel** (recomendado): `cloudflared tunnel create la-verdu` y configurar el DNS.
- **ngrok**: solo para desarrollo, no para producción.
- **Caddy + Let's Encrypt**: si tenés un dominio propio y IP fija.

El túnel debe apuntar al puerto 3000 del servidor local.

### 4. Configurar los secretos

Crear un archivo `.env` en `infra/compose/` con:
```
DATABASE_URL=postgres://laverdu:CONTRASEÑA_SEGURA@db:5432/laverdu
WHATSAPP_APP_SECRET=...
WHATSAPP_VERIFY_TOKEN=...
WHATSAPP_ACCESS_TOKEN=...
WHATSAPP_PHONE_NUMBER_ID=...
SESSION_SECRET=...
```

Nunca commitear este archivo.

### 5. Descargar los modelos

```bash
# LLM (Ollama)
ollama pull llama3.1:8b

# STT (faster-whisper) - el modelo se descarga automáticamente al iniciar
```

### 6. Levantar el stack

```bash
cd /home/jp/orca/projects/la-verdu
docker compose -f infra/compose/onsite.yml up -d
docker compose -f infra/compose/onsite.yml exec api npm run db:seed -w @la-verdu/api
```

### 7. Configurar la impresora

- Conectar la impresora por Ethernet al router del local.
- Configurar la IP de la impresora en el admin (Admin > Sucursales > Impresora).
- Probar con `make dev-printouts` (adaptar al entorno de producción).

### 8. Backups

```bash
# Cron diario a las 3 AM
0 3 * * * DATABASE_URL=postgres://... BACKUP_DIR=/backup/la-verdu /path/to/scripts/backup.sh

# Copiar backups a almacenamiento remoto (ej: rclone, rsync a otro servidor)
```

### 9. Monitoreo

- Health check: `curl http://localhost:3000/health/ready`
- Métricas: `curl http://localhost:3000/metrics`
- Panel de operaciones: `http://localhost:3000/admin/ops/status`
- Logs: `docker compose -f infra/compose/onsite.yml logs -f api`

## Seguridad física

- Cifrado de disco completo (LUKS) con contraseña fuerte.
- Acceso físico restringido (sala de servidores o rack con llave).
- UPS para corte de luz.
- Backup en disco externo y almacenamiento remoto.

## Comparación de perfiles (PRD 13.2)

| Aspecto                 | Perfil A (en sitio)                | Perfil B (híbrido, iteración 1) |
| ----------------------- | ---------------------------------- | ------------------------------- |
| Costo mensual           | Hardware amortizado + electricidad | API LLM/STT + hosting           |
| Latencia LLM            | Depende del hardware (1-5s)        | Depende del proveedor (0.5-2s)  |
| Precisión LLM           | Modelo 7-8B (menor)                | Modelo grande (mayor)           |
| Precisión STT           | Whisper local (similar)            | Whisper API (similar)           |
| Privacidad              | Datos no salen del local           | Datos pasan por la nube         |
| Mantenimiento           | Mayor (actualizaciones, hardware)  | Menor                           |
| Dependencia de internet | Solo WhatsApp                      | Total                           |

La decisión final de hardware y presupuesto (D-01) se toma con datos del piloto (T6.6, T7.6).
