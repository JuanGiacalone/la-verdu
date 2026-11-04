# Guía: testear en modo local (perfil A, en sitio)

El **modo local** (perfil A del PRD) usa un LLM y un STT que corren en la misma
máquina o red local, sin API key ni dependencia de la nube. Es el perfil pensado
para el despliegue en sitio (I7) y sirve para validar que la app funciona contra
servidores OpenAI-compatible locales (Ollama, llama.cpp, vLLM, faster-whisper,
whisper.cpp, etc.).

## Cuándo usar este modo

- Validar el adaptador local (`createLocalChatModel`, `createLocalStt`) sin claves.
- Probar latencia y calidad de un modelo local antes de desplegar en sitio.
- Trabajar offline o en entornos sin acceso a internet.
- Correr evals contra un modelo local para comparar con el híbrido.

En el día a día se sigue usando el `llm-stub`/`stt-stub`. El modo local es para
validación puntual.

## Requisitos

- Un servidor LLM local con API compatible con OpenAI Chat Completions.
- Un servidor STT local con API compatible con OpenAI Audio Transcriptions
  (opcional; si no hay, dejá el `stt-stub`).
- Node.js 22 y el stack local de La Verdu (PostgreSQL).

## 1. Levantar un LLM local

### Opción A: Ollama (recomendado para empezar)

```bash
# Instalar Ollama (https://ollama.com)
curl -fsSL https://ollama.com/install.sh | sh

# Descargar un modelo (ej. llama3.1)
ollama pull llama3.1:8b

# Ollama expone OpenAI-compatible API en http://localhost:11434/v1
ollama serve
```

### Opción B: llama.cpp (llama-server)

```bash
# Compilar o descargar llama-server
./llama-server -m ./models/llama-3.1-8b-instruct.Q4_K_M.gguf --port 8080

# API compatible en http://localhost:8080/v1
```

### Opción C: vLLM

```bash
python -m vllm.entrypoints.openai.api_server \
  --model meta-llama/Llama-3.1-8B-Instruct \
  --port 8000

# API compatible en http://localhost:8000/v1
```

## 2. Levantar un STT local (opcional)

### faster-whisper (servidor OpenAI-compatible)

```bash
# Usando faster-whisper-server o whisper.cpp server
# Debe exponer POST /v1/audio/transcriptions
# Ejemplo con whisper.cpp:
./server -m models/ggml-base.bin --port 8083

# API compatible en http://localhost:8083/v1
```

Si no tenés STT local, dejá el `stt-stub` (transcripciones desde fixtures).

## 3. Configurar las variables de entorno

La app usa `CHAT_BASE_URL`, `CHAT_API_KEY`, `CHAT_MODEL` y `STT_BASE_URL`,
`STT_API_KEY`, `STT_MODEL` (ver `apps/api/src/config.ts`). Para modo local,
la API key queda vacía:

```bash
# LLM local (Ollama por defecto)
export CHAT_BASE_URL="http://localhost:11434/v1"
export CHAT_API_KEY=""          # sin clave
export CHAT_MODEL="llama3.1:8b"

# STT local (o stub)
export STT_BASE_URL="http://localhost:8083"
export STT_API_KEY=""
export STT_MODEL="whisper-base"

# Base de datos
export DATABASE_URL="postgres://laverdu:laverdu_dev_only@127.0.0.1:5433/laverdu"
```

### Con `.env` local (recomendado)

Copiá `.env.example` a `.env.local` (no commiteado) y completá los valores.
`.env.local` debe estar en `.gitignore`.

## 4. Verificar el proveedor con curl

### LLM

```bash
curl -sS -X POST "http://localhost:11434/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3.1:8b","messages":[{"role":"user","content":"Respondé OK"}],"temperature":0}' \
  | jq .
```

Deberías ver un `choices[0].message.content`. Si recibís 404, verificá que el
modelo esté descargado (`ollama list`).

### STT

