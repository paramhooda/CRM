# Progression CRM: design system

A light, flat, quiet enterprise UI, matched to the owner's reference application: a white tree sidebar with a
navigator filter, a 76px top bar with search, a hero card at the top of every page, uppercase section captions,
white cards with 1px borders and a faint shadow on a very light grey page, trend tiles with tinted icon squares,
dotted status pills and underline tabs. No gradients, no decorative colour, no heavy shadows; hierarchy comes from
whitespace, 1px borders and type weight. Every value below is a CSS custom property in
`src/app/globals.css` and components reference tokens only (`tests/unit/design-tokens.test.ts` fails on a raw hex,
`rgb()`/`hsl()` or a Tailwind palette class anywhere else, and checks the contrast of every tinted pair). The one
exception is `src/app/global-error.tsx`, which renders without the stylesheet and mirrors the tokens inline.

## Typography

| Use | Token / class | Value |
|---|---|---|
| All UI text and numbers | `--font-sans`, `font-sans`, `.tabular` | Geist, then -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial; `.tabular` adds tabular figures |
| Codes and IDs | `--font-mono`, `font-mono` | Geist Mono, then the system mono stack |
| Base size | `body` | 14px (`text-sm`); muted small labels 12px; nav and tabs 15px |
| Headings | hero `text-3xl font-semibold tracking-tight`; card titles 17px/600; tile values 32px/700 | never bold below 24px |

`RecordCode` (`src/components/crm/code.tsx`) renders a code or id in the mono face; every other number stays in the
UI face with tabular figures.

## Neutrals (zinc)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#f7f8fa` | `#09090b` | page, table header rows, card footers |
| `--sidebar` | `#ffffff` | `#0f0f11` | the sidebar (active item = white card with border and shadow) |
| `--card`, `--popover` | `#ffffff` | `#18181b` | cards, panels, inputs, menus |
| `--muted`, `--secondary`, `--accent` | `#f4f4f5` | `#27272a` | secondary surfaces, hover |
| `--surface-3` | `#e4e4e7` | `#3f3f46` | tertiary surface |
| `--border`, `--input` | `#e5e7eb` | `#27272a` / `#3f3f46` | 1px borders |
| `--border-strong` | `#d1d5db` | `#3f3f46` | hover borders, dashed empty states |
| `--tint-{blue,red,amber,green}` / `-fg` | `#eef4ff/#2563eb`, `#fef2f2/#dc2626`, `#fff7e6/#b45309`, `#ecfdf3/#15803d` | darker tints, light text | icon squares on tiles and rows, delta pills, status numbers |
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
| `--radius-2xl` | 18px | hero, tiles, chart cards, metric rows |
| `--radius-xl` | 14px | dialogs, inputs in the top bar and sidebar |
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
- Shell: a 300px white sidebar with the wordmark and one line per module (Home, Deals, Accounts, Contacts, Leads,
  Approvals with a red count, Pipeline review, Targets; an uppercase "Admin" caption above the admin modules; My
  work, Deals and Accounts for presales and purchase), the active item as a white bordered card, and a "Minimise"
  button at the foot. Minimised, it is a 64px icon rail with the brand mark, tooltips on hover, a red dot on
  Approvals, and an "Expand" icon; the edge of the sidebar also toggles it and the choice is kept in a cookie.
  Creating things happens on each module's page (New deal on Deals, and so on), never from the navigation. Beside it
  a 76px top bar (search with ⌘K, New deal, the approvals badge, avatar with name); content on white cards on the
  grey page.
- Page header: `PageHero` (date or breadcrumb eyebrow, 30px title, grey description, actions; optional controls row
  with `Segmented` and selects under a divider). `SectionLabel` captions sections, with a right-hand note.
- Tiles: `StatTile` (label, tinted icon square, 32px value coloured only for status, `Sparkline`, `DeltaPill`, note).
  Rows: `MetricRow` (icon, title, subtitle, arrow link, five metric columns) and `MetricStrip`.
- Charts: `FlowCard` (thin daily bars with light gridlines and legend dots, segmented views), `DonutCard` (centre
  value and legend table), `Heatmap` (weekday × hour in one blue scale), `BarChartCard` (horizontal lists).
- Tabs: `LineTabs` (navigating) and `TabBar`/`Tab` (in-page) draw a 2px rule under the active tab.
- "What's next" (`deals/[id]/next-panel.tsx`): a white card under the stage path with an uppercase caption, an 18px
  headline that addresses the reader ("Your next step: …" / "Waiting on purchase (Meera Iyer): …"), the due date
  in muted or `--destructive` when overdue, the step list in a three-column grid (done steps struck through in
  `--muted-foreground` with a `--success` tick, the current step on `--selected`, later steps grey with the owner
  in small text) and one primary button for the current step on the right, with its reason in small muted text
  when it is disabled. Every dialog that completes a step asks for whatever is missing inside it (a document, the
  scope), rather than sending the person elsewhere.
- Price grid (`components/crm/price-grid.tsx`): the lines as a table with one editable money column (36px inputs,
  right-aligned, tabular figures), line totals and the margin recomputed as you type, one primary Save. Opened as a
  dialog from the panel or the Lines tab; inline on the Lines tab for purchase.
- Needs you: a task icon in the top bar with a red count and a 384px menu (name, step, due date; "See everything
  that needs you"), and on Home, under the numbers, a bordered list card, one row per deal (name, code · account,
  the step in body text, stage pill, due date in muted or `--destructive`, a primary Open), overdue rows on a 5% red
  tint.
- Send proposal: a two-part dialog, the quotation block on `--background` (number, validity, subtotal, Download,
  Generate or New revision) above the email fields and an attachment checklist; a tinted amber note when the
  server cannot send. Admin Settings: four cards with tinted icon squares, one Save each.
- Charts: `--primary` for a single series; `--chart-1 … --chart-8` (`#2a78d6 #eb6834 #1baf7a #eda100 #e87ba4
  #008300 #4a3aa7 #e34948`) for categorical series in that order; `--chart-mag-1 … -5` (brand-300 → brand-800)
  light-to-dark for ordered magnitudes such as stage and forecast; status colours only for status.

## Spacing and copy

A 4px grid; 20px padding inside cards (16px for small cards), 16px between tiles, 24–32px between sections. Plain,
direct microcopy in sentence case.
