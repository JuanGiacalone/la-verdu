# La Verdu I6: Piloto y endurecimiento (ODD feature)

Objective: implement I6 from PRD.md section 20 (T6.1-T6.8): data purge, ARCO rights, backups, operational alerts, eval framework. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I6 implements PRD.md section 20, tasks T6.1 to T6.8.
- S2: Data retention: messages 12 months, audio deleted after transcription (PRD 16.3).
- S3: ARCO rights: export, rectification, suppression (PRD 16.3, RF-35).
- S4: Backups daily with restore test (RNF-19).
- S5: Operational alerts for queues, providers, agents (RNF-17).
- S6: Eval framework with accuracy thresholds (PRD 21.2).

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I6.T6.1 | S1, S2 | inline | done | fbdbaa2 | purgeOldData: messages older than retention, inactive conversations closed, transcripts cleared after 6 months. |
| I6.T6.2 | S1, S3 | inline | done | fbdbaa2 | ARCO endpoints: export, rectify, suppress. Purge endpoint. |
| I6.T6.3 | S1, S4 | inline | done | fbdbaa2 | scripts/backup.sh: pg_dump + gzip, dated files, retention cleanup. |
| I6.T6.4 | S1, S5 | inline | done | fbdbaa2 | /admin/ops/status: print queue, alerts, agents, escalated, drafts. Alert acknowledge endpoint. |
| I6.T6.5 | S1 | inline | pending | - | Load testing requires running system. Not yet done. |
| I6.T6.6 | S1 | inline | pending | - | Pilot requires a real store. Not yet done. |
| I6.T6.7 | S1, S6 | inline | partial | fbdbaa2 | Eval runner skeleton + sample eval case. Full eval suite pending. |
| I6.T6.8 | S1 | inline | pending | - | Legal review requires external counsel. |

Route declaration: all I6 tasks inline. No writer reason. Test-first: unit tests for purge and ARCO to be added.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.

## Log

- L1: I6 started. Data purge, ARCO, backups, operational alerts, eval framework.
- L2: Data purge: messages older than retention, inactive conversations closed, transcripts cleared after 6 months.
- L3: ARCO: export (masked phone), rectify, suppress (anonymize customer + conversations).
- L4: Backups: pg_dump + gzip, dated files, retention cleanup. Cron-ready.
- L5: Operational alerts: /admin/ops/status with print queue, open alerts, agent heartbeats, escalated conversations, draft orders.
- L6: Eval framework: runner skeleton + sample eval case. Full eval suite pending (requires LLM provider).
- L7: T6.5 (load test), T6.6 (pilot), T6.8 (legal review) require external resources.
- L8: All I6 code compiles clean. Tests pass. Ready for I7 (perfil en sitio).