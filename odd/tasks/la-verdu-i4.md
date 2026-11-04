# La Verdu I4: Impresión (ODD feature)

Objective: implement I4 from PRD.md section 20 (T4.1-T4.9): ESC/POS render, print queue with states and retries, Go print agent, HELD state and release, version labels, printer status and alerts, reprint endpoint. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I4 implements PRD.md section 20, tasks T4.1 to T4.9.
- S2: Printed sheet format per PRD.md section 14 (80mm, 48 columns, no price/quality/total).
- S3: Print job states per PRD.md section 9.3.
- S4: Go print agent per PRD.md section 13.3.

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I4.T4.1 | S1, S2 | inline | done | a4c5ffd | packages/print-render/src/render.ts. ESC/POS bytes + text preview. 12 tests. |
| I4.T4.2 | S1, S2 | inline | done | a4c5ffd | Golden tests in render.test.ts: new, modification, cancellation, derivation, delivery, notes, accents, cut. |
| I4.T4.3 | S1, S3 | inline | done | a4c5ffd | apps/api/src/printing/queue.ts. createPrintJob, markDispatched, markPrinted, markFailed, retryJob, reprintJob, getPendingJobs. |
| I4.T4.4 | S1, S4 | inline | done | a4c5ffd | apps/print-agent/main.go. WebSocket, SQLite spool, dedup, TCP print, ack, heartbeat, reconnect. Dockerfile. |
| I4.T4.5 | S1, S3 | inline | done | a4c5ffd | releaseHeldJobs (HELD → QUEUED). Called at start of day. |
| I4.T4.6 | S1, S3 | inline | done | a4c5ffd | supersedeOldJobs. Version labels in render (MODIFICACION, CANCELADO). |
| I4.T4.7 | S1, S3 | inline | done | a4c5ffd | createPrinterAlert. Printer status in heartbeat. |
| I4.T4.8 | S1 | inline | done | a4c5ffd | POST /admin/print-jobs/:id/reprint, POST /admin/print-jobs/:id/retry, GET /admin/print-jobs. |
| I4.T4.9 | S1 | inline | pending | - | Physical printer test deferred. No printer model defined yet. |

Route declaration: all I4 tasks inline. No writer reason. Test-first: RED observed for render tests before implementation.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing (api) + 12 passing (print-render), 5 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin + print-render).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.
- Go agent builds successfully.

## Log

- L1: I4 started. Print render, queue, Go agent, held state, alerts, reprint.
- L2: Print render: ESC/POS bytes with initialization, code page, bold, double height, alignment, partial cut. Text preview strips commands.
- L3: Quantity formatting: 0.5 → "1/2", 0.25 → "1/4", 0.75 → "3/4", others with comma decimal.
- L4: Go agent: WebSocket with reconnect backoff, SQLite spool, dedup by job_id, TCP print with 5s timeout, DLE EOT status read, heartbeat every 30s.
- L5: Print queue: states QUEUED/HELD/DISPATCHED/PRINTED/FAILED/ABANDONED/SUPERSEDED. Max 3 retries. Held jobs released at start of day.
- L6: T4.9 (physical printer test) deferred. No printer model defined. Code page and accent stripping to be validated with real hardware.
- L7: All I4 code compiles clean. Tests pass. Ready for I5.