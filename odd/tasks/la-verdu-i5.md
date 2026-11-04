# La Verdu I5: Derivación, escalamiento y personal (ODD feature)

Objective: implement I5 from PRD.md section 20 (T5.1-T5.9): escalation to human with summary and history, conversation state machine (BOT/ESCALATED/CLOSED), draft expiration, timeouts, order counters (daily/monthly/yearly/historical), and complete admin panel. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I5 implements PRD.md section 20, tasks T5.1 to T5.9.
- S2: Escalation: notify staff with summary + history, retransmit responses (RF-15, RF-16).
- S3: Conversation states: BOT, ESCALATED, CLOSED with timeouts.
- S4: Order counters: daily, monthly, yearly, historical (user request).
- S5: Draft order expiration after inactivity.
- S6: Panel de estado completo (RF-22).

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I5.T5.1 | S1 | inline | done | 26cce2e | Derivation already in I3 (validateOrder + derived flag). |
| I5.T5.2 | S1, S2 | inline | done | 26cce2e | escalateConversation notifies staff with summary + history. handleStaffResponse retransmits. |
| I5.T5.3 | S1, S2, S3 | inline | done | 26cce2e | Conversation states BOT/ESCALATED/CLOSED. resolveEscalation, closeConversation. |
| I5.T5.4 | S1 | inline | done | 26cce2e | Staff orders already in I3 (source=STAFF). |
| I5.T5.5 | S1 | inline | done | 26cce2e | notifyStaffAboutIssue in customer handler. createPrinterAlert in printing. |
| I5.T5.6 | S1, S3, S5 | inline | done | 26cce2e | expireDraftOrders. closeConversation for timeouts. |
| I5.T5.7 | S1, S6 | inline | done | 26cce2e | Order stats endpoints: /admin/orders/stats, /admin/orders/summary. |
| I5.T5.8 | S1 | inline | done | 26cce2e | Payment status and prep status endpoints on orders. |
| I5.T5.9 | S1 | inline | done | 26cce2e | Delivery toggle already in branches CRUD (I1). |
| I5.COUNTERS | S4 | inline | done | 26cce2e | getOrderStats (by day/month/year, by branch, by status, by fulfillment). getOrderSummary (today/month/year/allTime). |

Route declaration: all I5 tasks inline. No writer reason. Test-first: unit tests for escalation and stats to be added.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.

## Log

- L1: I5 started. Escalation, conversation states, order counters, draft expiration, panel.
- L2: Escalation: notify staff with summary + recent history. Retransmit staff responses to customer.
- L3: Conversation states: BOT, ESCALATED, CLOSED. resolveEscalation sets back to BOT.
- L4: Draft expiration: expireDraftOrders cancels drafts older than N minutes.
- L5: Order counters: by day/month/year, by branch, by status, by fulfillment. Quick summary (today/month/year/allTime).
- L6: All I5 code compiles clean. Tests pass. Ready for I6 (piloto).