```bash
curl -sS -X POST "http://localhost:8083/v1/audio/transcriptions" \
  -F "file=@evals/audio/sample.ogg" \
  -F "model=whisper-base" \
  -F "language=es" \
  | jq .
```

## 5. Probar el flujo conversacional (manual)

### Opción A: API directa

```bash
export NODE_ENV=development
cd apps/api && npm run dev
```

En otra terminal:

```bash
make dev-sim-msg FROM=+5491100000201 TEXT="tomate 2 kg y lechuga 1"
```

Revisá la respuesta del WhatsApp-sim y el printout en `.dev/printouts/`.

### Opción B: con compose (perfil A parcial)

Levantá el stack normal (usa los stubs) y sobreescribí las variables del
servicio `api`:

```bash
cat > infra/compose/dev.local.yml <<'EOF'
services:
  api:
    environment:
      CHAT_BASE_URL: "http://host.containers.internal:11434/v1"
      CHAT_API_KEY: ""
      CHAT_MODEL: "llama3.1:8b"
      STT_BASE_URL: "http://host.containers.internal:8083"
      STT_API_KEY: ""
      STT_MODEL: "whisper-base"
EOF
docker-compose -f infra/compose/dev.yml -f infra/compose/dev.local.yml up -d
```

> En Podman/Docker, `host.containers.internal` (o `host.docker.internal`) apunta
> al host. No commitees `dev.local.yml` ni la key. Agregalo a `.gitignore`.

## 6. Correr los evals con el proveedor local

```bash
CHAT_BASE_URL="http://localhost:11434/v1" \
CHAT_API_KEY="" \
CHAT_MODEL="llama3.1:8b" \
STT_BASE_URL="http://localhost:8083" \
STT_API_KEY="" \
STT_MODEL="whisper-base" \
TEST_DATABASE_URL="postgres://laverdu:laverdu_dev_only@127.0.0.1:5433/laverdu_test" \
npx tsx evals/run-evals.ts --provider=local --audio
```

Verificá los umbrales del PRD 21.2 (95% productos/cantidades, 0 precios
inventados, 0 confirmaciones sin "sí"). Los modelos locales suelen tener menor
calidad; compará con el modo híbrido.

## 6.5 Modelos recomendados por hardware

La calidad del modo local depende del modelo y del hardware disponible. Estas son
recomendaciones orientativas para el LLM (Ollama tags) y el STT.

### LLM (Ollama)

| Hardware | Modelo recomendado | Tag | RAM/VRAM aprox. | Notas |
|---|---|---|---|---|
| CPU only, 8 GB RAM | Llama 3.1 8B (Q4) | `llama3.1:8b` | ~5 GB | Mínimo viable para pruebas. |
| CPU only, 16 GB RAM | Llama 3.1 8B (Q8) o Mistral 7B | `llama3.1:8b` / `mistral:7b` | ~8-9 GB | Mejor calidad, más lento. |
| GPU 8 GB VRAM | Llama 3.1 8B (Q4/Q8) | `llama3.1:8b` | ~5-8 GB | Rápido, buena calidad. |
| GPU 12-16 GB VRAM | Llama 3.1 8B (fp16) o Qwen 2.5 14B | `llama3.1:8b` / `qwen2.5:14b` | ~16 GB | Mayor calidad. |
| GPU 24+ GB VRAM | Llama 3.1 70B (Q4) | `llama3.1:70b` | ~40 GB | Calidad cercana a modelos hospedados. |
| GPU 48+ GB VRAM | Llama 3.1 70B (Q8/fp16) | `llama3.1:70b` | ~75 GB | Máxima calidad local. |

Para tareas de parsing estructurado (JSON), preferí modelos **instruct/chat** con
buen seguimiento de formato. Los modelos base (no instruct) suelen no respetar
el formato JSON del prompt.

### STT (Whisper)

