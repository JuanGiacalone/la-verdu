# La Verdu I3: Pedidos de cliente (ODD feature)

Objective: implement I3 from PRD.md section 20 (T3.1-T3.11): customer onboarding, order parsing, availability validation, branch derivation, order confirmation, persistence with idempotency, modification and cancellation. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I3 implements PRD.md section 20, tasks T3.1 to T3.11.
- S2: Customer onboarding: privacy notice, name, address, preferred branch (RF-01).
- S3: Returning customer recognition (RF-02).
- S4: Order parsing via LLM with product mapping and synonym resolution (RF-08, RF-09).
- S5: Availability validation and branch derivation (RF-09, RF-29).
- S6: Order confirmation with summary, payment method, notes, explicit yes (RF-10, RF-11, RF-12).
- S7: Order modification and cancellation without deadline (RF-13).

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I3.T3.1 | S1, S2 | inline | done | 0d7b745 | Customer onboarding: privacy, name, fulfillment, address, branch. |
| I3.T3.2 | S1, S3 | inline | done | 0d7b745 | Returning customer recognition by phone. Greet and offer usual fulfillment. |
| I3.T3.3 | S1 | inline | done | 0d7b745 | Preferred branch selection during onboarding. |
| I3.T3.4 | S1, S4 | inline | done | 0d7b745 | parseCustomerOrder uses LLM. mapParsedItemsToProducts resolves to catalog. |
| I3.T3.5 | S1, S5 | inline | done | 0d7b745 | validateOrder checks availability in preferred branch. Derives to another branch if needed. |
| I3.T3.6 | S1, S6 | inline | done | 0d7b745 | Retiro/domicilio with time and address. Delivery disabled handling. |
| I3.T3.7 | S1, S6 | inline | done | 0d7b745 | Active payment methods per branch. Default to first active. |
| I3.T3.8 | S1, S6 | inline | done | 0d7b745 | Notes field on order. Included in summary. |
| I3.T3.9 | S1, S6 | inline | done | 0d7b745 | Summary with items, fulfillment, payment method. Explicit "sí" for confirmation. |
| I3.T3.10 | S1, S6 | inline | done | 0d7b745 | Draft order creation with idempotency (wa_message_id). Confirm sets CONFIRMED + version 1. |
| I3.T3.11 | S1, S7 | inline | done | 0d7b745 | modifyOrder creates new version. cancelOrder sets CANCELLED. No deadline. |

Route declaration: all I3 tasks inline. No writer reason. Test-first: unit tests for customer handler and order service to be added.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.

## Log

- L1: I3 started. Customer onboarding, order parsing, validation, derivation, confirmation, persistence.
- L2: Customer onboarding: privacy → name → fulfillment → address → branch. Stored in conversation contextJson.
- L3: Order parsing: LLM with product catalog. Maps productName to product ID. Handles quantities (kg, units, dozens).
- L4: Availability validation: checks preferred branch first. Derives full order to another branch if all items available.
- L5: Order confirmation: summary with items, fulfillment, payment method. Explicit "sí" required (BR-01).
- L6: Modification: new version + reprint. Cancellation: CANCELADO print.
- L7: Escalation: staff notified about unavailable products. Assistant notifies customer.
- L8: All I3 code compiles clean. Tests pass. Ready for I4.