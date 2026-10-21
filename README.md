# Progression CRM

A focused CRM for a Systems Integrator / Managed Services Provider. It covers accounts, contacts, leads, opportunities, a Sales → Presales → Purchase BOQ and pricing workflow, quotes, pipeline reviews and analytics, in a clean, minimal interface.

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
| Presales | `rakesh.yadav@progression.com` | BOQ requests inbox, build and submit a BOQ |
| Purchase | `meera.iyer@progression.com` | Pricing requests inbox, enter costs |
| Admin | `admin@progression.com` | Users, picklists, targets, audit log |

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

**Sales → Presales → Purchase workflow**
1. Sales clicks **Pull in presales** on a deal and picks an engineer, due date and scope. The presales engineer is notified.
2. Presales builds the BOQ (OEM, part number, description, quantity, one-time or monthly recurring lines) and clicks **Submit BOQ to purchase**. Purchase is notified, and the request auto-assigns to the least-loaded buyer if none is chosen.
3. Purchase enters unit cost, distributor and lead time, then clicks **Pricing complete**. Sales and presales are notified.
4. Sales sets sell prices, optionally with **Price at margin**, then clicks **Generate quote**. This versions the quote, updates the deal value and moves the deal to Proposal Submitted. The quote opens as a printable PDF-ready page.

Field-level security applies throughout. Presales never see buy prices or margin. Purchase edits only cost fields. Sales edits only sell prices.

**Seeing what matters**
- **Health score (0–100)** on every open deal, recalculated on each change and every 30 minutes, with a plain-language "why" panel.
  - *Hot*: score 75+, Proposal or Negotiation, activity in the last 7 days, on schedule.
  - *Dying*: no activity for 21+ days, stuck in stage for more than twice the norm, close date passed by 14+ days, or score below 35.
  - *At risk*: score below 60, or any serious or critical concern.
- **Concern flags** (15 rules), shown as chips and grouped on the dashboard: close date passed, no activity, commit at risk, stuck in stage, close date slipped 3+ times, no presales at BOQ, BOQ or pricing SLA overdue, low margin (under 8%), no next step, single-threaded high-value deal, missing contact, ARR without term, deal registration expiring, RFP due soon.
- **Changes since last review**: every field change is audited. The pipeline review page diffs from your last review, the last 7 or 30 days, or any past review. It shows won, lost, newly dying, close dates pushed, moved back, forecast up or down, value changes, new deals, and deals with no movement at all. **Mark as reviewed** saves a new baseline.
- **Dashboard**: open and weighted pipeline, commit vs quarter target with coverage, bookings, win rate, deal size, sales cycle, ARR booked, BU × forecast chart, bookings trend vs target, stage funnel, sales leaderboard, OEM mix, aging, win rate by BU, closing in 30 days, and upcoming ARR renewals.
- **Reports**: forecast vs target per quarter, stage velocity and conversion, BU × category heatmap, loss reasons, new logo vs existing, win rate by competitor type, and a full sales scorecard.
- **Filters everywhere**, stored in the URL so views are shareable: BU, category, sales person, presales, OEM, stage, forecast, health, concern, account type, revenue model, fiscal period and search.

**Conventions**
- Currency is INR in lakh and crore (₹48.6 L, ₹1.25 Cr). The fiscal year runs April–March (Q1 Apr–Jun, FY27 = Apr 2026–Mar 2027). Dates display in IST.
- Accounts carry GSTIN and PAN with format validation and duplicate checks.

## Roles and access

| | Admin | Sales Head | Sales | Presales | Purchase |
|---|---|---|---|---|---|
| Sees deals | All | All | Own | Assigned | Assigned |
| Create and edit deals | ✓ | ✓ | Own | – | – |
| Reassign deals, set targets | ✓ | ✓ | – | – | – |
| BOQ specification | ✓ | ✓ | Own | Assigned | – |
| BOQ cost, distributor | ✓ | – | – | – | ✓ |
| BOQ sell price, quotes | ✓ | ✓ | Own | – | – |
| See cost and margin | ✓ | ✓ | ✓ | – | ✓ |
| Pipeline review, reports | ✓ | ✓ | ✓ | – | – |
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
| `npm test` | Unit tests for the health rules, fiscal calendar, INR formatting, BOQ maths and permissions |
| `npm run test:e2e` | Playwright end-to-end test of the full Sales → Presales → Purchase → Won flow and role checks, against a running app |
| `npm run db:migrate` | Create a new migration after editing `prisma/schema.prisma` |

**Stack:** Next.js 15 (App Router, server actions), React 19, TypeScript, Tailwind CSS 4, Prisma 6 with PostgreSQL 16, Recharts, Radix UI primitives, Zod validation, and signed HttpOnly JWT sessions with bcrypt password hashing.

**Layout**

```
prisma/                 schema, migrations, seed and its reference data
src/app/(app)/          authenticated pages: dashboard, pipeline, opportunities, accounts, contacts,
                        leads, requests, reviews, reports, admin
src/app/(print)/        printable quotation
src/server/actions/     server actions (all writes, with permission checks and audit logging)
src/server/queries/     read models for dashboards, lists and reports
src/server/domain/      stage transition rules
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
