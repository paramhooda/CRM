# Progression CRM: design system

A light, flat, quiet enterprise UI in the style of Linear and Vercel. No gradients, no decorative colour, no heavy
shadows; hierarchy comes from whitespace, 1px borders and type weight. Every value below is a CSS custom property in
`src/app/globals.css` and components reference tokens only (`tests/unit/design-tokens.test.ts` fails on a raw hex,
`rgb()`/`hsl()` or a Tailwind palette class anywhere else, and checks the contrast of every tinted pair). The one
exception is `src/app/global-error.tsx`, which renders without the stylesheet and mirrors the tokens inline.

## Typography

| Use | Token / class | Value |
|---|---|---|
| All UI text | `--font-sans`, `font-sans` | Geist, then -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial |
| Codes, IDs, numbers that align | `--font-mono`, `font-mono`, `.tabular` | Geist Mono, then the system mono stack |
| Base size | `body` | 14px (`text-sm`); muted small labels 12px (`text-xs`) |
| Headings | `font-medium` / `font-semibold` | 500–600, never bold; `tracking-tight` on large headings |

`RecordCode` (`src/components/crm/code.tsx`) renders a code or id; `Money` and `Pct` inherit the mono face through
`.tabular`, as do KPI values and right-aligned table cells.

## Neutrals (zinc)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#fafafa` | `#09090b` | page, sidebar, table header rows, card footers |
| `--card`, `--popover` | `#ffffff` | `#18181b` | cards, panels, inputs, menus |
| `--muted`, `--secondary`, `--accent` | `#f4f4f5` | `#27272a` | secondary surfaces, hover |
| `--surface-3` | `#e4e4e7` | `#3f3f46` | tertiary surface |
| `--border`, `--input` | `#e4e4e7` | `#27272a` / `#3f3f46` | 1px borders |
| `--border-strong` | `#d4d4d8` | `#3f3f46` | hover borders, dashed empty states |
| `--foreground` | `#09090b` | `#fafafa` | primary text |
| `--foreground-secondary` | `#3f3f46` | `#d4d4d8` | secondary text, sidebar text |
| `--muted-foreground` | `#71717a` | `#a1a1aa` | muted labels |
| `--foreground-subtle` | `#a1a1aa` | `#71717a` | subtle text |
| `--ink-900`, `--ink-800` | `#18181b`, `#27272a` | inverted | emphasis and dark elements (tooltips) |

## Brand blue

`--brand-50 … --brand-900`: `#eff6ff #dbeafe #bfdbfe #93c5fd #60a5fa #3b82f6 #2563eb #1d4ed8 #1e40af #1e3a8a`.

| Token | Light | Use |
|---|---|---|
| `--primary` / `--primary-hover` | brand-600 / brand-700 | primary buttons (white text), done steps on the stage path |
| `--link` | brand-700 | links and link hovers |
| `--ring` | brand-500 | focus rings, input focus border |
| `--selected`, `--selected-strong`, `--selected-foreground` | brand-50, brand-100, brand-700 | selected rows, the active nav item, informational badges, the avatar |

Secondary and outline buttons are white with a `--border` border and primary text; ghost buttons have no border;
`--destructive` (`#dc2626`) is used solid only on confirmation buttons, otherwise as text or a 10% tint.

## Status colour (only for actual status)

Stage, forecast, request, approval and lead-status tags: a tinted background with darker text of the same hue
(`--stage-*` / `--stage-*-fg`, `--forecast-*` / `--forecast-*-fg`); every pair ≥ 4.5:1 in both modes. Business
units carry one colour each (`--bu-*` solid for charts, `--bu-*-soft` / `--bu-*-fg` for tags): blue, green, amber,
orange, which are the first categorical chart colours. `--success` and `--warning` are text and icon colours for
real state (target met, overdue).

## Shape and depth

| Token | Value | Use |
|---|---|---|
| `--radius-xl` | 12px | cards, dialogs |
| `--radius-lg` | 8px | buttons, inputs, chips, board cards |
| `--radius-md` | 6px | tags, menu items |
| `--radius-sm` | 4px | checkboxes, swatches |
| `--shadow-card` | `0 1px 2px rgb(9 9 11 / .04)` | cards, tables, tiles |
| `--shadow-raised` | `0 2px 8px rgb(9 9 11 / .06), 0 1px 2px rgb(9 9 11 / .04)` | raised elements, tooltips |
| `--shadow-popover` | `0 0 0 1px rgb(9 9 11 / .05), 0 20px 50px -16px rgb(9 9 11 / .28)` | menus, popovers, dialogs |

## Components

- Controls are 36px tall (`h-9`): buttons, inputs, selects, toggles; small 32px, extra small 28px, large 40px.
  Inputs are white with a `--input` border that turns `--ring` on focus.
- Tables: `--background` header row with 12px muted labels, 1px row dividers, no zebra striping, right-aligned
  numbers in mono.
- Tags: 24px tall, 6px radius, tinted background and matching darker text; the text always says what it is.
- Shell: a 48px top bar (brand mark, context search, theme toggle, avatar menu) over a nav-only sidebar on
  `--background` with a 1px border; content on white cards.
- Charts: `--primary` for a single series; `--chart-1 … --chart-8` (`#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4
  #008300 #4a3aa7 #e34948`) for categorical series in that order; `--chart-mag-1 … -5` (brand-300 → brand-800)
  light-to-dark for ordered magnitudes such as stage and forecast; status colours only for status.

## Spacing and copy

A 4px grid; 20px padding inside cards (16px for small cards), 16px between tiles, 24–32px between sections. Plain,
direct microcopy in sentence case.
