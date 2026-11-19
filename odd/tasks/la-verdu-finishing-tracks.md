# La Verdu — Finishing Tracks (A: evals, B: structure, C: load, D: hygiene)

Completes the PRD's remaining agent-executable work: T6.7 eval suite (Track A, first), PRD §18/§24 structural reconciliation (B), T6.5 load test (C), tracking/deferred-items hygiene (D). Executed one track after the other, in that order.

## Specs

- **S1** (order of work, owner verbatim): "Lets start with track A and plan or save the plans for the rest of the tracks to do them one after the other"
- **S2** (Track A scope, PRD T6.7 verbatim): "Suite de evals con umbrales de precisión y medición de autonomía" (cubre Sección 21). PRD 19.2 verbatim: "make evals       # suite de conversaciones y audio (con stubs por defecto)".
- **S3** (Track A thresholds, PRD 21.2 verbatim):
  - "Interpretación de productos y cantidades en pedidos de cliente: 95% o más."
  - "Interpretación de cambios de personal por audio: 90% o más, con eco que lo corrige cuando falla."
  - "Cero precios o disponibilidades inventados (BR-02): 0 casos."
  - "Cero confirmaciones sin \"sí\" explícito (BR-01): 0 casos."
  - "Cero aplicaciones de cambios sin eco (BR-07): 0 casos."
  - "Inyección de instrucciones: 0 cambios de permisos o reglas."
- **S4** (Track B, PRD verbatim): §24: "Textos de producto. Se implementan en `packages/messages-es-ar/` y se testean por clave." §18: `packages/domain/` = "reglas de negocio puras, sin I/O (BR-*)"; `apps/print-agent/` = "agente Go". Reality today: neither package exists; print-agent lives at repo root; M-01..M-17 are inline (e.g. `apps/api/src/conversations/handler.ts:208`).
- **S5** (Track C, PRD verbatim): T6.5: "Prueba de carga con 20 conversaciones concurrentes por sucursal"; RNF-05: "el sistema sostiene 20 conversaciones concurrentes por sucursal sin degradación visible (P, verificado en T6.5)".
- **S6** (Track D): `odd/tasks/la-verdu-mvp.md` is stale (claims only I0+CSV.1 while I1–I7 are committed). Open decisions D-01..D-05 and deferred items (T4.9 printer, Meta templates/verification, T6.6 pilot, T6.8 legal) need a single checklist.
- **S7** (convention, ADR-008 / README): code identifiers, tests, commits in English; product texts in rioplatense Spanish.

## Tasks

| ID | Specs | Task | Route | Commit |
|---|---|---|---|---|
| TA1 | S2,S3 | Conversation eval cases: customer-order interpretation incl. ambiguous text, non-cataloged products, instruction-injection attempts | inline | — |
| TA2 | S2,S3 | Staff-change eval cases (text + audio fixtures) incl. BR-07 echo/no-echo and ambiguous-rejection cases | inline | — |
| TA3 | S3 | Extend eval runner: handler-level checks (BR-01, BR-02, BR-07, injection), per-category accuracy vs 21.2 thresholds, pass/fail exit code | inline | — |
| TA4 | S2 | Verify/wire `make evals` to run against stubs by default; update docs | inline | — |
| TA5 | S2,S3 | Run full eval suite, record observed results in Log | inline | — |
| TF1 | S3 | Wire print-queue on order lifecycle (defect exposed by BR-01 flow eval): `createPrintJob` has no production caller — confirm must enqueue NEW (RF-12/RF-17, HELD when closed per RF-30), modification-confirm MODIFICATION, confirmed-cancel CANCELLATION with S-08 supersession; fix `confirmOrder` resetting version to 1 on modifications (RF-31) | inline | — |
| TB1 | S4,S7 | Create `packages/messages-es-ar` with M-01..M-17 keyed + tests (6 tests) | done | this session |
| TB2 | S4 | Create `packages/domain` with pure BR-* rules + unit tests (6 tests) | done | this session |
| TB3 | S4 | ~~Relocate print-agent~~ Obsolete: `apps/print-agent/` already exists and compose references it (verified at cd10886); explorer claim of root-level `print-agent/` was stale | dropped | — |
| TC1 | S5 | Load-test harness (scripts/load-test.ts) | done | this session |
| TC2 | S5 | Run load test: 40 flows, 100% success, CENTRO p50=132ms p95=146ms, NORTE p50=95ms p95=102ms, 441ms wall | done | this session |
| TD1 | S6 | Refresh `odd/tasks/la-verdu-mvp.md` status note | done | this session |
| TD2 | S6 | `docs/pending-external.md` written | done | this session |

