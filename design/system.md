# Design System — La Verdu Admin

Captured from `apps/admin/tailwind.config.js` and `apps/admin/src/index.css`. Palette: "Mercado fresco" — menta green primary, carrot orange accent, corn yellow highlight. Tailwind v3.4 defaults supply the rest of the scale (spacing, radius, shadows, slate palette).

## Colors

### Brand (primary) — menta green (from `tailwind.config.js` `theme.extend.colors.brand`)

| Token | Value | Usage |
|---|---|---|
| `brand-50` | `#ecfdf5` | Light brand tint (hover/selected rows) |
| `brand-100` | `#d1fae5` | Brand chip/badge background |
| `brand-500` | `#10b981` | Primary accent (links, focus, status ok) |
| `brand-600` | `#059669` | Primary button background |
| `brand-700` | `#047857` | Primary button hover / strong accent |
| `brand-900` | `#064e3b` | Deep brand (rare, dark emphasis) |

### Accent — zanahoria orange (from `tailwind.config.js` `theme.extend.colors.accent`)

| Token | Value | Usage |
|---|---|---|
| `accent-50` | `#fff7ed` | Light accent tint |
| `accent-100` | `#ffedd5` | Accent chip/badge background |
| `accent-500` | `#f97316` | Secondary accent (highlights, warnings soft) |
| `accent-600` | `#ea580c` | Accent button / strong emphasis |
| `accent-700` | `#c2410c` | Accent hover |

### Highlight — maíz yellow (from `tailwind.config.js` `theme.extend.colors.highlight`)

| Token | Value | Usage |
|---|---|---|
| `highlight-100` | `#fef9c3` | Soft highlight background |
| `highlight-400` | `#facc15` | Highlight / attention |
| `highlight-500` | `#eab308` | Strong highlight |

### Neutrals (Tailwind default `slate`, used throughout)

| Token | Value | Usage |
|---|---|---|
| `slate-50` | `#f8fafc` | Page background (`body` in `index.css`) |
| `slate-100` | `#f1f5f9` | Table header, subtle surfaces |
| `slate-300` | `#cbd5e1` | Scrollbar thumb, borders |
| `slate-400` | `#94a3b8` | Muted labels, footer text |
| `slate-500` | `#64748b` | Secondary text |
| `slate-700` | `#334155` | Sidebar border, muted headings |
| `slate-800` | `#1e293b` | Sidebar hover/active row |
| `slate-900` | `#0f172a` | Sidebar background, primary text |

### Status (Tailwind defaults used in pages)

| Token | Value | Usage |
|---|---|---|
| `red-600` | `#dc2626` | Error text (tomato red) |
| `amber-100/800` | `#fef3c7` / `#92400e` | Warning badges |
| `white` | `#ffffff` | Card surfaces |

## Typography

- Font family: Tailwind default system stack — `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`. No custom fonts declared.
- Scale used: `text-xs` (12px), `text-sm` (14px), `text-lg` (18px), `text-2xl` (24px), `text-lg font-semibold` for section headings.
- Weights: `font-medium`, `font-semibold`, `font-bold`.

## Spacing

Tailwind default 4px base scale (`p-2` = 8px, `p-3` = 12px, `p-4` = 16px, `p-6` = 24px, `gap-4` = 16px, `space-y-6` = 24px).

## Radius

Tailwind defaults: `rounded` (4px), `rounded-lg` (8px). Cards use `rounded-lg`.

## Shadows

`shadow-sm` on cards. No other shadows in source.

## Component rules

- **Sidebar (nav):** `w-60 bg-slate-900 text-slate-100`, fixed left, border-b `slate-700`. Nav items `px-4 py-2 text-sm`; active `bg-slate-800 text-white font-semibold`; hover `hover:bg-slate-800`.
- **Page container:** `max-w-[1200px] mx-auto p-6` inside `flex-1 overflow-y-auto` main.
- **Page title:** `text-2xl font-bold`. Section heading: `text-lg font-semibold mb-2`.
- **Card:** `bg-white border rounded-lg p-4 shadow-sm`. Label `text-sm text-slate-500`, value `text-2xl font-bold`.
- **Table:** `w-full text-sm bg-white border rounded`. Header `bg-slate-100`, cells `p-2`, rows separated by `border-t`.
- **Inputs:** `border rounded` (default), label `block text-sm font-medium mb-1`.
- **Buttons:** primary `bg-brand-600 hover:bg-brand-700 text-white`; accent `bg-accent-600 hover:bg-accent-700`; secondary/ghost text-slate-300 on dark; full-width left-aligned in sidebar.
- **Alerts list:** `bg-white border rounded p-3`, kind `font-medium`.
- **Empty state:** `text-slate-500` paragraph.
- **Loading:** plain "Cargando…" text.

## Motion & accessibility

- No animations defined in source. Respect `prefers-reduced-motion` if any added.
- Contrast: brand-600 (#059669) on white passes AA for large text; body text slate-900 on slate-50 passes.
- Semantic landmarks: `aside` nav, `main`, `header`/`section` where applicable.