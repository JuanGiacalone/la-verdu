# Guía de testing

## Tipos de tests

| Tipo | Herramienta | Ubicación | Requiere DB | Requiere red |
|---|---|---|---|---|---|
| Unitarios | Vitest | `apps/api/test/*.test.ts` | No | No |
| Contrato | Vitest + fixtures | `apps/api/test/*.test.ts` | No | No |
| Integración | Vitest + PostgreSQL | `apps/api/test/integration/*.test.ts` | Sí | No |
| Golden (render) | Vitest | `packages/print-render/test/*.test.ts` | No | No |
| E2E | Script + simuladores | `evals/` (futuro) | Sí (compose) | No |
| Evals (LLM) | Runner propio | `evals/conversations/*.json` | No | Sí (LLM) |
| Evals (audio) | Runner propio | `evals/audio/*` | No | Sí (STT) |

## Comandos

```bash
# Tests unitarios y de contrato (sin base de datos)
npm test

# Tests de integración (requiere PostgreSQL)
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/laverdu_test npm run test:integration -w @la-verdu/api

# Tests del render (golden files)
cd packages/print-render && npx vitest run

# Lint
npm run lint

# Typecheck
npm run typecheck

# Todo junto (como CI)
npm run lint && npm run typecheck && npm test && npm run test-integration -w @la-verdu/api
```

## Con entorno local (compose)

```bash
make dev-up          # Levanta db, api, simulators
make dev-seed        # Carga datos de prueba
make test            # Unit + contract
make test-integration # Schema + seed + CSV import + migrations
```

## Tests unitarios

### Configuración
- Archivo: `apps/api/test/config.test.ts`
- Prueba: validación de variables de entorno, defaults, errores.
- Ejecutar: `npx vitest run test/config.test.ts`

### Logging
- Archivo: `apps/api/test/logging.test.ts`
- Prueba: enmascaramiento de teléfonos, redacción de direcciones y texto.
- Ejecutar: `npx vitest run test/logging.test.ts`

### Health y métricas
- Archivo: `apps/api/test/health.test.ts`
- Prueba: liveness, readiness (DB ok/error), métricas Prometheus.
- Ejecutar: `npx vitest run test/health.test.ts`

### CSV import (parser)
- Archivo: `apps/api/test/products/csv-import.test.ts`
- Prueba: parsing de CSV, extracción de productos, validación de tipos de venta.
- Ejecutar: `npx vitest run test/products/csv-import.test.ts`

## Tests de integración

Requieren `TEST_DATABASE_URL` apuntando a una base de datos PostgreSQL que termine en `_test`.

### Esquema
- Archivo: `test/integration/schema.test.ts`
- Prueba: creación de 20 tablas, constraints (unique, check, FK), idempotencia de mensajes, order_number global.
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/schema.test.ts`

### Migraciones
- Archivo: `test/integration/migrations.test.ts`
- Prueba: migraciones versionadas y reversibles (rollback y re-apply).
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/migrations.test.ts`

### Probes de constraints
- Archivo: `test/integration/schema-probes.test.ts`
- Prueba: 13 probes de constraints (phone format, price non-negative, version positive, etc.).
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/schema-probes.test.ts`

### Seed
- Archivo: `test/integration/seed.test.ts`
- Prueba: dataset PRD 19.4, idempotencia, métodos de pago por sucursal.
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/seed.test.ts`

### Modificación de pedido (customer)
- Archivo: `test/integration/order-modification.test.ts`
- Prueba: el customer modifica un pedido confirmado ("modificar" → nueva versión 2 con resumen).
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/order-modification.test.ts`

### Cancelación (customer y staff)
- Archivo: `test/integration/cancellation.test.ts`
- Prueba: el customer cancela un pedido pendiente ("cancelar" → CANCELLED); el staff rechaza un change set ("no" → REJECTED, sin aplicar cambios).
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/cancellation.test.ts`

### Confirmación de cambios de personal (staff)
- Archivo: `test/integration/staff-confirmation.test.ts`
- Prueba: el bot propone cambios y pide "sí"; no aplica hasta confirmación explícita; el precio aplicado es el del input (noInventedPrices).
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/staff-confirmation.test.ts`

### Confirmación de pedido (customer)
- Archivo: `test/integration/customer-confirmation.test.ts`
- Prueba: el bot envía resumen y pide "sí"; no confirma hasta recibir "sí" explícito (noConfirmationWithoutYes).
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/customer-confirmation.test.ts`

### CSV import (endpoint)
- Archivo: `test/integration/csv-import.test.ts`
- Prueba: importación end-to-end, duplicados, errores de fila, body vacío.
- Ejecutar: `TEST_DATABASE_URL=... npx vitest run test/integration/csv-import.test.ts`

## Tests de render (golden files)

