# SOP — Backup y restauración de La Verdu (producción)

**Documento:** Procedimiento operativo estándar (SOP)
**Alcance:** Perfil B (VPS) — PostgreSQL local + backups cifrados offsite
**Scripts involucrados:** `scripts/backup-secure.sh`, `scripts/verify-backup.sh`
**Plan relacionado:** `docs/contingency-production-plan.md` (sección 4.5)

---

## 1. Objetivo

Garantizar que los datos de La Verdu puedan recuperarse ante pérdida, corrupción o fallo del VPS, con backups **cifrados**, **verificados** y **fuera del servidor** (offsite), en un tiempo objetivo de restauración < 4 h.

## 2. Roles

| Rol               | Responsabilidad                                           |
| ----------------- | --------------------------------------------------------- |
| Operador técnico  | Ejecutar backups, verificar cron, restaurar en incidentes |
| Owner del negocio | Custodiar la clave privada GPG (offline) y el passphrase  |
| Soporte VPS       | Mantener el servidor y el almacenamiento offsite          |

## 3. Prerrequisitos

- VPS con PostgreSQL 16 y la app desplegada.
- `gpg`, `pg_dump`, `psql`, `rsync` instalados (incluidos en el setup base).
- Para offsite con rclone: `rclone` instalado y un remote configurado.
- Acceso SSH con clave pública al VPS.
- Acceso al gestor de contraseñas donde se guarda la passphrase/clave privada.

## 4. Generación de la clave GPG (una sola vez, en máquina segura)

> La clave privada **nunca** debe vivir en el VPS. Solo la pública se importa al servidor.

```bash
# En una máquina segura (no el VPS):
gpg --full-generate-key
# Tipo: RSA 4096
# Expiración: 2 años (o sin expiración si se prefiere)
# UID: backup@la-verdu

# Exportar clave pública
gpg --armor --export backup@la-verdu > la-verdu-backup.pub

# Exportar clave privada (guardar en bóveda offline / gestor de contraseñas)
gpg --armor --export-secret-keys backup@la-verdu > la-verdu-backup.priv
# Proteger con passphrase fuerte al exportar.

# (Opcional) Generar certificado de revocación
gpg --output la-verdu-backup.rev --gen-revoke backup@la-verdu
```

**Guardar en lugar seguro:** `la-verdu-backup.priv`, la passphrase, y `la-verdu-backup.rev`. Si se pierden, los backups son irrecuperables.

## 5. Instalación en el VPS

### 5.1 Importar la clave pública

```bash
scp la-verdu-backup.pub laverdu@vps:/tmp/
ssh laverdu@vps
sudo -u laverdu gpg --import /tmp/la-verdu-backup.pub
sudo -u laverdu gpg --list-keys backup@la-verdu
rm /tmp/la-verdu-backup.pub
```

### 5.2 Verificar el script

```bash
cd /opt/la-verdu
ls -l scripts/backup-secure.sh scripts/verify-backup.sh
# Deben ser ejecutables (-rwxr-xr-x)
```

### 5.3 Backup manual de prueba

```bash
cd /opt/la-verdu
sudo -u laverdu env \
  DATABASE_URL="postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu" \
  GPG_RECIPIENT="backup@la-verdu" \
  BACKUP_DIR="/var/backups/la-verdu" \
  /opt/la-verdu/scripts/backup-secure.sh
```

Verificar que se generó un `.gpg` y un `.sha256` en `/var/backups/la-verdu`.

## 6. Configuración offsite

### 6.1 Opción A — rclone (recomendada)

```bash
# Instalar
curl https://rclone.org/install.sh | sudo bash

# Configurar remote (ejemplo con Backblaze B2)
sudo -u laverdu rclone config
# n) New remote
# name> la-verdu-backup
# Storage> b2 (o s3, gdrive, sftp, etc.)
# ... completar credenciales ...

# Probar
sudo -u laverdu rclone ls la-verdu-backup:
sudo -u laverdu rclone mkdir la-verdu-backup:la-verdu
```

### 6.2 Opción B — rsync a un segundo servidor

