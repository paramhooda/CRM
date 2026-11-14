# Progression CRM v2: build report

Branch `crm-v2`. Built from scratch against `docs/PRODUCT.md`; the old application was removed in the first commit
(only the brand assets were kept). Every table and column is described in `docs/DATA_DICTIONARY.md`.

## 1. What was built

**Data model** (31 tables, 14 enums, one migration): admin-editable lookups (business units with a colour, Sub BUs with
a *needs presales* flag, OEMs with an *Own IP* flag, lead sources, segments, industries, loss reasons, document kinds,
sales methods), the product catalogue, users with a reporting line, password identities and database sessions
(structured so a Microsoft 365 identity can be added without a schema change), accounts (unique GSTIN), contacts
(unique email), leads, deals with opportunity lines and derived roll-ups, stage history, a field-level audit log,
presales and pricing requests, deal documents (stored in the database), approval rules with ordered steps, deal
approvals, pipeline reviews and quarterly targets. Soft deletes on accounts, contacts, leads, deals, products and
documents; permanent UUID ids; UTC timestamps; money as decimal(16,2) with currency.

**API** (`/api/v1`, 56 route files): one wrapper enforces the session, the role, the CSRF header on writes, zod
validation with field errors and a uniform error envelope. Services enforce record scope (own / team / everything /
assigned) and strip sell-side fields for presales and purchase. Out-of-scope records answer 404. Optimistic locking on
deals (`version`), login rate limiting and lockout, CSV exports with BOM and formula-safe cells.

**Business rules** (pure, unit-tested): eight stages with gates (contact and future close date to leave Qualified;
priced lines, no open request and a valid approval to send a proposal; PO number and Customer PO document to close as
won; Hold/Resume; Lost and Dropped with a reason; Back and Reopen for managers only), line and deal money
(one-time and ARR, GM, primary BU/OEM), approval matching and chain resolution with a price fingerprint so a changed
price lapses an approval, visibility scope, the permission matrix, review flags and per-person summaries, fiscal year
(April to March), rupee formatting, record codes.

**Screens** (shadcn/ui on the design system in `docs/DESIGN.md`, light and dark through tokens): sign-in; Home (numbers, to-do, filterable click-through
charts) for sales roles; My work for presales and purchase; deals list with totals and a read-only board; new deal
with a line editor (catalogue or custom lines, one-time or ARR); the deal page (facts, stage path, one Advance button
and a menu for every other move with the fields each needs, lines by role, presales and pricing request cards, price
approval card, documents, history with old and new values); accounts with contacts and deals; contacts; leads with
convert and disqualify; approvals inbox; pipeline review with scope and window, changes, flags, per-person summaries,
mark reviewed and past reviews; admin: users, master data for every lookup, product catalogue, approval rules,
targets, audit log; account settings and password change. Loading, empty and error states on every screen.

**Seed**: reference data plus deterministic demo data (28 people across the five roles and two sales teams, 106
catalogue products, 40 accounts, ~120 contacts, 30 leads, 160 deals in every stage with lines, requests, approvals,
documents, history and audit rows, targets, a past review). Password for every demo user: `Progression@123`.

**Tooling**: `scripts/test-all.sh` runs the whole proof from an empty database; GitHub Actions runs it with a Postgres
service and builds the Docker image; `docker compose up --build` runs Postgres and the app, migrating on start;
`npm run docs:dictionary` regenerates the data dictionary from the schema comments; `CLAUDE.md` carries the rules for
future changes.

**Deal flow, hardened for non-technical users** (third round): one set of rules in `domain/stages.ts` and
`domain/workflow.ts` decides, per role and stage, what can be done and what comes next, and every screen renders
the server's answer. A "What's next" panel opens every deal page: the viewer's own step first with the one button
that does it, the reason when it cannot be done yet, who is being waited on and by when; presales and purchase see
their own steps and one line for everything sales does, never a price. The gaps the audit found are closed:
a deal is handed to presales only through Advance to BOQ, with a required scope and the customer's requirement
document (uploaded inside the dialog when missing; an open request is reused, never doubled); purchase can be asked
only once lines with a third-party OEM exist, in any open stage, and not by sales while presales is still building
the BOQ; lines are frozen for sales while presales works and for everyone but the buyer while purchase prices them;
every line needs a cost before the proposal, so a GM approval rule cannot be skipped by leaving costs empty; Won
needs final, approved prices (a Negotiation discount lapses the approval, and approval can be asked for in any open
stage); nothing is worked while a deal is on hold; deleted deals have no moves. The customer contact can be picked or
added from the deal page, My work says what is left to do on each request, uncosted lines say so, and the sales
note on what happens next is edited in place. Optional, key-gated OpenAI helpers draft the presales scope and the
BOQ summary and write a plain-English deal brief for a pipeline call.

