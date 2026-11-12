#!/bin/sh
# Upgrade the CRM to the latest code (or a given git tag/branch) with a backup first, then wait until it is healthy.
#   deploy/upgrade.sh            → latest commit of the current branch
#   deploy/upgrade.sh v1.1.0     → a specific release
# If anything goes wrong: deploy/upgrade.sh <previous tag> and scripts/restore.sh <the pre-upgrade backup>.
set -e
cd "$(dirname "$0")/.."
TARGET="$1"

echo "== Current version: $(git describe --tags --always 2>/dev/null)"
echo "== Backing up the database"
docker compose run --rm -T backup now "pre-upgrade-$(git rev-parse --short HEAD)"

echo "== Fetching code"
git fetch --tags --quiet
if [ -n "$TARGET" ]; then git checkout --quiet "$TARGET"; else git pull --ff-only --quiet; fi
echo "== Upgrading to $(git describe --tags --always 2>/dev/null)"

GIT_SHA="$(git rev-parse HEAD)" docker compose build app
docker compose up -d

echo "== Waiting for the CRM to start (database changes are applied now)"
i=0
until docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" 2>/dev/null; do
  i=$((i + 1))
  if [ "$i" -ge 60 ]; then
    echo "!! The CRM did not become healthy. Recent log:"; docker compose logs --tail 40 app
    echo "!! To go back: deploy/upgrade.sh <previous tag>, then scripts/restore.sh <pre-upgrade backup> if the data changed."
    exit 1
  fi
  sleep 5
done
echo "== Done. Running $(git describe --tags --always 2>/dev/null)."
