#!/usr/bin/env bash
# Recreates the development database from scratch: empty → migrations → reference + demo seed.
set -euo pipefail
cd "$(dirname "$0")/.."
npx tsx scripts/db-reset.ts
npx prisma migrate deploy
npx tsx prisma/seed/index.ts
