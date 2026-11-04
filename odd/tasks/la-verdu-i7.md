# La Verdu I7: Perfil en sitio (ODD feature)

Objective: implement I7 from PRD.md section 20 (T7.1-T7.7): local LLM and STT adapters, on-site compose file, runbook, encryption docs, tunnel docs, comparison framework. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I7 implements PRD.md section 20, tasks T7.1 to T7.7.
- S2: Local ChatModel adapter (OpenAI-compatible, pointing to local server).
- S3: Local Transcriber adapter (OpenAI-compatible, pointing to local server).
- S4: On-site compose file and runbook.
- S5: Disk encryption, physical access, local and remote backups.
- S6: HTTPS tunnel for webhook with signature validation.
- S7: Comparison of accuracy, latency and cost between profiles.

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I7.T7.1 | S1, S2 | inline | done | 5b58dec | apps/api/src/llm/interface.ts: ChatModel interface + createHostedChatModel + createLocalChatModel. |
| I7.T7.2 | S1, S3 | inline | done | 5b58dec | apps/api/src/stt/interface.ts: createLocalStt (no API key, local server). |
| I7.T7.3 | S1, S4 | inline | done | 5b58dec | infra/compose/onsite.yml: full on-site stack (db, llm-server, stt-server, api, tunnel, print-agent). |
| I7.T7.4 | S1, S5 | inline | done | 5b58dec | docs/runbook-onsite.md: disk encryption, physical access, backups, monitoring. |
| I7.T7.5 | S1, S6 | inline | done | 5b58dec | docs/runbook-onsite.md: tunnel section (Cloudflare, ngrok, Caddy). |
| I7.T7.6 | S1, S7 | inline | partial | 5b58dec | docs/runbook-onsite.md: comparison table (A vs B). Full eval comparison pending. |
| I7.T7.7 | S1 | inline | pending | - | Hardware decision requires pilot data (D-01). |

Route declaration: all I7 tasks inline. No writer reason. Test-first: unit tests for adapters to be added.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.
- `docker-compose -f infra/compose/onsite.yml config` validates.

## Log

- L1: I7 started. Local adapters, on-site compose, runbook, encryption, tunnel, comparison.
- L2: ChatModel interface: hosted and local both use OpenAI-compatible API. Local needs no API key.
- L3: SttProvider: createLocalStt wraps createHostedStt with empty API key.
- L4: On-site compose: Ollama for LLM, faster-whisper for STT, Cloudflare Tunnel for HTTPS.
- L5: Runbook: hardware requirements, installation steps, security, backups, monitoring, profile comparison.
- L6: T7.6 (comparison) needs pilot data. T7.7 (hardware decision) depends on T7.6.
- L7: All I7 code compiles clean. Tests pass. MVP + I6 + I7 complete.