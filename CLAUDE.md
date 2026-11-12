# Working on Progression CRM

This CRM is in daily use by about 30 people and there is no engineering team reviewing changes. Every change must
keep existing data and keep the running system upgradable. These rules are not optional.

## Data safety (most important)

- **Database changes are additive.** New columns are nullable or have a default. New tables are fine.
- **Never drop, rename or retype a column or table in one step.** Use expand → migrate → contract across releases:
  add the new column, copy or derive the data in the same migration, switch the code to it, and drop the old column
  only in a later release once it is unused. `scripts/check-migrations.mjs` fails CI on destructive SQL unless the
  migration has `-- destructive-ok: <reason>`. Only use that marker when the user has agreed to lose that data.
- **Existing rows must make sense after the migration.** If a new field needs a value for old records, fill it in
  the same migration (an `UPDATE …` backfill). Say in the commit and CHANGELOG what happens to current records.
- **Never edit or delete a migration in `prisma/migrations/`** once committed. Production may have run it, and
  `prisma/migrations/shipped.txt` records checksums. Fix mistakes with a new migration.
- Create migrations with `npx prisma migrate dev --name <what>` and review the SQL. Never use `prisma db push`.
- **Never run destructive commands against a non-local database:** `prisma migrate reset`, `db:seed -- --force`,
  `DROP`, `TRUNCATE`. The seed is for local and demo databases only.
- Removing a feature from the UI does not remove its data. Leave the columns until the user explicitly agrees.
- New enum values: add them in a migration of their own, before any migration that uses them (a Postgres rule).

## Before every commit

Run `npm run check` (lint, types, unit tests, migration check) and `npm run check:drift` against the dev database.
For behaviour changes, also run the e2e suite against a production build:

```
npx tsx prisma/seed.ts --force && npm run build && (npm start &) && npx playwright test
```

Add or extend tests for new rules: unit tests for pure logic in `src/lib`, e2e for flows.

## Releases

- Bump `version` in `package.json` (semver: patch for fixes, minor for features, major for anything that needs
  manual steps) and add an entry at the top of `CHANGELOG.md`. Include a **Data** line saying what happens to
  existing records, and any **Upgrade steps**.
- After the user confirms a release is deployed to production, run `node scripts/check-migrations.mjs --ship` and
  commit `prisma/migrations/shipped.txt`.

## Dependencies

Versions are pinned exactly (`npm install --save-exact`). Pick versions at least two weeks old. Upgrade one area at a
time, on its own commit, with the full test suite. Prisma and Next.js majors need their migration guides.

## Code conventions

- Server actions live in `src/server/actions/`. Wrap each exported action in `safeAction` (`src/server/action-error.ts`),
  check permissions with `src/lib/authz.ts`, validate input with zod, and record changes with `src/lib/audit.ts`.
  Throw `UserError` for messages meant for the user.
- Writes that someone else may be editing at the same time use an optimistic version check (`Opportunity.version`,
  `Opportunity.boqVersion`). Bump the version on any write that changes what an open form shows.
- Pure business rules go in `src/lib` and get unit tests. Keep the UI consistent with the existing components.
- Docs: product behaviour in `docs/sales-workflow.md` and `docs/deal-structure.md`; operations in `docs/operations.md`.
  Update them in the same change.
- Commit and push only to the branch you were given. Don't open pull requests unless asked.
