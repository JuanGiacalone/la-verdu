# Variables de entorno para producción (La Verdu)

Copiá este archivo a `.env` en la raíz del repo y completá los secretos.
Nunca commitees `.env`.

## Base de datos
DB_USER=laverdu
DB_PASSWORD=<secreto fuerte>
DB_NAME=laverdu
DATABASE_URL=postgres://laverdu:<DB_PASSWORD>@db:5432/laverdu
TZ_APP=America/Argentina/Buenos_Aires
LOG_LEVEL=info

## Admin
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<secreto fuerte>
ADMIN_ROLE=OWNER

## LLM (Gemini, Opción A single-API multimodal)
CHAT_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
CHAT_API_KEY=<tu API key de Google AI Studio>
CHAT_MODEL=gemini-3.5-flash-lite

## STT (no se usa para audio con Opción A; puede quedar el stub)
STT_BASE_URL=http://stt-stub:8083
STT_API_KEY=
STT_MODEL=stt-stub

## WhatsApp (Meta Cloud API, valores reales)
WHATSAPP_APP_SECRET=<app secret de Meta>
WHATSAPP_VERIFY_TOKEN=<verify token que configurás en Meta>
WHATSAPP_ACCESS_TOKEN=<system user access token>
WHATSAPP_PHONE_NUMBER_ID=<phone number id>
WHATSAPP_API_VERSION=v22.0

## Backups (opcional)
GPG_RECIPIENT=backup@la-verdu
OFFSITE_ENABLED=false
OFFSITE_TARGET=