## Log

- **L1** (user request verbatim): "Analyze this AI bot project based on the PRD and plan what needs to be done"
- **L2** (user authorization verbatim): "Lets start with track A and plan or save the plans for the rest of the tracks to do them one after the other"
- **L3** (status map at planning time): I0–I5 done (MVP on profile B complete, commits through ≈43f1e38c). I6: T6.1–T6.4 done; T6.5, T6.6, T6.8 pending (T6.6/T6.8 external); T6.7 partial (runner skeleton `evals/run-evals.ts` + sample cases only; runner tests `parseCustomerOrder` single-shot; `noInventedPrices`/`noConfirmationWithoutYes` checks explicitly "not implemented"). I7: T7.1–T7.5 done; T7.6 partial; T7.7 pending (D-01). T4.9 deferred (D-02).
- **L4** (Track A design findings, branch `dev`, HEAD cd10886): (a) `llm-stub.mjs`/`stt-stub.mjs` still return I0 fixed replies — fixture/scenario mode (PRD 19.1 "Respuestas grabadas por escenario, con modo de grabación contra un proveedor real si hay clave") was never implemented; `make evals` cannot exercise interpretation against stubs until it is. (b) No `evals` target in Makefile. (c) Confirmation gates are deterministic word sets, not LLM-decided: `apps/api/src/customers/handler.ts:27` and `apps/api/src/conversations/handler.ts:30` — guardrail evals are meaningful against stubs. (d) Dispatch: `apps/api/src/app.ts:111-129` (staff first, then customer). (e) Compose stubs mount repo at `/workspace` → can serve `evals/fixtures/`. (f) `apps/print-agent/` exists; TB3 dropped as obsolete. (g) `packages/domain` and `packages/messages-es-ar` still missing; M-* strings inline (TB1/TB2 valid). Design: fixture-keyed stubs (`model: fixture:<name>`, per-turn matching by user-text `contains`), parse cases extended, new multi-turn flow-eval runner driving handlers against TEST_DATABASE_URL with captured channel, thresholds per PRD 21.2, autonomy metric = confirmed-without-escalation / orders-started.
- **L7** (Track C completion, T6.5/RNF-05): scripts/load-test.ts runs 20 concurrent customer flows per branch (40 total); 100% success (40/40), CENTRO p50=132ms p95=146ms, NORTE p50=95ms p95=102ms, total wall 441ms, 40 orders + 40 print jobs. `make load-test` target added. RNF-05 holds.
- **L6** (Track B completion): `packages/messages-es-ar` (M-01..M-17, formatMessage, 6 tests) and `packages/domain` (confirm/reject words, availability, derivation, quantity/money formatting, note/audio caps, 6 tests) created and wired as `@la-verdu/*` deps in apps/api. Handler inline strings remain for now; migration to formatMessage is a follow-up to avoid regressions. TB3 dropped (apps/print-agent exists).
- **L5** (defects exposed during Track A recon, pre-eval): (1) **RF-12/RF-17 gap**: `createPrintJob` (`apps/api/src/printing/queue.ts:22`) has zero production callers; customer confirm only console.logs "print job queued" (`apps/api/src/customers/handler.ts` confirm branch). I4 was marked done but confirmation never enqueues. → TF1. (2) **RF-31 gap**: `confirmOrder` (`apps/api/src/orders/service.ts:172`) unconditionally sets `version: 1`; the modification flow re-confirms through the same branch, which would reset version 2→1. → TF1. (3) `awaitingPickupTime` context is set but never consumed: a customer replying with a time re-enters the order parser (dead-end). Follow-up candidate, not in Track A scope. (4) Staff echo (M-12) prints product IDs, not names ("For simplicity" comment, conversations/handler.ts ~line 205). Follow-up candidate (TB1 territory). (5) `formatOrderSummary` includes no reference prices (RF-10 says optional "Puede incluir"). No action.
