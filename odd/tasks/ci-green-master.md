# CI green master (ODD feature)

Objective: make the `verify` CI workflow pass on the `master` branch so PR #1 (`dev` -> `master`) merges without red checks. The branch `fix/ci-green` is cut from `dev` and carries every fix needed for the whole tree to satisfy `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration -w @la-verdu/api` and `npm audit --omit=dev --audit-level=high`.

## Specs

- S1: `npm run lint` (`biome check .`) must exit 0 on the branch. Biome fails the run on **errors**; warnings and the deprecated-config info do not fail the check (verified against biome 2.6.4: warnings-only run exits 0).
- S2: `npm run typecheck` must exit 0 across all workspaces.
- S3: `npm test` must exit 0 in CI mode (`CI=true`), which is how the workflow runs it.
- S4: `npm run test:integration -w @la-verdu/api` must exit 0 against a PostgreSQL 16 database.
- S5: `npm audit --omit=dev --audit-level=high` must exit 0.
- S6: Fixes must be limited to making the checks pass. No unrelated refactors, no behavior changes to product logic beyond what a failing check requires.
- S7: Failure classification must be evidence-based: a diagnostic present on the base branch (`origin/master`) is **not** caused by this branch and must be fixed only because the user asked for a fully green `master`, not attributed to PR #1.

## Tasks

| ID | Specs | Route | Status | Commit | Evidence |
|---|---|---|---|---|---|
| G.T1 | S1, S3 | inline | done | - | Fixed the two CSS parse errors in `design/admin-colors/` (invalid `overflow-y-auto` declaration → `overflow-y:auto`) |
| G.T2 | S1 | inline | done | - | Fixed all remaining biome errors: `useValidAnchor` (34), `useButtonType` (18), `noLabelWithoutControl` (2), `noNonNullAssertion` (12), `noExplicitAny` (5), format errors (23) |
| G.T3 | S1 | inline | done | - | Migrated `biome.json` off the deprecated `recommended` field to `preset` |
| G.T4 | S3 | inline | done | - | Committed the missing `packages/print-render` snapshot so `CI=true npm test` passes |
| G.T5 | S4 | inline | done | - | Fixed the two failing integration tests (schema table list missing `business`, cancellation message assertion) |
| G.T6 | S2, S4, S5 | inline | done | - | Verified the full workflow locally |

## Log

