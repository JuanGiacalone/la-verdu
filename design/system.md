# Design System — La Verdu Admin

Captured from three sources: the Tailwind v3 config of the admin app, the app's global stylesheet, and the Astryx `neutral` theme the app now loads. Astryx is the design system of record: the app's own Tailwind palette is the legacy brand layer that has to be reconciled with it.

## Sources

| Source                                                    | What it contributes                                                                                                                                                                                      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_modules/@astryxdesign/theme-neutral/dist/theme.css` | Astryx semantic tokens (color, spacing, radius, shadow, typography), each with a `light-dark()` light/dark pair                                                                                          |
| `node_modules/@astryxdesign/core/src/theme/Theme.tsx`     | `Theme` wrapper contract: `display: contents`, `color: var(--color-text-primary)`, `font-family: var(--font-family-body)`; root `Theme` syncs `data-theme` on `<html>` from `mode` (`system` by default) |
| `apps/admin/tailwind.config.js`                           | Legacy "Mercado fresco" brand palette (`brand`, `accent`, `highlight`)                                                                                                                                   |
| `apps/admin/src/index.css`                                | Body baseline `bg-slate-50 text-slate-900`, scrollbar, Tailwind layer wiring                                                                                                                             |

## Colors

### Astryx semantic tokens (light | dark) — system of record

| Token                        | Light       | Dark        | Usage                               |
| ---------------------------- | ----------- | ----------- | ----------------------------------- |
| `--color-background-body`    | `#f1f1f1`   | `#1b1b1b`   | Page background                     |
| `--color-background-card`    | `#ffffff`   | `#1b1b1b`   | Card / panel surface                |
| `--color-background-surface` | `#ffffff`   | `#262626`   | Raised surface                      |
| `--color-background-muted`   | `#f1f1f1`   | `#1b1b1b`   | Muted fill, table header            |
| `--color-background-popover` | `#ffffff`   | `#1b1b1b`   | Popover, menu                       |
| `--color-text-primary`       | `#000000`   | `#ffffff`   | Primary text, inherited default     |
| `--color-text-secondary`     | `#474747`   | `#9e9e9e`   | Secondary text, labels              |
| `--color-text-disabled`      | `#919191`   | `#525252`   | Disabled text                       |
| `--color-text-accent`        | `#1b1b1b`   | `#f1f1f1`   | Text on accent surface              |
| `--color-text-error`         | `#c0262c`   | `#ffaea7`   | Error text                          |
| `--color-text-success`       | `#2f7d33`   | `#90ca90`   | Success text                        |
| `--color-text-warning`       | `#836700`   | `#eec448`   | Warning text                        |
| `--color-text-info`          | `#0067ce`   | `#a1caff`   | Info text                           |
| `--color-border`             | `#00000014` | `#ffffff1A` | Hairline border                     |
| `--color-border-emphasized`  | `#d4d4d4`   | `#525252`   | Table header, emphasized border     |
| `--color-icon-primary`       | `#000000`   | `#ffffff`   | Primary icon                        |
| `--color-icon-secondary`     | `#6a6a6a`   | `#9e9e9e`   | Secondary icon                      |
| `--color-accent`             | `#1b1b1b`   | `#f1f1f1`   | Accent surface (buttons, selection) |
| `--color-on-accent`          | `#ffffff`   | `#111111`   | Text/icon on accent surface         |

The installed `neutral` theme is **achromatic**: its accent is near-black, not a brand hue. The app's brand green has no equivalent token in it.

### Legacy brand palette (from `tailwind.config.js`)

| Token                       | Value                             | Usage                                    |
| --------------------------- | --------------------------------- | ---------------------------------------- |
| `brand-50`                  | `#ecfdf5`                         | Light brand tint (hover/selected rows)   |
| `brand-100`                 | `#d1fae5`                         | Brand chip/badge background              |
| `brand-500`                 | `#10b981`                         | Primary accent (links, focus, status ok) |
| `brand-600`                 | `#059669`                         | Primary button background                |
| `brand-700`                 | `#047857`                         | Primary button hover / strong accent     |
| `brand-900`                 | `#064e3b`                         | Deep brand (sidebar background)          |
| `accent-50 / 100`           | `#fff7ed` / `#ffedd5`             | Carrot orange tints                      |
| `accent-500 / 600 / 700`    | `#f97316` / `#ea580c` / `#c2410c` | Carrot orange emphasis                   |
| `highlight-100 / 400 / 500` | `#fef9c3` / `#facc15` / `#eab308` | Corn yellow highlight                    |

### Neutrals (Tailwind `slate`, remapped to the "Mercado fresco" surfaces)

| Token       | Value     | Usage                                                |
| ----------- | --------- | ---------------------------------------------------- |
| `slate-50`  | `#f4f7f4` | Page background (body)                               |
| `slate-100` | `#eef1ec` | Table header, subtle surfaces                        |
| `slate-200` | `#e6ebe5` | Row separators                                       |
| `slate-300` | `#e2e8f0` | Borders                                              |
| `slate-400` | `#94a3b8` | Decoration only (fails AA as text on light surfaces) |
| `slate-500` | `#64748b` | Secondary text (4.76:1 on white)                     |
| `slate-600` | `#475569` | Labels, inactive text                                |
| `slate-700` | `#334155` | Muted headings                                       |
| `slate-800` | `#1e293b` | Reserved                                             |
| `slate-900` | `#0f172a` | Primary text                                         |

The remap lives in `apps/admin/tailwind.config.js` (`theme.extend.colors.slate`), so every screen that already used `bg-slate-50`, `border-slate-300` or `text-slate-500` follows the new surfaces without touching its markup.

