# La Verdu MVP (ODD feature)

Objective: build the MVP described in `PRD.md` v1.0 (iteration 1 on deployment profile B, local development with simulators for everything external). Authoritative spec: `PRD.md`. Branch: `JuanGiacalone/la-verdu`. Delivery strategy: `ask-on-risk`. Test runners: Vitest (API, domain, contracts), `go test` (print agent, from I4). Container runtime: podman rootless with `docker-compose` as the compose provider.

## Specs

- S1 (L1, verbatim): "Analiza idea.md y empezemos con un PRD detallado para llevar acabo este proyecto"
- S2 (L2, verbatim): "Si guarda el PRD.md con el maximo detalle y deja todo listo para empezar a implementar el PRD. En la primera iteracion usaremos el modelo hibrido pero quiero dejar todo listo para poder implementarlo localmente"
- S3 (L3, verbatim): "Stack aprobado empezemos con el proyecto"
- S4 (L4, verbatim): "Usemos podman"
- S5 (L5, verbatim): "Vamos con Feature Branch Chain"
- S6 (verbatim): "Excelente agreguemos la posibilidad de cargar productos usando un archivo .csv y dejemos idea.md afuera"
- S7: I0 implements `PRD.md` section 20, tasks T0.1 to T0.8, with the local dev environment of section 19.
- S8: All code identifiers in English. Product copy (assistant messages, printed sheet) in es-AR, per `PRD.md` sections 24 and 14.
- S9: The printed sheet and customer-facing rules come only from `PRD.md`. No implementation may add price, quality, payment amount or total to the printed sheet (`PRD.md` 14.3).
- S10: Local development runs without real WhatsApp, printer, LLM or STT accounts (`PRD.md` 19.5).
- S11: CSV product import reads "Descripción" and "Tipo de Venta" columns, handles ISO-8859 and UTF-8, maps "Peso" → KG and "Unidad" → UNIT, skips duplicates.

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I0.T0.1 | S3, S7, S8 | inline | done | 1c30639 | Monorepo npm workspaces, strict TS base, Biome, .nvmrc 22. lint and typecheck clean. |
| I0.T0.2 | S4, S7, S10 | inline | done | be4daf9 | infra/compose/dev.yml (db, api, printer-sim, whatsapp-sim, llm-stub, stt-stub, admin), Makefile PRD 19.2 commands. make dev-up healthy, dev-seed ok, test-integration ok on compose db. |
| I0.T0.3 | S7, S9 | inline | done | 83710ad | apps/api/src/db/schema.ts covers PRD 8 (19 tables). Migrations 0000, 0001, 0002 plus down scripts. Integration 6 passing plus 13 probes and rollback. Independent verifier ran; three blockers fixed in the same commit. |
| I0.T0.4 | S7, S10 | inline | done | 1c30639 | apps/api/src/config.ts zod, fail fast. Unit 6 passing (RED first). |
| I0.T0.5 | S7 | inline | done | 1c30639 | apps/api/src/logging.ts: JSON logs, phone masking, address/text redaction. Unit 3 passing (RED first). |
| I0.T0.6 | S7 | inline | done | a32d32c | app.ts, metrics.ts: /health/live, /health/ready, /metrics. Unit 4 passing (RED first). |
| I0.T0.7 | S7 | inline | done (not run on hosted CI) | 0f3961a | .github/workflows/ci.yml: lint, typecheck, unit, integration with Postgres service, prod audit. YAML validated. |
| I0.T0.8 | S7, S10 | inline | done | a968e25 | apps/api/src/db/seed.ts idempotent, PRD 19.4. Integration 5 passing (RED first). |
| CSV.1 | S6, S11 | inline | done | 53a4cf7 | POST /admin/products/import-csv endpoint. CSV parser (ISO-8859/UTF-8), extractProducts, importProductsFromCsv. Unit 10 passing, integration 4 passing. Admin web (React + Vite) with upload screen. |

Route declaration: all tasks inline. No writer reason. Test-first: RED observed for each behavior test before implementation.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres) and `TEST_DATABASE_URL` against the host Postgres: 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean.
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.