## 2. Decisions and assumptions

Taken with the owner during the build:

- **Deal model**: product-level opportunity lines (the Salesforce "opportunity products" pattern) with BU, Sub BU and
  OEM on every line, so funnels cut by BU, Sub BU, OEM and product. No bundles, no quote generator.
- **Stages**: no "Identified" stage; new deals start at Qualified.
- **Kept**: leads, documents on deals, admin-defined approval chains, the pipeline review page.
- **Flow rules** (third round, with the owner): the proposal document stays optional (quotes are often produced
  outside the upload flow), the customer's requirement is mandatory for the hand-over to presales, every line must
  be costed before a proposal, and the assistant uses an OpenAI key the owner supplies.
- **Design system** (`docs/DESIGN.md`): matched to the owner's reference application. A white sidebar with one
  line per module that minimises to an icon rail (the owner asked for "simple module-wise" navigation, with New
  deal as a button inside Deals rather than a second entry), a 76px top bar with search, New deal, an approvals
  badge and the avatar; a hero card with a
  period segmented control and a scope select at the top of every page; uppercase section captions; trend tiles
  with tinted icon squares, sparklines and delta pills; flow bars, donuts and a weekday × hour heatmap; a stage
  performance table; one metric row per business unit and an accounts strip; dotted status pills and underline tabs.
  Every colour, font, radius and shadow is a token and a unit test keeps raw values out of components and every
  tinted pair at WCAG AA. The sign-in page offers one-click demo logins for the five roles when `SEED_DEMO_DATA`
  is true.

Inferred where the brief was silent (each is also marked **[inferred]** in `docs/PRODUCT.md`):

- Presales owner and next step live on the deal, not on each line; lines keep their own last-updated time.
- "Own IP" is a flag on the OEM record (so a rename cannot break the rule).
- Lines are hard-deleted with an audit row; the deal around them is soft-deleted.
- The Customer PO file and PO number are required at Closed-Won.
- Deleting accounts, leads and deals is a manager permission; restoring is admin only. A rep deactivates nothing.
- Excel export is CSV with a BOM, which Excel opens directly; no native `.xlsx`.
- Demo data has a second Sales Head with a smaller team so team scoping is visible.
- The board view is read-only; moves happen on the deal page so every gate can be explained.
- Exports for presales and purchase contain only the technical columns they can see on screen.

## 3. Left out on purpose

Bundle pricing; quote documents, versions and printing; supplier quotes tied to lines; health scores and insight
engines; email, notifications and SMTP; password-reset emails (an admin resets passwords instead); backup, upgrade and
restore scripts; HTTPS termination; saved views; a command palette; an activities/tasks module; competitor,
distributor, deal-registration and procurement-mode fields; contract dates (they belong in the ERP); native Excel
files; Microsoft 365 sign-in (the identity table is ready for it); anything for finance beyond keeping closed-won lines
intact. The rate-limit store is in-process (fine for one app instance; a second instance would need a shared store).

## 4. Verification

Everything below was run by `scripts/test-all.sh` from an empty database: recreate → migrate → seed → lint → typecheck
→ unit tests → production build → start → API tests → browser tests → screenshots.

| Step | Result |
|---|---|
| Recreate test database, `prisma migrate deploy`, seed | pass |
| Lint, typecheck | pass |
| Unit tests (stages, workflow checklist and request rules, lines, approvals, AI prompts, scope and permissions, review, formatting, design tokens) | pass, 61 tests |
| Production build (`next build`) | pass |
| API tests (every route group: happy path, validation, 401, 403, out-of-scope 404, 409, shaped responses, CSV; the flow rules: document before hand-over, lines before pricing, frozen lines, costs before proposal, approval before won, nothing on hold, AI off) | pass, 47 tests |
| Browser tests, every core flow per role | pass, 33 tests |
| Screenshots of every main screen per role | pass, 7 runs, 41 images |

Browser flows, by requirement:

