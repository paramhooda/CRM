#!/bin/sh
# Start-up: ensure a session secret, back up and migrate the database, load demo data if asked, start the server.
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

PRISMA="node /opt/prisma-cli/node_modules/prisma/build/index.js"
PGURL="${DATABASE_URL%%\?*}"   # pg tools don't accept Prisma's ?schema=… options
VERSION="$(node -p "require('./package.json').version" 2>/dev/null || echo unknown)"

echo "[crm] Waiting for the database…"
attempt=1
until pg_isready -q -d "$PGURL"; do
  if [ "$attempt" -ge 20 ]; then
    echo "[crm] Database not reachable after $attempt attempts. Check DATABASE_URL and that the db service is running." >&2
    exit 1
  fi
  attempt=$((attempt + 1))
  sleep 3
done

# Before applying new migrations to a database that already has data, take a backup. If the upgrade goes wrong,
# this file is how you get back (scripts/restore.sh).
APPLIED="$(psql "$PGURL" -tAc 'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL' 2>/dev/null || true)"
PENDING=""
if [ -n "$APPLIED" ]; then
  for d in ./prisma/migrations/*/; do
    name="$(basename "$d")"
    echo "$APPLIED" | grep -qx "$name" || PENDING="$PENDING $name"
  done
fi
if [ -n "$PENDING" ]; then
  mkdir -p /backups
  BK="/backups/pre-upgrade-v$VERSION-$(date +%Y%m%d-%H%M%S).dump"
  echo "[crm] New database changes to apply:$PENDING"
  echo "[crm] Backing up the database first to $BK"
  if ! pg_dump -Fc --no-owner -f "$BK.part" "$PGURL"; then
    echo "[crm] Backup failed, so the upgrade was not applied. Nothing has changed. Check free disk space and the backups volume." >&2
    rm -f "$BK.part"
    exit 1
  fi
  mv "$BK.part" "$BK"
fi

echo "[crm] Applying database migrations…"
if ! $PRISMA migrate deploy --schema ./prisma/schema.prisma; then
  echo "[crm] The database upgrade failed. The app has not started, so no one is working on a half-upgraded database." >&2
  [ -n "$PENDING" ] && echo "[crm] Your data from just before the upgrade is in $BK. To go back: scripts/restore.sh $(basename "$BK"), then run the previous version." >&2
  exit 1
fi

if [ "${SEED_DEMO_DATA:-false}" = "true" ]; then
  echo "[crm] Loading demo data if the database is empty…"
  node ./prisma/seed.js
fi

echo "[crm] Starting Progression CRM v$VERSION on port ${PORT:-3000}"
exec node server.js
