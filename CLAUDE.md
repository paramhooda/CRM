# Progression CRM

Internal CRM for Progression (systems integrator / managed services provider, ~30 users). The product is specified in
`docs/PRODUCT.md`; every table and column is described in `docs/DATA_DICTIONARY.md` (generated). Build against the
spec; when the spec and the code disagree, the spec wins and the code is fixed.

## Stack

- Next.js 16 (App Router) + React 19 + TypeScript, strict. Tailwind 4 + shadcn/ui (Radix). lucide icons, recharts
  through the shadcn chart component, sonner toasts, next-themes.
- Postgres 16 through Prisma 7 (`@prisma/adapter-pg`). zod schemas shared by forms and routes. decimal.js for money.
- vitest (unit + API tests), Playwright (browser tests), eslint, prettier. Docker Compose for Postgres and the app.
- Dependencies are pinned exact (`.npmrc` has `save-exact=true`, `legacy-peer-deps=true`).

## Layout

```
docs/            PRODUCT.md (spec), DESIGN.md (design system), DATA_DICTIONARY.md (generated), REPORT.md, screenshots/
prisma/          schema.prisma (/// comments feed the dictionary), migrations/, seed/ (reference + demo data)
scripts/         test-all.sh (everything from an empty DB), db-reset.*, data-dictionary.ts, docker-entrypoint.sh
src/app/         (auth)/login, (app)/… screens (server components read through services), api/v1/** route handlers
src/components/  ui/ (shadcn, generated then restyled: heights, radii, shadows; `shadcn add` overwrites, re-apply from git), crm/ (one component per job)
src/contracts/   zod schemas + types for every request body and list query
src/domain/      pure business rules, no I/O: stages, lines, approvals, scope, permissions, review, fiscal, money, csv
src/server/      db, http (route wrapper), errors, audit, auth/, authz/, services/ (the only place that touches Prisma)
src/client/      api.ts (the one fetch wrapper), use-form.ts
tests/           unit/, api/ (against a running server), e2e/ (Playwright, one spec per core flow)
```

Layering: screen or route → `handle()` (session, role, CSRF header, zod, error envelope) → service → Prisma.
Services call `domain/*` for rules and `authz/*` for scope. Screens never query Prisma directly and never duplicate a
rule that lives in `domain/`. All browser writes go through `/api/v1` via `src/client/api.ts`.

The deal flow has one source of truth: `domain/stages.ts` (moves and their gates) and `domain/workflow.ts` (who may
raise a request, who may upload, and the per-role "What's next" checklist). `services/deals.ts` returns `moves`,
`requestAbility`, `canUpload` and `next` on every deal; the deal page only renders them and never decides on its own.
A new rule goes into those two modules with a unit test, then into the service that enforces it with an API test.

## Run

```
cp .env.example .env          # works as is for a local run
docker compose up -d db       # Postgres 16
npm install                   # also generates the Prisma client (postinstall)
npm run db:migrate            # prisma migrate dev
npm run db:seed               # reference data + demo data (password for everyone: Progression@123)
npm run dev                   # http://localhost:3000
```

`docker compose up --build` runs Postgres and the app together; the container migrates on start and seeds when the
database is empty (`SEED_DEMO_DATA=true` adds the demo data).

## Test

```
npm test              # unit tests (domain rules, permissions, csv…)
npm run test:api      # API tests; needs a running server on API_BASE_URL (default :3000) with seeded data
npm run test:e2e      # browser tests; needs a running server on E2E_BASE_URL (default :3000) with seeded data
npm run test:all      # the whole proof from an empty database (recreate crm_test → migrate → seed → lint →
                      # typecheck → unit → build → start → API → browser → screenshots). CI runs this.
```

## Rules

1. **Every schema change needs a migration** (`npm run db:migrate`), and `///` comments on new tables and columns;
   then `npm run docs:dictionary`. Never edit a migration that has been pushed.
2. **Never drop data.** Soft delete (`deleted_at`) for records, deactivate (`is_active`) for lookups and users.
   A migration never deletes rows or columns without an explicit, reviewed plan.
3. **Every feature gets tests**: a unit test for a rule in `domain/`, an API test for a route (including the
   permission-denied case), a browser test for a user-facing flow. A fix for a bug starts with a test that fails.
4. **Do not touch login, sessions or permissions without asking.** That is `src/server/auth/**`, `src/server/authz/**`,
   `src/domain/permissions.ts`, `src/domain/scope.ts`, `src/proxy.ts` and the auth routes.
5. **Keep it lean.** No new module, field, dependency or setting unless the spec needs it. Prefer removing to adding.
   One component per job; reuse `components/crm/*` before writing a new one.
6. Every permission is enforced on the server (`handle({ roles })` + scope in services); the UI only hides what the
   server would refuse. Out-of-scope reads answer 404, never 403, so records are not enumerable.
7. Money is `Decimal` in the database and strings over the API; never do arithmetic with JS numbers on money
   (use `domain/money.ts`). Dates are UTC; date-only values are `yyyy-mm-dd` strings over the API.
8. Audit: every write goes through `recordChanges`/`recordEvent` with old and new values; stage moves write
   `deal_stage_history`. Do not add a write path that skips this.
9. Secrets only in `.env` (ignored). Never commit `.env`, never log a password, token or session cookie.
10. Lint, typecheck and the unit tests must be green before a commit; run `npm run test:all` before a release.
11. **Colours, fonts, radii and shadows are tokens** in `src/app/globals.css` (see `docs/DESIGN.md`). No raw hex,
    `rgb()` or Tailwind palette class in a component; `tests/unit/design-tokens.test.ts` enforces it and checks the
    contrast of every tinted pair. Status colour only for actual status.