## Log

- L1 (S1, verbatim): "Analiza idea.md y empezemos con un PRD detallado para llevar acabo este proyecto"
- L2 (S2, verbatim): "Si guarda el PRD.md con el maximo detalle y deja todo listo para empezar a implementar el PRD. En la primera iteracion usaremos el modelo hibrido pero quiero dejar todo listo para poder implementarlo localmente"
- L3 (S3, verbatim): "Stack aprobado empezemos con el proyecto"
- L4 (S4, verbatim): "Usemos podman"
- L5 (verbatim): "Vamos con Feature Branch Chain"
- L6 (verbatim): "Excelente agreguemos la posibilidad de cargar productos usando un archivo .csv y dejemos idea.md afuera"
- L7: Environment: podman 6.1.4 via Homebrew; rootless needed `uidmap` (installed by the user with sudo) and user-level `~/.config/containers/policy.json` and `registries.conf`. Socket `/run/user/1000/podman/podman.sock` via `podman system service`. Compose provider `docker-compose` 5.6.1 via `DOCKER_HOST`.
- L8: Environment: `pnpm`, `go` and `ffmpeg` are missing. npm workspaces are used instead of pnpm (no global install). Go is needed from I4 (print agent). ffmpeg is needed from I2 (audio conversion).
- L9: Environment: host PostgreSQL 16 on `localhost:5432` (user `jp`): `laverdu_dev` and `laverdu_test` created early. Compose Postgres on `127.0.0.1:5433` with `laverdu_dev` and `laverdu_test` (initdb).
- L10: Correction to `PRD.md` section 8: the current price is stored in `branch_product` (per branch and product), not in the daily availability record. The PRD table was updated. BR-06 is unchanged.
- L11: Interpretation: PRD 19.4 asks for "3 clientes de prueba con sucursal preferida distinta". With two branches, the seed uses three cases: no preferred branch, CENTRO, and NORTE.
- L12: Defect found and fixed during T0.3: the Drizzle migrator stores its journal in the `drizzle` schema, so the test reset must drop it too. Otherwise migrations are skipped silently. Covered by `resetDatabase`.
- L13: Defect found and fixed during T0.3: integration test files share a database and must run one at a time (`fileParallelism: false` in `apps/api/vitest.config.ts`).
- L14: Independent verifier ran on commit 83710ad (replacing the first version of that commit). It found three blockers: `audit_log` was mutable, `payment_method.active` was missing, and migrations were not reversible. All three were fixed in the same commit, along with advisory checks for phone shape, non-negative price and print version. Rollback proved with `migrations.test.ts`.
- L15: CSV import feature added (commit 53a4cf7). Endpoint + admin web + tests. The CSV is a POS export with 44 columns; only "Descripción" and "Tipo de Venta" are used. Encoding: ISO-8859.
- L16: Delivery: I0 lands in eight commits (1c30639, a32d32c, 83710ad, a968e25, be4daf9, 0f3961a, e0d12ae, 53a4cf7), about 8,000 authored lines. The ~400-line threshold applies to review slices, not to this commit count; the last commit closes the feature. `PRD.md`, `README.md` and the ODD task file are versioned. `idea.md` is not.
- L17: Pending user decision: whether `idea.md` is versioned in this repo.
- L18: Added `reference_price` field to product (CSV import + admin) and a `business` table for per-instance customization (name, owner, phone, address) with env-based seed (`BUSINESS_NAME`, etc.) and admin ABM. Updated PRD guardrails (M-02, section 10.3) and README with onboarding instructions.
- L19: Added `agent_notes` (text) to the `business` table and a form in the admin Config page to configure business fields (name, owner, phone, address) plus free-text agent notes that are appended to the agent's guardrails and instructions. Migration `0007_business_agent_notes`.
- L20: Fixed pre-existing build-blocking TS errors in integration tests (mock.calls typing) and vitest config to exclude dist/. Build now passes.
- L21: Made the admin reflect the business name dynamically (login page, site title, sidebar header) via a public GET /business endpoint. Updated PRD.
