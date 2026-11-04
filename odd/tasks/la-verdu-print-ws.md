# La Verdu: WebSocket /ws/print para agente de impresión (ODD task)

Objective: implement the missing backend WebSocket endpoint `/ws/print` consumed by the Go print agent (`apps/print-agent`), so print jobs can be dispatched and acknowledged in development and production.

## Specs

- S1: Endpoint `GET /ws/print?branch=<id>&token=<token>` (WebSocket upgrade) authenticates the print agent by branch and token.
- S2: Server pushes `job` messages with base64 ESC/POS payload for queued print jobs of that branch.
- S3: Agent sends `hello`, periodic `heartbeat` (printer status, queue depth), and `ack` (PRINTED/FAILED) messages.
- S4: Server updates `print_job` status (DISPATCHED/PRINTED/FAILED) and triggers reprint on failure per retry policy.
- S5: Heartbeat updates `agent_session` (lastSeenAt, printerStatus, agentVersion).

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| PW.T1 | S1-S5 | pending | pending |  | Implement /ws/print WebSocket handler in Fastify and register it |

## Log

- L1: Detected during local dev-up: print agent config points to /ws/print, but no such endpoint exists in apps/api. Task created as pending.