| Hardware | Modelo recomendado | Tamaño | VRAM/RAM aprox. | Notas |
|---|---|---|---|---|
| CPU only, 4 GB RAM | Whisper tiny/base | `tiny` / `base` | ~1 GB | Rápido, menor precisión. |
| CPU only, 8 GB RAM | Whisper small | `small` | ~2 GB | Buen balance. |
| GPU 4 GB VRAM | Whisper medium | `medium` | ~5 GB | Buena precisión, rápido en GPU. |
| GPU 8+ GB VRAM | Whisper large-v3 | `large-v3` | ~10 GB | Máxima precisión. |

Para español rioplatense, `medium` o `large-v3` dan mejor resultado. `tiny`/`base`
suelen fallar con nombres de productos y cantidades.

### Criterio de selección

1. **Primero probá con el más chico** que entre en tu hardware (`llama3.1:8b`,
   `whisper small`). Si la calidad no alcanza los umbrales del PRD 21.2, subí.
2. **Medí la latencia** end-to-end (`make dev-sim-msg` → respuesta). Si supera
   los 5 s (RNF-11), bajá el modelo o quantizá más.
3. **Compará con el modo híbrido**: corré los mismos evals en ambos modos y
   compará la tasa de acierto. Si el local queda muy por debajo, considerá
   desplegar el híbrido o mejorar el hardware.
4. **No uses modelos base** (sin instruct) para parsing: no respetan el JSON.

## 7. Volver al stub (default)

```bash
unset CHAT_BASE_URL CHAT_API_KEY CHAT_MODEL STT_BASE_URL STT_API_KEY STT_MODEL
# o restaurar .env con los defaults del stub:
# CHAT_BASE_URL=http://localhost:8082
# CHAT_API_KEY=
# CHAT_MODEL=llm-stub
# STT_BASE_URL=http://localhost:8083
# STT_API_KEY=
# STT_MODEL=stt-stub
```

Con compose, bajá el override y volvé a `make dev-up`.

## Diferencias con el modo híbrido

| Aspecto | Modo local (perfil A) | Modo híbrido (perfil B) |
|---|---|---|
| LLM | Servidor local (Ollama, llama.cpp, vLLM) | API hospedada (OpenCode, OpenAI, etc.) |
| STT | Servidor local (faster-whisper, whisper.cpp) | API hospedada (Whisper API) |
| API key | No requiere | Requiere (`CHAT_API_KEY`) |
| Calidad | Depende del modelo y hardware | Generalmente mayor |
| Latencia | Depende del hardware local | Depende de la red |
| Costo | Hardware propio | Por request (balance/Go) |
| Offline | Sí | No |

El código es el mismo: `createLocalChatModel`/`createLocalStt` usan la misma
interfaz OpenAI-compatible que `createHostedChatModel`/`createHostedStt`, solo
sin API key. La lógica de negocio no cambia (ADR-005).

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `ECONNREFUSED` al LLM | Servidor local no levantado | Levantar Ollama/llama.cpp/vLLM. |
| `model not found` | Modelo no descargado | `ollama pull <modelo>` o verificar ruta del GGUF. |
| Respuestas lentas | Hardware insuficiente | Usar un modelo más chico (ej. `llama3.1:8b` en vez de 70b) o quantizado. |
| `404 Not Found` en STT | Endpoint no implementado | Verificar que el servidor STT exponga `/v1/audio/transcriptions`. |
| JSON inválido del LLM | Modelo no sigue el formato | Usar un modelo instruct (chat) y verificar el prompt. Probar con un modelo más capaz. |
| Tests unitarios fallan | Los tests usan el stub por defecto | No afecta; los tests no requieren red. |

## Referencias

- `apps/api/src/llm/interface.ts` — `ChatModel`, `createHostedChatModel`, `createLocalChatModel`.
- `apps/api/src/stt/interface.ts` — `SttProvider`, `createHostedStt`, `createLocalStt`.
- `apps/api/src/config.ts` — variables `CHAT_*` y `STT_*`.
- PRD §3.2, §12.3 — perfiles A y B, adaptador local.
- PRD §19.1, §19.3 — perfiles y variables de entorno.
- PRD §21.2 — umbrales de eval.
- `docs/hybrid-mode-testing.md` — guía del modo híbrido (para comparar).
