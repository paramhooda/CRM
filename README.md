# Progression CRM

A focused CRM for a Systems Integrator / Managed Services Provider. It covers accounts, contacts, leads, opportunities with multi-OEM line items, a product catalogue, a Sales → Presales → Purchase BOQ and pricing workflow, quotes, pipeline reviews and analytics, in a clean, minimal interface.

## Run it

You need Docker Desktop (or Docker Engine with Compose v2). From the project folder:

```bash
docker compose up -d
```

Open **http://localhost:3000**. The first start builds the image, creates the database, applies migrations and loads demo data. That takes a few minutes. Later starts take seconds.

| Role | Demo login | What to try |
|---|---|---|
| Sales Head | `vivek.malhotra@progression.com` | Dashboard, pipeline review, reports, reassigning deals |
| Sales | `rakesh.pawar@progression.com` | Create a deal, pull in presales, price and quote |
| Presales | `rakesh.yadav@progression.com` | My work home, build and submit a BOQ |
| Purchase | `meera.iyer@progression.com` | My work home, RFQs by OEM, enter costs |
| Admin | `admin@progression.com` | Product catalogue, users, picklists, targets, audit log |

All demo users share the password **`Progression@123`**. The login page also has one-click demo sign-in buttons. Every sales and presales person from the field sheet exists as a user, with emails in the form `firstname.lastname@progression.com`.

Useful commands:

```bash
docker compose logs -f app          # follow application logs
docker compose down                 # stop (data is kept)
docker compose down -v              # stop and delete all data
APP_PORT=8080 docker compose up -d  # run on another port
```

## What is inside

**Pipeline management**
- Opportunities with the fields from the field sheet (BU, category, OEM, account type, revenue model, stage, forecast category, presales owner, sales person) plus SI/MSP essentials: TCV and ARR, contract term and dates, expected margin, deal type, procurement mode (direct, RFQ, RFP, tender/GeM), bid submission date, OEM deal registration, competition, lead source, next step, PO capture and loss reasons.
- Human-readable record codes per Indian fiscal year: `OPP-FY27-0042`, `QT-FY27-0007`, `ACC-0012`, `LEAD-0005`.
- Salesforce-style stage path, Kanban pipeline board with drag-and-drop, and a sortable table with column chooser, saved views and CSV export.
- Stage gates. Closed-Won needs a PO number and date. Lost or Dropped needs a reason. ARR needs a contract term. RFPs need a submission date. Pushing a close date out counts as a slip.

**Line items and product catalogue**
- OEM lives on line items, not on the deal. One opportunity holds many line items, and each line carries its own BU, category and OEM. A single deal can mix, for example, Dell servers, VMware licences and Progression implementation services.
- Lines are picked from the **product catalogue** (Catalogue → Products): SKU, name, BU, category, OEM, product type, unit, billing frequency and default term, list price, standard cost, HSN/SAC and GST %. Everyone can browse it. Only Admin can add, edit or deactivate products.
- A custom line is still allowed for one-off items, but it must have a BU, category and OEM.
- Each line bills One-time, Monthly, Quarterly or Annually, over a term in months.
- Every deal has at least one line. When the products are not known yet, add a **Quick estimate**: OEM, category and an estimated value. The OEM can be **To be decided** on estimates, and it reports as its own bucket. Presales later replaces estimates with catalogue products; estimate lines and "To be decided" cannot be priced, quoted or closed as won. Why this structure: [docs/deal-structure.md](docs/deal-structure.md).
- The deal value always rolls up from the lines, and its primary BU, category and OEM come from the largest line. Every roll-up change is audited, so it shows in "changes since last review".
- **Filtering by OEM (or BU, or category)** matches deals with at least one line for it, and values show that OEM's share. A ₹1 Cr deal with ₹40 L of Dell lines counts as ₹40 L under a Dell filter. Totals, charts and the pipeline board use the share; the opportunity list shows both the deal value and a "Dell value" column. The line-items export includes only the matching lines.

**Sales process: BOQ → Pricing → Quote** (details: [docs/sales-workflow.md](docs/sales-workflow.md))

