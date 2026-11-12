#!/bin/sh
# Backups for Progression CRM, run inside the `backup` service (postgres:16-alpine).
#   (no argument)     nightly loop: dump at BACKUP_TIME every day, keep BACKUP_KEEP_DAYS days
#   now [label]       one dump right away, e.g. before an upgrade
#   restore FILE      replace the database with FILE (the app must be stopped; see scripts/restore.sh)
#   list              show the backups
set -eu
DIR=/backups
KEEP="${BACKUP_KEEP_DAYS:-14}"
AT="${BACKUP_TIME:-01:30}"

log() { echo "[backup] $(date '+%Y-%m-%d %H:%M:%S') $*"; }

dump() {
  label="${1:-nightly}"
  f="$DIR/$label-$(date +%Y%m%d-%H%M%S).dump"
  # Custom format: compressed, and restorable table by table if ever needed
  pg_dump -Fc --no-owner -f "$f.part"
  mv "$f.part" "$f"
  # The session secret decrypts settings stored in the database (e.g. the email password); keep a copy with the dumps
  if [ -s /appdata/.session_secret ]; then cp /appdata/.session_secret "$DIR/session_secret.txt" && chmod 600 "$DIR/session_secret.txt"; fi
  log "saved $f ($(du -h "$f" | cut -f1))"
}

prune() {
  find "$DIR" -name 'nightly-*.dump' -mtime +"$KEEP" -delete
  find "$DIR" -name 'manual-*.dump' -mtime +90 -delete
  find "$DIR" -name 'pre-*.dump' -mtime +90 -delete
  find "$DIR" -name '*.part' -mmin +240 -delete
}

case "${1:-loop}" in
  now)
    mkdir -p "$DIR"; dump "${2:-manual}"; prune ;;
  list)
    ls -lh "$DIR" ;;
  restore)
    f="${2:?Usage: restore FILE}"
    case "$f" in /*) ;; *) f="$DIR/$f" ;; esac
    [ -s "$f" ] || { echo "No backup at $f"; exit 1; }
    log "restoring $f"
    psql -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
    pg_restore --no-owner --exit-on-error -d "$PGDATABASE" "$f"
    log "restored $f" ;;
  loop)
    mkdir -p "$DIR"
    log "nightly backups at $AT, kept $KEEP days, in the 'backups' volume"
    while true; do
      now=$(date +%s)
      next=$(date -d "$(date +%Y-%m-%d) $AT" +%s)
      [ "$next" -le "$now" ] && next=$((next + 86400))
      sleep $((next - now))
      dump nightly || log "BACKUP FAILED"
      prune || true
    done ;;
  *)
    echo "Usage: backup.sh [now [label] | list | restore FILE]"; exit 2 ;;
esac
