# La Verdu I1: Administración base (ODD feature)

Objective: implement I1 from PRD.md section 20 (T1.1-T1.6): admin login with sessions and roles, ABM of branches, staff, products and synonyms, payment methods per branch, and audit log. Authoritative spec: PRD.md. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: I1 implements PRD.md section 20, tasks T1.1 to T1.6.
- S2: Admin auth uses username/password with Argon2id (PRD 12.5). Sessions via HttpOnly cookie.
- S3: All code identifiers in English. Admin web in Spanish (es-AR).
- S4: The printed sheet rules from PRD 14.3 remain unchanged.

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| I1.T1.1 | S1, S2 | inline | done | 30f8188 | admin_user table + migration 0003 + rollback. Login/logout/me endpoints. Argon2id. In-memory session store with HttpOnly cookie. |
| I1.T1.2 | S1 | inline | done | a6f3756 | Branch CRUD (soft delete). Hours, delivery toggle, priority, printer address. |
| I1.T1.3 | S1 | inline | done | 49e3701 | Staff CRUD with phone, name, role, active, branch assignments. |
| I1.T1.4 | S1 | inline | done | 7d8f964 | Product CRUD + aliases. Duplicate name returns 409. CSV import in commit 53a4cf7. |
| I1.T1.5 | S1 | inline | done | a6f3756 | Payment methods per branch with enabled flag. |
| I1.T1.6 | S1 | inline | done | 4aeab4a | Audit log read endpoint with pagination. |

Route declaration: all I1 tasks inline. No writer reason. Test-first: RED observed for each behavior test before implementation.

Verification at the time of writing:

- `npm test` (unit and contract): 25 passing, 4 files.
- `make test-integration` (compose Postgres): 28 passing, 5 files.
- `npm run lint`: clean. `npm run typecheck`: clean (api + admin).
- `make dev-up`: 7 services running, `/health/ready` returns `database: ok`.

## Log

- L1: I1 started. Stack approved: TypeScript/Fastify/React, Argon2id for passwords, cookie sessions.
- L2: Admin auth: in-memory session store. Sufficient for single instance. For multi-instance, replace with Redis or DB.
- L3: Admin web: minimal React + Vite. CSV import screen. Runs on port 5173 in compose.
- L4: All I1 endpoints implemented and tested. Admin web typechecks clean.