Each team owns a pipeline stage, and the deal moves on automatically as work is handed over:
1. Sales clicks **Request BOQ from presales**. The deal moves to **BOQ**, and presales sees it on their **My work** home.
2. Presales builds the BOQ from the catalogue and clicks **Submit BOQ**. The deal moves to **Pricing**, and purchase is notified (the previous buyer is kept, or the request auto-assigns to the least-loaded one).
3. Purchase enters costs (or **Standard costs** from the catalogue), grouped by OEM for batching RFQs, then clicks **Pricing complete**.
4. Sales clicks **Create & send quote**, sets the margin in the same dialog and sends it. The deal moves to **Proposal Submitted**, and the quote opens as a printable page with HSN/SAC and billing terms.
5. Sales records the **customer response**. **Won** needs the PO, accepts the latest quote and locks the lines for billing (see below).

Every deal page shows one status line under the stage path: where the deal is, who has it, the due date, anything blocking it, and the viewer's own next action (other actions are under **More**). Changes are handled at any point:
- **Request BOQ change**, **Ask sales a question**, **Send back to presales**, **Send revised quote**, **Re-validate costs**, **Reassign** and **Cancel** cover the common cases.
- Only changed lines go back to purchase.
- The BOQ locks while purchase prices it, and simultaneous saves are detected.
- Reminders and overdue escalations are sent automatically.

Everyone can read all deals, costs and margins. Edit rights stay role-based: presales edit the specification, purchase edits only cost fields, and sales edit only sell prices.

**Role homes**
- **Presales** and **Purchase** land on a **My work** page rather than sales numbers: their queue sorted overdue first, quick filters (Overdue, Due this week, Not started, and Partly costed for purchase), and one-click **Start work** / **Open BOQ**.
- Presales also see BOQs waiting on purchase, recently delivered BOQs, their tasks and updates.
- Purchase also see quotes to request grouped by OEM, supplier quotes about to expire on open deals, recently priced BOQs, their tasks and updates.

**Billing-ready by design**

No finance integration is built yet, but the data is shaped so one is a thin addition:
- When a deal is won, its lines are snapshotted (product code, name, HSN/SAC, GST %), stamped with a billing start date (the PO date, or the contract start for recurring lines), marked **Ready to bill** and locked against edits.
- In the same transaction an `opportunity.won` event is written to the `IntegrationEvent` outbox table. Its payload is a versioned list of `BillableLine` records: customer, GSTIN, PAN and address, PO, BU, category, OEM, product, HSN/SAC, GST %, quantity, unit price, taxable value, billing frequency, term, periods and per-period amount. Reopening a won deal unlocks the lines and writes an `opportunity.reopened` event.
- A future finance connector can drain that outbox, or expose `toBillableLines()` (`src/server/domain/billing.ts`) as an API. Lines already have `billingStatus` (Not ready, Ready, Sent, Invoiced) and `externalRef` fields for the finance system to write back.
- Until then, **Export → Line items (billing)** on the opportunities list downloads one CSV row per line with all billing columns.

**Seeing what matters**
- **Health score (0–100)** on every open deal, recalculated on each change and every 30 minutes, with a plain-language "why" panel.
  - *Hot*: score 75+, Proposal or Negotiation, activity in the last 7 days, on schedule.
  - *Dying*: no activity for 21+ days, stuck in stage for more than twice the norm, close date passed by 14+ days, or score below 35.
  - *At risk*: score below 60, or any serious or critical concern.