```bash
# En el VPS, generar clave SSH para el usuario de backup
sudo -u laverdu ssh-keygen -t ed25519 -f /home/laverdu/.ssh/backup_key -N ""
# Autorizar la pública en el servidor secundario
ssh-copy-id -i /home/laverdu/.ssh/backup_key.pub backup@backup-server

# Probar
sudo -u laverdu rsync -avz -e "ssh -i /home/laverdu/.ssh/backup_key" /var/backups/la-verdu/ backup@backup-server:/backups/la-verdu/
```

## 7. Cron (backup diario)

### 7.1 Con rclone

```bash
echo "0 3 * * * root DATABASE_URL=postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TARGET=la-verdu-backup:la-verdu /opt/la-verdu/scripts/backup-secure.sh >> /var/log/la-verdu-backup.log 2>&1" | sudo tee /etc/cron.d/la-verdu-backup
```

### 7.2 Con rsync

```bash
echo "0 3 * * * root DATABASE_URL=postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu GPG_RECIPIENT=backup@la-verdu BACKUP_DIR=/var/backups/la-verdu OFFSITE_ENABLED=true OFFSITE_TOOL=rsync OFFSITE_TARGET=backup@backup-server:/backups/la-verdu /opt/la-verdu/scripts/backup-secure.sh >> /var/log/la-verdu-backup.log 2>&1" | sudo tee /etc/cron.d/la-verdu-backup
```

Verificar:

```bash
sudo cat /etc/cron.d/la-verdu-backup
sudo systemctl status cron
```

## 8. Verificación semanal (restore drill)

Cron los domingos a las 4 AM:

```bash
echo "0 4 * * 0 root VERIFY_DB_URL=postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu_verify GPG_RECIPIENT=backup@la-verdu /opt/la-verdu/scripts/verify-backup.sh \$(ls -t /var/backups/la-verdu/la-verdu_*.gpg | head -1) >> /var/log/la-verdu-backup.log 2>&1" | sudo tee -a /etc/cron.d/la-verdu-backup
```

Manual:

```bash
cd /opt/la-verdu
VERIFY_DB_URL="postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu_verify" \
  GPG_RECIPIENT="backup@la-verdu" \
  /opt/la-verdu/scripts/verify-backup.sh /var/backups/la-verdu/la-verdu_YYYYMMDD_HHMMSS.sql.gz.gpg
```

La DB `laverdu_verify` debe terminar en `_verify` (guarda de seguridad del script). Se recrea en cada ejecución.

## 9. Restauración (incidente)

### 9.1 Restauración completa (VPS nuevo o DB corrupta)

```bash
# 1. Detener la app
sudo systemctl stop la-verdu

# 2. Backup de seguridad del estado actual (si es posible)
sudo -u laverdu env DATABASE_URL=... /opt/la-verdu/scripts/backup-secure.sh

# 3. Crear DB limpia (si hace falta)
sudo -u postgres psql -c "DROP DATABASE IF EXISTS laverdu;"
sudo -u postgres psql -c "CREATE DATABASE laverdu OWNER laverdu;"

# 4. Descifrar y restaurar
cd /opt/la-verdu
gpg --decrypt /var/backups/la-verdu/la-verdu_YYYYMMDD_HHMMSS.sql.gz.gpg > /tmp/restore.sql.gz
gunzip -c /tmp/restore.sql.gz | psql "postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu"
shred -u /tmp/restore.sql.gz

# 5. Re-aplicar migraciones si el backup es de una versión anterior
cd /opt/la-verdu/apps/api
DATABASE_URL="postgres://laverdu:CONTRASEÑA@127.0.0.1:5432/laverdu" npm run db:migrate

# 6. Arrancar y verificar
sudo systemctl start la-verdu
curl -s https://tu-dominio.com/health/ready
```

### 9.2 Restauración selectiva (una tabla)

Usar `pg_restore` con formato custom. Requiere modificar el script para usar `pg_dump -Fc` (ver sección 11).

### 9.3 Restauración desde offsite (VPS perdido)

