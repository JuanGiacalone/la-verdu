# La Verdu

Asistente de WhatsApp para fruterías y verdulerías: pedidos por texto o audio, disponibilidad y precios por sucursal, e impresión de cada pedido en la sucursal que lo prepara.

La especificación completa está en [`PRD.md`](PRD.md). El seguimiento de implementación está en `odd/tasks/la-verdu-mvp.md`.

## Requisitos

- Node.js 22 (`.nvmrc`).
- Podman con rootless funcionando, `docker-compose` (compose v2+) y `make`.
- PostgreSQL 16 para los tests de integración. El stack local lo levanta el compose.

En Linux, podman rootless necesita el paquete `uidmap` (`newuidmap`, `newgidmap`) y una política de imágenes en `~/.config/containers/policy.json`.

## Puesta en marcha

```bash
npm install
make dev-up        # db, api, printer-sim, whatsapp-sim, llm-stub, stt-stub
make dev-seed      # sucursales, personal, catálogo y métodos de pago de prueba
make test          # tests unitarios y de contrato (sin base de datos)
make test-integration   # esquema y seed contra laverdu_test (requiere dev-up)
```

Comprobaciones rápidas:

```bash
curl localhost:3000/health/ready     # {"status":"ready",...}
make dev-sim-msg FROM=+5491100000201 TEXT=hola
make dev-printouts                   # impresiones simuladas en .dev/printouts/
```

## Personalización del negocio

La instancia se adapta a cada negocio configurando estos datos (no hay valores fijos en el código):

| Dato                              | Dónde se carga                           | Variable de entorno (seed)                        |
| --------------------------------- | ---------------------------------------- | ------------------------------------------------- |
| Nombre del negocio                | Admin → Configuración del negocio o seed | `BUSINESS_NAME` (default "La Verdu")              |
| Nombre del dueño                  | Admin → Configuración del negocio o seed | `BUSINESS_OWNER_NAME` (default "Dueño de prueba") |
| Teléfono del negocio              | Admin → Configuración del negocio o seed | `BUSINESS_PHONE`                                  |
| Dirección del negocio             | Admin → Configuración del negocio o seed | `BUSINESS_ADDRESS`                                |
| Sucursales                        | Admin → Sucursales                       | (seed: `CENTRO`, `NORTE`)                         |
| Personal y roles                  | Admin → Personal                         | (seed: dueño + 2 vendedores)                      |
| Productos y precios de referencia | Admin → Catálogo o importación CSV       | (seed: 5 productos)                               |
| Métodos de pago por sucursal      | Admin → Métodos de pago                  | (seed: 4 métodos)                                 |
| Horarios de atención              | Admin → Sucursales                       | (seed: ver PRD 19.4)                              |

Para crear una instancia para otro negocio:

```bash
BUSINESS_NAME="Mi Verdulería" BUSINESS_OWNER_NAME="Juan Pérez" make dev-seed
```

Después, ajustá sucursales, personal, productos y horarios desde el admin (`/admin`). El asistente usa el nombre del negocio desde la tabla `business` (campo `name`) en sus mensajes.

## Estructura

```
apps/api/           backend TypeScript (Fastify, Drizzle, PostgreSQL)
apps/admin/         panel de administración (I1)
apps/print-agent/   agente de impresión en Go (I4)
packages/           dominio, mensajes y render de impresión (se agregan por iteración)
infra/compose/      stack local de desarrollo y perfil en sitio (I7)
infra/simulators/   WhatsApp, impresora, LLM y STT simulados
odd/tasks/          seguimiento de la feature (ODD)
PRD.md              especificación del producto
```

## Convenciones

- Código, identificadores, tests y commits en inglés. Textos del producto (asistente, hoja impresa) en español rioplatense, según `PRD.md` secciones 14 y 24.
- Commits con Conventional Commits, sin atribución de IA.
- Los datos personales nunca aparecen en claro en logs: los teléfonos se enmascaran y las direcciones se redactan.
- Las credenciales de `infra/compose/dev.yml` son solo de desarrollo. Los secretos reales nunca se commitean.
