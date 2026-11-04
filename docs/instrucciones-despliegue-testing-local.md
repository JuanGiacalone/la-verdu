# Instrucciones para despliegue local a testing

Guía para levantar La Verdu en un entorno local de desarrollo y testing (perfil B con simuladores, o perfil A con LLM/STT locales). Sirve para validar cambios, correr tests de integración y probar el flujo completo sin credenciales reales.

## 1. Requisitos

- Node.js 22 (`.nvmrc`).
- Podman rootless con `docker-compose` (compose v2+) y `make`.
- PostgreSQL 16 para tests de integración (el stack local lo levanta en compose).
- En Linux: paquete `uidmap` (`newuidmap`, `newgidmap`) y política de imágenes en `~/.config/containers/policy.json`.

## 2. Instalación inicial

```bash
git clone <repo-url> la-verdu
cd la-verdu
npm install
```

## 3. Levantar el stack local (perfil B, con simuladores)

```bash
make dev-up        # db, api, printer-sim, whatsapp-sim, llm-stub, stt-stub, admin
make dev-seed      # sucursales, personal, catálogo, métodos de pago y negocio de prueba
```

Comprobaciones rápidas:

```bash
curl localhost:3000/health/ready     # {"status":"ready","checks":{"database":"ok"}}
make dev-sim-msg FROM=+5491100000201 TEXT=hola
make dev-printouts                   # impresiones simuladas en .dev/printouts/
```

Variables de entorno para personalizar el negocio en el seed:

```bash
BUSINESS_NAME="Mi Verdulería" BUSINESS_OWNER_NAME="Juan Pérez" make dev-seed
```

## 4. Correr tests

```bash
# Tests unitarios y de contrato (sin base de datos)
make test
# o: npm test

# Tests de integración (requiere dev-up o Postgres en localhost:5433)
make test-integration
# o: TEST_DATABASE_URL=postgres://jp@localhost:5432/laverdu_test npm run test:integration -w @la-verdu/api

# Typecheck y lint
make typecheck
make lint
```

## 5. Modo local (perfil A, LLM/STT en la máquina)

Para validar adaptadores locales sin API key:

### 5.1 Levantar LLM local

**Ollama (recomendado):**

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1:8b
ollama serve   # API en http://localhost:11434/v1
```

**llama.cpp:**

```bash
./llama-server -m ./models/llama-3.1-8b-instruct.Q4_K_M.gguf --port 8080
# API en http://localhost:8080/v1
```

**vLLM:**

```bash
python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct --port 8000
# API en http://localhost:8000/v1
```

### 5.2 Levantar STT local (opcional)

```bash
# whisper.cpp server
./server -m models/ggml-base.bin --port 8083
# API en http://localhost:8083/v1
```

Si no hay STT local, dejá el `stt-stub`.

### 5.3 Configurar variables de entorno

```bash
export CHAT_BASE_URL=http://localhost:11434/v1
export CHAT_API_KEY=
export CHAT_MODEL=llama3.1:8b
export STT_BASE_URL=http://localhost:8083
export STT_API_KEY=
export STT_MODEL=whisper-1
```

### 5.4 Levantar el stack en modo local

```bash
cp infra/compose/dev.local.yml.example infra/compose/dev.local.yml
# Editar dev.local.yml con los endpoints locales

make dev-up-local      # stack + LLM/STT locales
make dev-local-check   # probe de endpoints
make dev-down-local    # detener
```

## 6. Aplicar migraciones manualmente (testing)

```bash
# Reset completo de la base de test (solo laverdu_test)
psql -U jp -d laverdu_test -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;"

# Migrar
DATABASE_URL="postgres://jp@localhost:5432/laverdu_test" npx tsx apps/api/src/db/migrate.ts

# Seed
DATABASE_URL="postgres://jp@localhost:5432/laverdu_test" npx tsx apps/api/src/db/seed.ts
```

## 7. Buildear para testing

```bash
# Build de api y admin
npm run build

# Build del agente de impresión
cd apps/print-agent && CGO_ENABLED=0 go build -o print-agent . && cd ../..
```

## 8. Rollback de migraciones (testing)

```bash
cd apps/api
npx tsx -e "import('./src/db/migrate.js').then(m => m.rollbackMigrations(process.env.DATABASE_URL!, N))"
```

## 9. Estructura de pruebas

| Nivel | Herramienta | Comando |
|---|---|---|
| Unit | Vitest | `npm test` |
| Integración | Vitest + Postgres | `make test-integration` |
| Typecheck | tsc | `make typecheck` |
| Lint | Biome | `make lint` |
| E2E | Script + compose | `make test-e2e` (cuando esté disponible) |

## 10. Notas

- El seed es idempotente: correrlo varias veces no duplica datos.
- Los tests de integración requieren `TEST_DATABASE_URL` apuntando a una base que termine en `_test`.
- El stack local usa puertos: API 3000, db 5433 (compose) o 5432 (host), whatsapp-sim 8081, printer-sim 9100, llm-stub 8082, stt-stub 8083.
- Para detener todo: `make dev-down`.