## Typography

- `--font-family-body` / `--font-family-heading`: `Figtree, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif` (loaded from `@astryxdesign/theme-neutral/fonts.css`; the app also links the same family from `index.html`).
- `--font-family-code`: `ui-monospace, "SF Mono", Monaco, Consolas, "Liberation Mono", "Courier New", monospace`.
- Sizes `--font-size-3xs … --font-size-5xl`; text roles `--text-body-*`, `--text-heading-1..4-*`, `--text-display-1..3-*`, `--text-code-*` carry size, leading and weight.
- Legacy app scale in use: `text-xs` (12px), `text-sm` (14px), `text-lg` (18px), `text-2xl` (24px). Weights `font-medium`, `font-semibold`, `font-bold`.

## Spacing

- Tailwind 4px base scale (`p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-6` = 24px, `gap-4` = 16px).
- Astryx `--spacing-0-5 … --spacing-12` in `rem`, plus `--layout-padding-inner-x`, `--layout-padding-outer-x`, `--layout-content-width` and `--container-padding-*`.

## Radius

| Token                | Value             |
| -------------------- | ----------------- |
| `--radius-none`      | `0px`             |
| `--radius-inner`     | `0.375rem` (6px)  |
| `--radius-element`   | `0.625rem` (10px) |
| `--radius-container` | `0.75rem` (12px)  |
| `--radius-page`      | `1.75rem` (28px)  |
| `--radius-full`      | `9999px`          |

Legacy app radius: `rounded` (4px), `rounded-lg` (8px), `rounded-2xl` (16px, login card).

## Shadows

- `--shadow-low`, `--shadow-med`, `--shadow-high`: layered elevation with an `inset 0 0 0 1px` hairline that adapts to the mode.
- `--shadow-inset-error / -success / -warning / -selected / -hover`: 2px inset status rings.

## Motion

`--duration-fast` 125ms, `--duration-medium` 300ms, `--duration-slow` 700ms (with min/max variants), `--ease-entrance`, `--ease-exit`, `--ease-move`.

## Component rules

- **Theme wrapper (`Theme`):** `display: contents` + `color: var(--color-text-primary)` + `font-family: var(--font-family-body)`. Root `Theme` writes `data-theme` on `<html>` from `mode` (`system` | `light` | `dark`), which drives `color-scheme` and therefore every `light-dark()` token. **Anything that must keep its own text color has to set it explicitly** — the wrapper's inherited color flips with the OS.
- **Sidebar (nav):** `w-60 bg-brand-900 text-white`, fixed left, with a `h-1` gradient strip (`brand-500 → accent-600 → highlight-500`) on top. Items `px-4 py-2.5 text-sm`; inactive `text-brand-100`; active `bg-white/10 text-white font-semibold border-brand-500`; hover `hover:bg-white/5 hover:text-white`. Footer separated by `border-white/20`, sign-out button `bg-white/10 text-brand-50 hover:bg-white/20`.
- **Page band:** full-bleed strip above the page container, `bg-gradient-to-r from-brand-50 via-brand-50 to-accent-50 border-b border-slate-300 px-8 py-5`. It carries the crumb (`text-xs font-bold uppercase tracking-widest text-brand-700`), the page title (`text-2xl font-extrabold tracking-tight`) and the date (`text-sm text-slate-600`) — so a page never renders its own title twice.
- **Page container:** `max-w-[1200px] mx-auto p-6` inside `flex-1 overflow-y-auto` main.
- **Section heading:** `text-lg font-bold mb-3`.
- **Card:** `bg-white border border-slate-300 rounded-xl p-4 shadow-sm`. Label `text-sm text-slate-600`, value `text-2xl font-extrabold`, delta `text-xs font-semibold` (`text-brand-700` for positive, `text-slate-500` for neutral).
- **Table:** wrapper `bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm`. Header `bg-brand-50` with `th font-bold text-brand-900`, cells `p-3`, rows `border-t border-slate-200 hover:bg-brand-50/50`.
- **Badge:** `px-2 py-0.5 rounded-full text-xs font-bold`. `ok` `bg-brand-100 text-brand-700`; `borrador` `bg-accent-50 text-accent-700`; `desactualizado` `bg-amber-100 text-amber-800`; neutral `bg-slate-200 text-slate-700`.
- **Alert:** `bg-white border border-slate-300 border-l-4 border-l-red-600 rounded-lg p-3 shadow-sm`, kind `font-bold text-sm`, message `text-slate-600 text-xs`.
- **Buttons:** primary `bg-brand-700 hover:bg-brand-900 text-white rounded-lg px-4 py-2 font-bold text-sm shadow-sm`; secondary `bg-white text-accent-700 border border-accent-100 rounded-lg px-4 py-2 font-bold text-sm`.
- **Inputs:** `border border-slate-300 rounded-lg`, label `block text-sm font-medium mb-1 text-slate-700`.
- **Empty state:** `text-slate-500` paragraph. **Loading:** plain "Cargando…" text.

## Contrast and accessibility

- Target: normal text ≥ 4.5:1, large text and control boundaries ≥ 3:1 (WCAG AA).
- `slate-500` (#64748b) on white = 4.76:1 → OK for body text. `slate-400` (#94a3b8) on white = 2.56:1 → only for non-essential decoration on dark surfaces.
- `brand-600` (#059669) with white text = 3.13:1 → passes for large text and UI components, not for small body text on the button label; use `brand-700` (#047857, 4.77:1) when the label is small.
- Never rely on the inherited color for text inside a light surface: the theme wrapper resolves it through `light-dark()`, so it becomes white in dark mode.
- Status is never color-only: badges pair the color with a readable label.
