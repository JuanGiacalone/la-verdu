# La Verdu I2: Disponibilidad y precios del personal (ODD feature)

Objective: implement I2 from PRD.md section 20 (T2.1-T2.9): WhatsApp webhook with signature verification and deduplication, staff identification, change set flow (propose → echo → confirm → apply), audio download and transcription, start of day flow, and availability transition. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I2 implements PRD.md section 20, tasks T2.1 to T2.9.
- S2: WhatsApp Cloud API webhook with HMAC-SHA256 signature verification (PRD 12.1).
- S3: Staff identified by phone number in the staff table (BR-18).
- S4: Changes require explicit confirmation (BR-07, RF-07).
- S5: Audio transcription via STT interface (PRD 12.2).

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I2.T2.1 | S1, S2 | inline | done | deb250c | WhatsApp webhook GET handshake + POST with signature verification and deduplication by wa_message_id. |
| I2.T2.2 | S1, S3 | inline | done | deb250c | Staff lookup by phone in handleStaffMessage. Active check. Branch assignment. |
| I2.T2.3 | S1, S4 | inline | done | deb250c | parseStaffMessage uses LLM to extract availability/price changes. proposeChanges creates change_set in PENDING_CONFIRMATION. |
| I2.T2.4 | S1, S4 | inline | done | deb250c | Echo message (M-12) sent. Confirmation words trigger applyChanges. Rejection words trigger rejectChanges. |
| I2.T2.5 | S1 | inline | done | deb250c | applyChanges updates branch_product_day and branch_product. Audit entry created. Affected orders reported. |
| I2.T2.6 | S1 | inline | done | deb250c | runStartOfDay sends template M-11 to branch staff. Transitions UNAVAILABLE → PENDING_CHECK. |
| I2.T2.7 | S1 | inline | done | deb250c | transitionAvailabilityForNewDay in availability/service.ts. |
| I2.T2.8 | S1, S5 | inline | done | deb250c | Audio download via channel.downloadMedia. Transcription via STT interface. |
| I2.T2.9 | S1 | inline | done | deb250c | findAffectedOrdersForNotify reports affected orders when product becomes unavailable. |

Route declaration: all I2 tasks inline. No writer reason. Test-first: unit tests for webhook and handler to be added in I3.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.

## Log

- L1: I2 started. WhatsApp webhook, staff identification, change set flow, audio, start of day.
- L2: Config extended with WhatsApp, LLM and STT settings (all with defaults for dev).
- L3: Webhook deduplication by wa_message_id. Conversation state tracked in contextJson.
- L4: Change set flow: propose → echo (M-12) → confirm/reject → apply/reject. Affected orders notified.
- L5: Start of day: template message + availability transition (UNAVAILABLE → PENDING_CHECK).
- L6: Audio: download from WhatsApp, transcribe via STT interface, reuse text flow.
- L7: LLM parsing: system prompt with product catalog, returns JSON array of changes. Fuzzy product name matching.
- L8: All I2 code compiles clean. Tests pass. Ready for I3.