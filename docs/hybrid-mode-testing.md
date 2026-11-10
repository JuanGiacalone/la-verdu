# Guía: testear en modo híbrido con API key de OpenCode

El **modo híbrido** (perfil B del PRD) usa un LLM hospedado a través de una API
compatible con OpenAI, en lugar del `llm-stub` local. Esta guía explica cómo
configurar La Verdu para usar un proveedor real (OpenCode) y probar el flujo
conversacional end-to-end.

## Cuándo usar este modo

- Validar que el parser de pedidos (I2) interpreta bien texto real.
- Correr evals de conversación (`evals/conversations/*.json`) contra un modelo real.
- Verificar que las respuestas del LLM cumplen los umbrales del PRD 21.2
  (95% productos/cantidades, 0 precios inventados, 0 confirmaciones sin "sí").

En el día a día se sigue usando el `llm-stub` (sin red ni claves). El modo
híbrido es para validación puntual.

## Requisitos

- Cuenta en [OpenCode Console](https://opencode.ai/console).
- Una **personal API key** (o service account key).
- Un modelo de la familia **OpenAI Chat Completions** (los modelos open como
  `kimi-k3`, `glm-5.3`, `minimax-m3`). Los modelos free solo funcionan dentro de
  OpenCode; desde otros clientes reciben HTTP 403, por lo que hay que usar modelos
  pagos o una suscripción Go.
- Saldo (balance) o suscripción Go activa.

## 1. Obtener la API key

1. Abrí [console.opencode.ai](https://opencode.ai/console) e iniciá sesión.
2. Andá a **Account → Personal API keys → Add API key**.
3. Elegí el workspace, poné un nombre (ej. `la-verdu-dev`) y creá la key.
4. Copiá la key (`oc_sk_...`). Se muestra **una sola vez**.

## 2. Configurar las variables de entorno

La app lee `CHAT_BASE_URL`, `CHAT_API_KEY` y `CHAT_MODEL` (ver
`apps/api/src/config.ts`). Para OpenCode:

```bash
export CHAT_BASE_URL="https://opencode.ai/inference/openai/v1"
export CHAT_API_KEY="oc_sk_..."          # tu key
export CHAT_MODEL="glm-5.3"              # o kimi-k3, minimax-m3, etc.
```

> La app arma la URL final como `${CHAT_BASE_URL}/chat/completions`, por lo que
> el base URL debe terminar en `/v1` (sin `/chat/completions`).

STT se mantiene en el stub (no hay clave de STT en este flujo):

```bash
export STT_BASE_URL="http://localhost:8083"
export STT_API_KEY=""
export STT_MODEL="stt-stub"
```

### Con `.env` local (recomendado)

Copiá `.env.example` a `.env.local` (no commiteado) y completá los valores.
`.env.local` debe estar en `.gitignore`.

## 3. Verificar el proveedor con curl

Antes de levantar la app, probá la key:

```bash
curl -sS -X POST "https://opencode.ai/inference/openai/v1/chat/completions" \
  -H "Authorization: Bearer $CHAT_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$CHAT_MODEL\",\"messages\":[{\"role\":\"user\",\"content\":\"Hola, respondé OK\"}],\"temperature\":0}" \
  | jq .
```

Deberías ver un `choices[0].message.content`. Si recibís 401/403, revisá la key
o el modelo (los free models dan 403 fuera de OpenCode).

## 4. Probar el flujo conversacional (manual)

### Opción A: sin compose, API directa

```bash
# Base de datos local (PostgreSQL 16) levantada
export DATABASE_URL="postgres://laverdu:laverdu_dev_only@127.0.0.1:5433/laverdu"
export NODE_ENV=development
cd apps/api && npm run dev
```

En otra terminal, enviá un mensaje simulado:

```bash
make dev-sim-msg FROM=+5491100000201 TEXT="tomate 2 kg y lechuga 1"
```

Revisá la respuesta del WhatsApp-sim y el printout generado en `.dev/printouts/`.

### Opción B: con compose (perfil híbrido parcial)

Levantá el stack normal (usa el llm-stub) y sobreescribí las variables del
servicio `api` en `infra/compose/dev.yml` o mediante un override:

```bash
# compose override (no commitear)
cat > infra/compose/dev.hybrid.yml <<'EOF'
services:
  api:
    environment:
      CHAT_BASE_URL: "https://opencode.ai/inference/openai/v1"
      CHAT_API_KEY: "oc_sk_..."
      CHAT_MODEL: "glm-5.3"
EOF
docker-compose -f infra/compose/dev.yml -f infra/compose/dev.hybrid.yml up -d
```

> No commitees `dev.hybrid.yml` ni la key. Agregalo a `.gitignore`.

## 5. Correr los evals con el proveedor real

El runner `evals/run-evals.ts` acepta `--provider=hosted|local`:

```bash
CHAT_BASE_URL="https://opencode.ai/inference/openai/v1" \
CHAT_API_KEY="oc_sk_..." \
CHAT_MODEL="glm-5.3" \
npx tsx evals/run-evals.ts --provider=hosted
```

Verificá los umbrales del PRD 21.2:
- Interpretación de productos y cantidades: ≥ 95%.
- Cero precios o disponibilidades inventados: 0 casos.
- Cero confirmaciones sin "sí" explícito: 0 casos.

El runner ya llama a `parseCustomerOrder` (en `apps/api/src/orders/parser.ts`) con
el catálogo de productos de la base de datos y compara items (productos y
cantidades) y modalidad contra el `expected` del caso. Requiere una base de datos
con seed (`make dev-seed`) para tener el catálogo.

## 6. Volver al stub (default)

```bash
unset CHAT_BASE_URL CHAT_API_KEY CHAT_MODEL
# o restaurar .env con los defaults del stub:
# CHAT_BASE_URL=http://localhost:8082
# CHAT_API_KEY=
# CHAT_MODEL=llm-stub
```

Con compose, bajá el override y volvé a `make dev-up`.

## Seguridad y costos

- **Nunca commitees** la API key. Usá `.env.local` o variables de entorno del
  shell. `.env.example` solo tiene valores vacíos.
- Los logs enmascaran teléfonos y redactan direcciones (RNF-16), pero el cuerpo
  de la petición al LLM incluye el texto del usuario. Evitá enviar datos reales
  de clientes en pruebas.
- Cada request consume balance/Go. Para evals largos, estimá el costo con el
  campo `usage.cost` de la respuesta.
- Los modelos free (`*-free`) dan 403 fuera de OpenCode. Usá modelos pagos o Go.

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `401 Unauthorized` | Key inválida o expirada | Regenerar la key en Console. |
| `403 Forbidden` | Modelo free usado fuera de OpenCode | Cambiar a un modelo pago (`glm-5.3`, etc.) o activar Go. |
| `404 Not Found` | Base URL mal formada | Verificar que termine en `/v1` y que el modelo exista en `/inference/v1/models`. |
| `ChatModel failed: 400` | Parámetros no soportados | Revisar que la app envíe `temperature` y `messages` (soportados). |
| Respuestas vacías | Modelo no disponible en la región | Probar otro modelo de la lista. |
| Tests unitarios fallan | Los tests usan el stub por defecto | No afecta; los tests no requieren red. |

## Referencias

- `apps/api/src/llm/interface.ts` — `ChatModel`, `createHostedChatModel`, `createLocalChatModel`.
- `apps/api/src/config.ts` — variables `CHAT_*`.
- PRD §19.1, §19.3 — perfiles A/B y variables de entorno.
- PRD §21.2 — umbrales de eval.
- OpenCode Inference API: https://opencode.ai/v2/docs/console/api/inference/

## Variables de entorno (.env)

Las credenciales (LLM, STT, WhatsApp) se leen desde `.env` en la raíz (gitignored). Copiá `.env.example` a `.env` y editá. El compose carga `.env` vía `env_file`. `make dev-up` crea `.env` desde `.env.example` si falta.
