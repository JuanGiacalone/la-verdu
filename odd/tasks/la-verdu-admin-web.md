# La Verdu Admin Web: modern full-featured admin panel (ODD feature)

Objective: implement PRD.md section 15 (12 admin screens) with a modern design (Tailwind CSS) on top of the existing React + Vite + TypeScript admin app, consuming the admin API and adding the missing backend endpoints. Authoritative spec: PRD.md section 15. Branch: JuanGiacalone/la-verdu.

## Specs

- S1: Admin web implements all 12 screens of PRD.md section 15.
- S2: Modern, responsive, accessible UI using Tailwind CSS.
- S3: All code identifiers in English. Admin UI in Spanish (es-AR).
- S4: Auth via cookie session (/admin/auth/login, /admin/auth/me, /admin/auth/logout). Role-based UI (OWNER vs OPERATOR).
- S5: Consume existing admin endpoints; add missing backend endpoints where needed (conversations, customers, availability/prices, config).
- S6: No regression: existing API tests remain green.

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| AW.T0 | S1-S6 | inline | pending |  | Tailwind setup + base layout + router + API client + auth context |
| AW.T1 | S1, S4 | inline | pending |  | Login page |
| AW.T2 | S1 | inline | pending |  | Inicio dashboard (ops status, orders summary, alerts, print queue) |
| AW.T3 | S1, S5 | inline | pending |  | Catálogo (products + aliases + CSV import) |
| AW.T4 | S1 | inline | pending |  | Sucursales (CRUD + payment methods) |
| AW.T5 | S1 | inline | pending |  | Personal (CRUD + branch assignments) |
| AW.T6 | S1 | inline | pending |  | Pedidos (list filters, detail, cancel, payment/prep, reprint) |
| AW.T7 | S1 | inline | pending |  | Impresión (queue, agent heartbeat, reprint abandoned) |
| AW.T8 | S1 | inline | pending |  | Alertas (list + acknowledge) |
| AW.T9 | S1 | inline | pending |  | Auditoría (read-only filters) |
| AW.T10 | S1, S5 | inline | pending |  | Conversaciones (list/detail, resolve, reply) + backend endpoints |
| AW.T11 | S1, S5 | inline | pending |  | Clientes (search, edit, ARCO) + backend endpoints |
| AW.T12 | S1, S5 | inline | pending |  | Disponibilidad y precios (grilla + corrección) + backend endpoints |
| AW.T13 | S1, S5 | inline | pending |  | Config técnica (agent versions, provider status) |

Route declaration: all tasks inline initially (no writer reason). Re-evaluate when parallel independent units emerge. Test-first: functional checks per screen.

## Log

- L1: User requested modern design + all admin functionalities. Scope: complete (PRD 15 all screens) + Tailwind.