```bash
# Descargar desde el remote
rclone copy la-verdu-backup:la-verdu /var/backups/la-verdu --include "la-verdu_YYYYMMDD*.gpg"
# o rsync
rsync -avz backup@backup-server:/backups/la-verdu/ /var/backups/la-verdu/
# Luego seguir 9.1 desde el paso 3.
```

## 10. Rotación de clave GPG

Cuando la clave expire o se comprometa:

1. Generar nueva clave en máquina segura (sección 4).
2. Importar la nueva pública al VPS.
3. Actualizar `GPG_RECIPIENT` en el cron al nuevo UID.
4. Mantener la clave vieja importada hasta que todos los backups viejos salgan de retención.
5. Si la clave se comprometió: revocarla (`gpg --gen-revoke`), importar la revocación en el VPS, y rotar todos los backups recientes con la nueva clave (descifrar con la vieja, re-cifrar con la nueva).

## 11. Retención escalonada (opcional)

Modificar el script para usar `pg_dump -Fc` y gestionar retención en el bucket:

```bash
# En backup-secure.sh, reemplazar:
#   pg_dump "$DB_URL" | gzip > "$PLAIN_FILE"
# por:
#   pg_dump -Fc "$DB_URL" > "$PLAIN_FILE"
# y ajustar verify-backup.sh para usar pg_restore.
```

En el bucket offsite, configurar lifecycle rules: 7 diarios, 4 semanales, 3 mensuales.

## 12. Troubleshooting

| Problema                                        | Causa probable                 | Acción                                                       |
| ----------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| `gpg: no valid OpenPGP data found`              | Archivo corrupto o no cifrado  | Verificar integridad, re-descargar de offsite                |
| `gpg: decryption failed: No secret key`         | Falta clave privada            | Importar `la-verdu-backup.priv` (solo en máquina de restore) |
| `ERROR: set GPG_RECIPIENT or BACKUP_PASSPHRASE` | Variables no pasadas           | Revisar cron y `.env`                                        |
| `DB name must end in _verify or _test`          | Seguridad del script           | Usar una DB con sufijo correcto                              |
| Backup no se genera                             | Cron no corre / Postgres caído | `journalctl`, `pg_isready`, `/var/log/la-verdu-backup.log`   |
| Offsite falla                                   | rclone/rsync no configurado    | Probar manualmente el comando                                |
| Disco lleno                                     | Retención insuficiente         | Ejecutar purga, ampliar disco, revisar lifecycle             |

## 13. Checklist de implementación

- [ ] Clave GPG generada y privada guardada offline.
- [ ] Pública importada en el VPS.
- [ ] Backup manual exitoso.
- [ ] Cron configurado y primer backup automático verificado.
- [ ] Offsite configurado y copia verificada.
- [ ] Restore drill (verify-backup.sh) exitoso.
- [ ] Restauración completa probada en entorno de prueba.
- [ ] Documentación de contacto actualizada (sección 2).
- [ ] Alerta si no hay backup en 25 h.

## 14. Variables de entorno del backup

| Variable            | Requerida   | Descripción                                     |
| ------------------- | ----------- | ----------------------------------------------- |
| `DATABASE_URL`      | sí          | Conexión a Postgres                             |
| `GPG_RECIPIENT`     | sí*         | UID/email de la clave pública                   |
| `BACKUP_PASSPHRASE` | sí*         | Passphrase simétrica (alternativa)              |
| `BACKUP_DIR`        | no          | Destino local (default `/var/backups/la-verdu`) |
| `RETENTION_DAYS`    | no          | Retención local (default 30)                    |
| `OFFSITE_ENABLED`   | no          | `true` para copiar offsite                      |
| `OFFSITE_TARGET`    | si offsite  | Remote rclone o destino rsync                   |
| `OFFSITE_TOOL`      | no          | `rclone` (default) o `rsync`                    |
| `SHRED_PLAINTEXT`   | no          | `true` (default)                                |
| `VERIFY_DB_URL`     | para verify | DB de verificación                              |

\* Una de las dos es obligatoria.

---

**Última actualización:** 2026-11-05
**Mantenedor:** Operador técnico