| Flow | Role(s) | Spec | Result |
|---|---|---|---|
| Login and logout; one-click demo login; wrong password refused; support roles kept off the funnel | all five roles | `tests/e2e/auth.spec.ts` | pass |
| Create an account and a contact; GSTIN validated | Sales | `tests/e2e/accounts.spec.ts` | pass |
| Capture, work, convert and disqualify a lead | Sales | `tests/e2e/leads.spec.ts` | pass |
| Deal with three lines (catalogue, custom own-IP, recurring) created through the screens | Sales | `tests/e2e/deal-won.spec.ts` | pass |
| Following only the What's next panel: sales told to attach the requirement, hands over inside Advance to BOQ (scope and document required); presales told to start, costs the own-IP line, submits; sales told to ask purchase; purchase told which line to cost, Complete held back until it is; sales advances, attaches the PO from the panel, closes won; every stage dated in History; lines frozen for the wrong role at each step | Sales, Presales, Purchase | `tests/e2e/deal-won.spec.ts` | pass |
| Hold, resume, Closed-Lost with a required reason; Dropped; reopen by a manager only | Sales, Sales Head | `tests/e2e/deal-lost.spec.ts` | pass |
| Edit name, forecast and a line price; History and the audit log show old and new values; stale save refused | Sales, Admin | `tests/e2e/audit.spec.ts` | pass |
| Another rep cannot see or change a deal through the screens or the API (404); regional head sees only their team | Sales ×2, Sales Head ×2 | `tests/e2e/access.spec.ts` | pass |
| Presales and purchase see only assigned deals, never prices, GM or the customer PO; writes need the request header | Presales, Purchase | `tests/e2e/access.spec.ts` | pass |
| Manager's open-pipeline tile = deals list total = export sum, row by row; filtered exports match the table | Sales Head, Sales | `tests/e2e/manager.spec.ts` | pass |
| Pipeline review: scope, window, mark reviewed, past reviews | Sales Head | `tests/e2e/manager.spec.ts` | pass |
| Admin adds an OEM and it appears in the line dialog; deactivating removes it | Admin, Sales | `tests/e2e/admin.spec.ts` | pass |
| Soft delete and restore of an account and a deal; an account with live deals cannot be deleted | Sales Head, Admin, Sales | `tests/e2e/admin.spec.ts` | pass |
| Admin creates a user; first sign-in forces a password change | Admin, new user | `tests/e2e/admin.spec.ts` | pass |

Defects the suite found and that were fixed before this report: the line dialog's submit bubbled into the deal form
(a deal could be saved with no lines); blank optional fields failed client-side validation; the PO number was dropped
when an Advance landed on Closed-Won; the fields a stage move sets (hold reason, loss reason, PO number, presales
owner) were not audited; test dates were computed in UTC while the app counts "today" in IST.

**Not verified in the build environment:** the Docker image. The sandbox this was built in does not let a container
reach the npm registry (TLS is intercepted), so `docker build` could not complete here. The Dockerfile uses only the
official `node:22-alpine` image and `npm ci`; the CI workflow's `docker` job builds it, and the first
`docker compose up --build` on a normal machine is the check.

Screenshots of every main screen, per role, are in `docs/screenshots/` (light, dark and a phone-width view of the
deals list). They were checked against `docs/DESIGN.md`: `#fafafa` page and sidebar, white cards with 1px borders and faint
shadows, brand-blue primary, links and selection, stage and forecast tags that always carry text, one colour per
business unit in tags and charts, codes and money in Geist Mono, 36px controls, loading and empty states.

## 5. How to run locally

```
cp .env.example .env            # works as is for a local run
docker compose up -d db         # Postgres 16 on :5432
npm install                     # also generates the Prisma client
npm run db:migrate              # applies prisma/migrations
npm run db:seed                 # reference + demo data (every demo user: Progression@123)
npm run dev                     # http://localhost:3000
```

Sign in as `vivek.malhotra@progression.com` (Sales Head), `rakesh.pawar@progression.com` (Sales),
`rakesh.yadav@progression.com` (Presales), `meera.iyer@progression.com` (Purchase) or `admin@progression.com`.

Whole stack in Docker: `docker compose up --build` (set `SEED_DEMO_DATA=true` in `.env` for the demo data). Tests: `npm test`, `npm run test:api`, `npm run test:e2e` against a running seeded server,
or `npm run test:all` for the full proof.