- L1: "Lets create a fix branch to have a issue free master branch"
- L2 (baseline): on `origin/master` (`862a076`) `biome check .` reports **82 errors**; on `dev` (`cd10886`) it reports **140 errors**. The 58-diagnostic delta is what PR #1 introduced; the 82 base errors are pre-existing and never gated `master` because the workflow only ran on `pull_request` and `push` to `main` (the repo's default branch is `master`, so no `main` push ever ran it).
- L3 (biome exit semantics, verified on biome 2.6.4): a run with **only** warnings exits **0**; only `error` severity fails the check. The `recommended` deprecation is `info` severity and does not fail. So S1 requires zero **errors**, not zero diagnostics.
- L4 (pre-existing failures reproduced on `origin/master` in a clean worktree): `CI=true npm test` fails 1 snapshot in `packages/print-render` (the `.snap` file was never committed); `npm run test:integration` fails 2 tests — `schema.test.ts` expects 20 tables but the DB has 21 (`business`, added by `00d752f`, which is already in `origin/master`), and `cancellation.test.ts` expects a reply matching `/cancel/i` but the handler answers "OK, no se confirmó el pedido…" because `REJECT_WORDS` (`{"no","n","cancelar","cancela","anular"}`) intercepts `cancelar` before the cancel-order branch is reached.
- L5 (branch-caused failures, the PR #1 delta): two CSS **parse errors** in `design/admin-colors/01-astryx-neutral.html` and `02-mercado-fresco.html`, caused by `overflow-y-auto` (a Tailwind class name) written as a CSS declaration where `overflow-y:auto` was meant — the parser then mis-nests every following rule. Plus 34 `useValidAnchor` and 7 `useButtonType` errors in the three new `design/admin-colors/*.html` artboards, and 14 format errors in newly added docs/config files.
- L6 (decision on `href="#"`): biome's `useValidAnchor` rejects `href="#"`. The artboards are static design mockups with placeholder navigation, so the anchors are rewritten to `href="#main"` and each artboard's `<main>` element gets `id="main"`, which keeps them valid, meaningful and keyboard-reachable rather than silencing the rule.
- L7 (decision on `noLabelWithoutControl`): `design/admin-login/01-login.html` labels are tied to their inputs with `for`/`id` pairs, which is the actual a11y fix the rule asks for.
- L8 (decision on `!important`): the `prefers-reduced-motion` overrides intentionally use `!important` to beat other transition declarations. Removing it would change the reduced-motion behaviour, so each one gets a `biome-ignore` with the reason instead of being stripped.
- L9 (decision on the `business` table): the schema test's expected list predates migration `0006_business.sql`, which is already in `origin/master`. The table is real and migrated, so the **test expectation** is stale and gets the missing `business` entry — not a migration rollback.
- L10 (decision on the cancellation test): the PRD defines M-10 "Cancelé tu pedido #{order_number}." for cancelling an order, and the handler already sends "Cancelé tu pedido. ¿Necesitás algo más?" on the cancel branch. The test sends `cancelar` while a **pending confirmation** is open, and `REJECT_WORDS` deliberately treats `cancelar` as "no, reject the draft", which is the documented M-07 flow. The test's own name is "customer can cancel a pending order", so the intent is the cancel path; the fix keeps the product rule intact and makes the test drive the cancel branch explicitly.
- L11 (correction to L10, after verifying the flow): the test's message assertion is the wrong half of the contract, not the handler. Reading the flow again: with a pending confirmation open, `REJECT_WORDS` matches `cancelar` first and cancels the **draft** (the order was DRAFT, never CONFIRMED), replying "OK, no se confirmó el pedido…". The `/cancel/i` assertion expected the *other* branch, which only runs for a CONFIRMED order (`findLatestOrder` filters `status = CONFIRMED`) and is unreachable from this scenario. The order IS cancelled (`expect(ordersAfter[0]?.status).toBe("CANCELLED")` passes on master too); only the wording assertion fails. The fix widens the assertion to accept the documented draft-rejection wording (`/no se confirmó|cancel/i`) instead of changing product behaviour — no product rule, message or PRD mapping was altered.
- L12 (verification, G.T6): the full workflow reproduced locally against the same steps the CI runs — `npm run lint` exit 0 (0 errors, 2 non-blocking warnings); `npm run typecheck` exit 0; `CI=true npm test` exit 0 (26 api + 16 print-render tests); `npm run test:integration -w @la-verdu/api` exit 0 (33 tests, 9 files) against a **freshly created** `laverdu_fresh_test` database, matching the workflow's service container; `npm audit --omit=dev --audit-level=high` exit 0.
- L13 (biome exit semantics, confirmed in the repo itself): `biome check .` reports "Found 2 warnings" and exits **0**. Both remaining warnings are `noDescendingSpecificity` in `design/admin-colors/02` and `03`, where the mockup intentionally styles a light/dark pair of the same components; they do not fail the check and were left alone rather than silenced.
- L14 (no logic changes): every source file touched under `apps/api/src/`, `apps/admin/` and `evals/` was diffed with `-w`; the changes are formatting, import ordering and the single `match[1]!` → `match?.[1]` fix in `evals/run-evals.ts`. No product logic, message or PRD mapping was modified. The `!important` on the `prefers-reduced-motion` overrides was preserved verbatim; only a `biome-ignore` comment with its reason was added above it, so the reduced-motion behaviour is unchanged.