- **Concern flags** (15 rules), shown as chips and grouped on the dashboard: close date passed, no activity, commit at risk, stuck in stage, close date slipped 3+ times, no presales at BOQ, BOQ or pricing SLA overdue, low margin (under 8%), no next step, single-threaded high-value deal, missing contact, ARR without term, deal registration expiring, RFP due soon.
- **Pipeline review** (modelled on Salesforce Pipeline Inspection), built for team sales calls:
  - Pick **Everyone**, **My team**, one sales person or several; the ‹ › buttons step through reps during the call. Choose the change window (Last review, 7, 14 or 30 days, Quarter start) and the close period. Every choice is one click and stored in the URL.
  - Every field change is audited, including health, so each deal is rebuilt as it stood at the start of the window. Changed amounts, close dates, stages and forecasts show the old value with a green or red arrow; pushes are counted.
  - A metrics bar (total pipeline, commit, best case, pipeline, won, lost, pushed, new or increased, decreased) filters the deal list in one click. Deals are grouped by stage, with insights such as "Close date passed 14d", "Pushed 2×", "No activity 24d" and "Commit at risk".
  - **Raise in this call** lists breached deadlines (close date, bid date, next step), commit at risk, slips, deals that went backwards, BOQ, pricing and deal-registration blockers, and deals gone quiet, each once, largest first.
  - **Done well** and **Lagging** summarise the person against their target and the team median (wins, progress, new pipeline, activities, win rate, coverage, slips, overdue deals). With several people selected, a per-person rollup appears.
  - Click a deal for a side panel with its change history and recent activity, and update next step, close date or forecast during the call.
  - **Complete review** records exactly who was reviewed (one person, a team or everyone) with notes and actions. Actions become tasks for their owners, and the next review opens with them marked Done, Open or Overdue. "Last review" is per person: each rep is compared with the latest review that covered them.
- **Dashboard, Overview tab**: four headline tiles with trends and deltas (open pipeline and its change since the last review, commit vs target, won this quarter vs the same point last quarter, win rate vs the prior year), a **Needs attention** panel (Hot, Dying, Changed since review, Concerns), auto-generated **insights**, quarter forecast against target, bookings trend, pipeline by BU and top performers.
- **Dashboard, Insights tab**: deals created vs won per month, an 8-week closing calendar, stage funnel and conversion, bookings by BU, OEM and product, pipeline health, one-time vs ARR mix, OEM mix, aging, win rate by BU, closing in 30 days and upcoming renewals.
- **Insights** are plain-language findings ranked by size, for example a BU's share of pipeline vs its share of bookings, win rate with and without presales, commit already past its close date, slip behaviour on won vs lost deals, account concentration, stuck stages and renewals due.
- **Reports**: forecast vs target per quarter, stage velocity and conversion, BU × category heatmap, loss reasons, new logo vs existing, win rate by competitor type, and a full sales scorecard.
- **Filters everywhere**, stored in the URL so views are shareable: BU, category, sales person, presales, OEM, stage, forecast, health, concern, account type, revenue model, period and search.
  - Quick views in one click (My deals, Closing this quarter, Commit, Hot, Dying, ₹1 Cr+, Needs attention) and saved views on every page.
  - Searchable pickers with "Only" and Select all, a period picker with fiscal presets, rolling windows and a custom date range, removable chips for every active filter, and a Filters sheet on phones. Press `/` to search.
  - Dashboard cards have their own small toggles (for example Quarters / Year, 6M / 12M, BU / Category / OEM, Bookings / Pipeline / Win rate) that do not change the page filters. The presales and purchase queues have search, sort and sales-person / OEM filters.
- **Click-through dashboards**: every tile, bar, segment and row opens the matching filtered list, for example the Commit tile, a month in the bookings trend, an OEM in the pipeline mix or a week in the closing calendar.
- **Sidebar**: collapse it to an icon rail with the button in the top bar or **Ctrl/⌘ + B**; the choice is remembered.

**Branding**: the Progression logo is used in the sidebar, login page, quotations, 404 page and as the favicon. The wordmark files live in `public/brand/` (drop in higher-resolution versions with the same names to upgrade them). The favicon is a vector redraw of the swoosh: `src/app/icon.svg`, with `favicon.ico` (16/32/48 px) and `apple-icon.png` generated from it. The interface uses the Inter typeface, bundled with the app.

**Conventions**
- Currency is INR in lakh and crore (₹48.6 L, ₹1.25 Cr). The fiscal year runs April–March (Q1 Apr–Jun, FY27 = Apr 2026–Mar 2027). Dates display in IST.
- Accounts carry GSTIN and PAN with format validation and duplicate checks.

## Roles and access

