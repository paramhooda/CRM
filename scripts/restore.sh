#!/bin/sh
# Put a backup back. Everything entered after that backup is lost, so a safety backup of the current state is taken
# first. Run from anywhere; lists the backups when called without a file name.
#   scripts/restore.sh                                     → list backups
#   scripts/restore.sh nightly-20261112-013000.dump        → restore that one
set -e
cd "$(dirname "$0")/.."
if [ -z "$1" ]; then
  docker compose run --rm -T backup list
  echo; echo "Usage: scripts/restore.sh FILE   (a name from the list above)"; exit 0
fi
FILE="$1"
echo "This replaces ALL data in the CRM with the backup $FILE."
echo "Anything entered after that backup was taken will be lost (a safety copy of the current data is taken first)."
printf "Type RESTORE to continue: "
read -r answer
[ "$answer" = "RESTORE" ] || { echo "Cancelled."; exit 1; }
docker compose stop app
docker compose run --rm -T backup now pre-restore
docker compose run --rm -T backup restore "$FILE"
docker compose start app
echo "Restored. If this backup came from an older version of the CRM, run that version (git checkout <tag>), or start"
echo "the current one and it will bring the database up to date."
