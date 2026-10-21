#!/bin/sh
# Start-up: ensure a session secret, apply migrations, load demo data on first run, start the server.
set -e

SECRET_FILE=/app/data/.session_secret
if [ -z "$SESSION_SECRET" ]; then
  if [ ! -s "$SECRET_FILE" ]; then
    echo "[crm] No SESSION_SECRET provided; generating one and storing it in the data volume."
    head -c 48 /dev/urandom | base64 | tr -d '\n' > "$SECRET_FILE"
    chmod 600 "$SECRET_FILE"
  fi
  SESSION_SECRET="$(cat "$SECRET_FILE")"
  export SESSION_SECRET
fi

echo "[crm] Applying database migrations…"
attempt=1
until node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema ./prisma/schema.prisma; do
  if [ "$attempt" -ge 10 ]; then
    echo "[crm] Database not reachable after $attempt attempts. Check DATABASE_URL." >&2
    exit 1
  fi
  echo "[crm] Database not ready yet (attempt $attempt). Retrying in 3s…"
  attempt=$((attempt + 1))
  sleep 3
done

if [ "${SEED_DEMO_DATA:-true}" = "true" ]; then
  echo "[crm] Loading demo data if the database is empty…"
  node ./prisma/seed.js
fi

echo "[crm] Starting Progression CRM on port ${PORT:-3000}"
exec node server.js
