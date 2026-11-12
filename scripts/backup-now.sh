#!/bin/sh
# Take a database backup right now (into the `backups` volume). Run from the folder with docker-compose.yml.
#   scripts/backup-now.sh            → manual-YYYYMMDD-HHMMSS.dump
#   scripts/backup-now.sh pre-change → pre-change-YYYYMMDD-HHMMSS.dump
set -e
cd "$(dirname "$0")/.."
docker compose run --rm -T backup now "${1:-manual}"