- Ubicación: `packages/print-render/test/render.test.ts`
- Prueba: formato de hoja impresa, cantidades, etiquetas, tildes, corte.
- Ejecutar: `cd packages/print-render && npx vitest run`

### Golden file de render (snapshot)
- Archivo: `packages/print-render/test/render.test.ts` (test `preview matches golden file (snapshot)`)
- Genera/actualiza: `packages/print-render/test/__snapshots__/render.test.ts.snap`
- Ejecutar: `cd packages/print-render && npx vitest run`
- Actualizar snapshots: `cd packages/print-render && npx vitest run -u`

### Agregar un golden file nuevo
1. Crear un `PrintJobData` en el test.
2. Ejecutar `npx vitest run -u` para actualizar los snapshots.
3. Revisar el snapshot generado en `__snapshots__/`.
4. Commitear el snapshot junto con el test.

## Evals (LLM)

### Estructura
- Casos: `evals/conversations/*.json` (input + expected).
- Audios: `evals/audio/*` (audio + transcripción de referencia).
- Runner: `evals/run-evals.ts`.

### Ejecutar
```bash
# Conversaciones (texto)
npx tsx evals/run-evals.ts

# Incluir audio evals (requiere archivos en evals/audio/ y STT configurado)
npx tsx evals/run-evals.ts --audio
```

### Umbrales (PRD 21.2)
- Interpretación de productos y cantidades: 95% o más.
- Interpretación de cambios de personal por audio: 90% o más.
- Cero precios o disponibilidades inventados: 0 casos.
- Cero confirmaciones sin "sí" explícito: 0 casos.
- Inyección de instrucciones: 0 cambios de permisos o reglas.

### Agregar un caso de eval
1. Crear un archivo JSON en `evals/conversations/`.
2. Incluir: `id`, `input`, `expected` (products, quantities, fulfillment, noInventedPrices, noConfirmationWithoutYes).
3. Ejecutar el runner y verificar que el caso pasa.

## Modo local (LLM/STT local, perfil A)

Para probar contra un LLM/STT local (Ollama, llama.cpp, vLLM, faster-whisper)
sin API key, ver la guía dedicada:

- [`docs/local-mode-testing.md`](local-mode-testing.md)

Resumen rápido:

```bash
export CHAT_BASE_URL="http://localhost:11434/v1"
export CHAT_API_KEY=""
export CHAT_MODEL="llama3.1:8b"
make dev-up
```

## Modo híbrido (LLM real)

Para probar el flujo conversacional contra un proveedor LLM real (OpenCode) en
lugar del `llm-stub`, ver la guía dedicada:

- [`docs/hybrid-mode-testing.md`](hybrid-mode-testing.md)

Resumen rápido:

```bash
export CHAT_BASE_URL="https://opencode.ai/inference/openai/v1"
export CHAT_API_KEY="oc_sk_..."
export CHAT_MODEL="glm-5.3"
make dev-up   # con override compose, o correr la API directa
```

Los tests unitarios y de integración **no** requieren red ni clave; siguen
usando el stub por defecto.

## CI pipeline

El workflow `.github/workflows/ci.yml` ejecuta:
1. Lint (Biome).
2. Typecheck (TypeScript strict).
3. Tests unitarios y de contrato.
4. Tests de integración (con PostgreSQL 16 como servicio).
5. Auditoría de dependencias (producción, high+).

Para replicar localmente:
```bash
npm run lint && npm run typecheck && npm test && npm run test-integration -w @la-verdu/api
```

## Cobertura esperada

No hay un umbral de cobertura configurado. El enfoque es test-first: cada comportamiento nuevo tiene un test que falla antes de la implementación. Los tests deben cubrir:
- Todas las reglas de negocio (BR-*) con al menos un test.
- Todos los endpoints de la API con al menos un test de integración.
- El render ESC/POS con golden files.
- Los parsers de CSV con casos de borde.

## Troubleshooting de tests

### "TEST_DATABASE_URL is required"
Los tests de integración requieren una base de datos PostgreSQL. Configurar:
```bash
export TEST_DATABASE_URL=postgres://user:pass@localhost:5432/laverdu_test
```

### "relation does not exist"
La base de datos de test no tiene las migraciones aplicadas. Ejecutar:
```bash
cd apps/api && TEST_DATABASE_URL=... npx tsx src/db/migrate.ts
```
O usar `resetDatabase` + `runMigrations` en el test (ya incluido en los tests existentes).

### "Cannot find module"
Ejecutar `npm install` desde la raíz del proyecto para instalar dependencias de todos los workspaces.

### Tests que fallan por orden de ejecución
Los tests de integración comparten una base de datos. `fileParallelism: false` en `vitest.config.ts` asegura ejecución secuencial. No cambiar esta configuración.