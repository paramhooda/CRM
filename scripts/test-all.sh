#!/usr/bin/env bash
# The whole proof, from an empty database:
#   recreate the test database → migrate → seed → lint → typecheck → unit tests → build → start the built app
#   → API tests → screenshots of every main screen (clean demo data) → browser tests (every core flow per role).
#
# Needs a Postgres server. The test database comes from TEST_DATABASE_URL, or from DATABASE_URL (.env) with the
# database name replaced by crm_test. Nothing in the development database is touched.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then set -a; . ./.env; set +a; fi
: "${DATABASE_URL:?Set DATABASE_URL (see .env.example)}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/crm_test";console.log(u.toString())')}"
PORT="${TEST_PORT:-3100}"
BASE="http://localhost:${PORT}"
export DATABASE_URL="$TEST_DATABASE_URL"
export SESSION_SECRET="${SESSION_SECRET:-test-only-secret-test-only-secret-test-only}"
# NODE_ENV is left to next (build and start set production themselves); the reset script refuses to run in production

step() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
PASSED=(); FAILED=()
run() { # run <name> <command...>
  local name="$1"; shift
  step "$name"
  if "$@"; then PASSED+=("$name"); else FAILED+=("$name"); echo "✗ $name failed"; return 1; fi
}

SERVER_PID=""
cleanup() { if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; fi; }
trap cleanup EXIT

run "Recreate test database ($TEST_DATABASE_URL)" npx tsx scripts/db-reset.ts "$TEST_DATABASE_URL"
run "Migrate (prisma migrate deploy)" npx prisma migrate deploy
run "Seed reference + demo data" npx tsx prisma/seed/index.ts
run "Lint" npx eslint .
run "Typecheck" npx tsc --noEmit
run "Unit tests" npx vitest run --config vitest.config.mts
run "Build" npm run build

step "Start the built app on :$PORT"
npx next start -p "$PORT" > .next/test-server.log 2>&1 &
SERVER_PID=$!
for i in $(seq 1 60); do
  if curl -fs "$BASE/api/v1/health" > /dev/null 2>&1; then break; fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then echo "Server died:"; cat .next/test-server.log; exit 1; fi
  sleep 1
done
curl -fs "$BASE/api/v1/health" > /dev/null || { echo "Server did not come up"; cat .next/test-server.log; exit 1; }

run "API tests" env API_BASE_URL="$BASE" npx vitest run --config vitest.api.config.mts || true
run "Screenshots of every main screen, on clean demo data (docs/screenshots)" env E2E_BASE_URL="$BASE" npx playwright test --project=screenshots --trace off || true
run "Browser tests: every core flow per role" env E2E_BASE_URL="$BASE" npx playwright test --project=flows --trace off || true

printf '\n\033[1mSummary\033[0m\n'
for p in "${PASSED[@]}"; do printf '  ✓ %s\n' "$p"; done
for f in "${FAILED[@]:-}"; do [ -n "$f" ] && printf '  ✗ %s\n' "$f"; done
[ "${#FAILED[@]}" -eq 0 ] && { echo "All green."; exit 0; } || { echo "${#FAILED[@]} step(s) failed."; exit 1; }
