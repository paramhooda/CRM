#!/bin/sh
# Create an administrator (first install, or if every admin is locked out). Prints a temporary password; the
# person chooses their own at first sign-in.
#   scripts/create-admin.sh admin@yourcompany.com "Your Name"
set -e
cd "$(dirname "$0")/.."
EMAIL="${1:?Usage: scripts/create-admin.sh EMAIL \"FULL NAME\"}"
NAME="${2:-Administrator}"
TEMP="Crm-$(openssl rand -hex 4)-$(openssl rand -hex 2 | tr a-f A-F)9"
docker compose exec -T app node prisma/create-admin.js "$EMAIL" "$NAME" "$TEMP"
echo "Administrator ready: $EMAIL"
echo "Temporary password:  $TEMP   (they choose their own at first sign-in)"
