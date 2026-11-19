# La Verdu — Pending external / manual items

Items that cannot be completed by an agent in this repo: they need a real store, hardware, legal counsel, Meta approval, or a product decision. Tracked here so they are not lost. See `PRD.md` sections 22 (risks) and 27 (open decisions).

## Open decisions (PRD 27)

| ID | Decision | Blocks | State | Owner action |
|---|---|---|---|---|
| D-01 | Hardware de IA y presupuesto mensual para el perfil A | I7 | Abierta | Decide CPU/GPU/RAM and monthly budget for on-site LLM/STT (T7.7). |
| D-02 | Modelo de impresora térmica | T4.9 | Abierta | Pick a model and run the real-printer checklist (code page, no accents, cut, status). |
| D-03 | Confirmación de los ADR-001 a ADR-008 | I0 | Propuesta | Close at start of I0 (already implemented; confirm or amend). |
| D-04 | Proveedores de LLM y STT para el perfil B (modelos y precios) | I2 | Abierta | Choose hosted providers with the I2 evals. |
| D-05 | Región de hosting del perfil B | I0 | Abierta | Propuesta: región con latencia baja desde Argentina. |

## External / manual tasks

- **T4.9 — Prueba con impresora real (diferida).** Run when a printer model is chosen (D-02). Verify code page, no accents, cut and status. Until then the system runs against `printer-sim`.
- **T6.5 — Prueba de carga.** DONE (Track C): 20 concurrent flows per branch, 100% success, p95 < 150 ms. Re-run against staging before pilot.
- **T6.6 — Piloto con una sucursal.** Requires a real store, ~2 weeks. Measures OBJ-1..OBJ-5 and autonomy. Needs legal review (T6.8) first.
- **T6.7 — Suite de evals.** DONE (Track A): 20 cases, all thresholds met in stub mode. Re-run against the chosen hosted provider (D-04) before pilot.
- **T6.8 — Revisión legal del aviso de privacidad y del tratamiento.** External counsel, before pilot (riesgo R-07, Ley 25.326).
- **Meta (WhatsApp Business).** Business verification and phone number verification (riesgo R-03). Approval of the two templates: start-of-day (RF-04) and staff alerts (RF-33). Free-form messages only inside the 24 h window.
- **Agent notes / business config.** Per-instance configuration (name, owner, branches, staff, products, hours, payment methods) is done via admin or `make dev-seed` with env vars (see README "Personalización del negocio").

## Follow-ups discovered (not blocking)

- `awaitingPickupTime` context is set but never consumed: a customer replying with a time re-enters the order parser. Candidate for a future task.
- Staff echo (M-12) prints product IDs, not names (conversations/handler.ts). Migrate to `packages/messages-es-ar` `formatMessage` with resolved names.
- `formatOrderSummary` includes no reference prices (RF-10 says optional).
- Handler inline Spanish strings still to be migrated to `packages/messages-es-ar`.
- `packages/domain` rules to be adopted by `apps/api` (currently duplicated in handlers).