| | Admin | Sales Head | Sales | Presales | Purchase |
|---|---|---|---|---|---|
| Home page | Dashboard | Dashboard | Dashboard | My work | My work |
| Sees deals | All | All | Own | All | All |
| Create and edit deals | ✓ | ✓ | Own | – | – |
| Reassign deals, set targets | ✓ | ✓ | – | – | – |
| BOQ specification | ✓ | ✓ | Own | Assigned | – |
| BOQ cost, distributor | ✓ | – | – | – | ✓ |
| BOQ sell price, quotes | ✓ | ✓ | Own | – | – |
| See cost and margin | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reports | ✓ | ✓ | ✓ | ✓ | ✓ |
| Pipeline review | ✓ | ✓ | ✓ | – | – |
| Product catalogue | Edit | View | View | View | View |
| Settings, users, audit log | ✓ | – | – | – | – |

Permissions are enforced on the server in every action and query, and the UI mirrors them.

## Configuration

Set these in your shell or in a `.env` file next to `docker-compose.yml`.

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `3000` | Host port for the web app |
| `POSTGRES_PASSWORD` | `crm_local_only` | Database password. Change it for any shared deployment. |
| `SESSION_SECRET` | auto-generated | Signs session cookies. If empty, a random secret is generated on first start and kept in the `appdata` volume. |
| `SEED_DEMO_DATA` | `true` | Load demo data when the database is empty |
| `DEMO_LOGINS` | `true` | Show one-click demo sign-in buttons. Set `false` in production. |
| `COOKIE_SECURE` | `false` | Set `true` when served over HTTPS |

**Going to production:** put the app behind HTTPS (for example Nginx, Caddy or a load balancer), set `COOKIE_SECURE=true`, `DEMO_LOGINS=false`, `SEED_DEMO_DATA=false` and a strong `POSTGRES_PASSWORD`, then create real users under Settings → Users. Back up the database with `docker compose exec db pg_dump -U crm crm > backup.sql`.

## Development

Requires Node 22 and PostgreSQL 16.

```bash
cp .env.example .env               # point DATABASE_URL at your Postgres
npm ci
npx prisma migrate deploy
npm run db:seed -- --force         # wipe and reload demo data
npm run dev                        # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript strict checks |
| `npm test` | Unit tests for the health rules, fiscal calendar, INR formatting, BOQ and billing-period maths, line attribution, billing readiness and the billable-line contract, and permissions |
| `npm run test:e2e` | Playwright end-to-end test of the full flow (multi-OEM deal → presales home → purchase RFQs → quote → won and locked → billing export) and role checks, against a running app |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |

**Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, Prisma 6 with PostgreSQL 16, Recharts, Radix UI primitives, Zod validation, and signed HttpOnly JWT sessions with bcrypt password hashing.

**Layout**

```
prisma/                 schema, migrations, seed and its reference data
src/app/(app)/          authenticated pages: dashboard (overview, insights), pipeline, opportunities,
                        accounts, contacts, leads, products, requests, reviews, reports, admin
src/app/(print)/        printable quotation
src/server/actions/     server actions (all writes, with permission checks and audit logging)
src/server/queries/     read models for dashboards, insights, role work queues, lists and reports
src/server/domain/      stage transitions, line-item roll-up, billing lock and outbox events
src/lib/rules/          health score and concern flags (pure, unit-tested)
src/lib/                auth, permissions, fiscal calendar, formatting, filters, audit
src/components/         UI primitives, charts, feature components
tests/                  unit (Vitest) and end-to-end (Playwright) tests
```

## Security notes

- Passwords are hashed with bcrypt. Sign-in is throttled per email and IP. Sessions are signed, HttpOnly, SameSite=Lax cookies with a 10-hour lifetime. Inactive users are signed out on their next request.
- Every page and API route except `/login` and `/api/health` requires a session.
- All input is validated with Zod on the server. CSV exports neutralise spreadsheet formula injection.
- Every create, update, stage change, login and export is written to the audit log, which is visible under Settings.
- Security headers are set: X-Frame-Options DENY, nosniff, a strict referrer policy and a permissions policy. The container runs as a non-root user.

Demo customer names, GSTINs and contacts are fictional.
