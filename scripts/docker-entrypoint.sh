#!/bin/sh
# Container start: apply pending migrations, seed once when the database is empty and asked to, then serve.
set -eu
cd /app

echo "Applying migrations…"
npx prisma migrate deploy

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "SEED_DEMO_DATA=true: seeding reference and demo data if the database is empty…"
  npx tsx prisma/seed/index.ts
else
  echo "Seeding reference data if the database is empty…"
  npx tsx prisma/seed/index.ts --reference-only
fi

echo "Starting Progression CRM on :${PORT:-3000}"
exec npx next start -p "${PORT:-3000}"
