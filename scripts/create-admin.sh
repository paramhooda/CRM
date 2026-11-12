#!/bin/sh
# Create an administrator (first install, or if every admin is locked out). Prints a temporary password; the
# person chooses their own at first sign-in.
#   scripts/create-admin.sh admin@yourcompany.com "Your Name"
set -e
cd "$(dirname "$0")/.."
EMAIL="${1:?Usage: scripts/create-admin.sh EMAIL \"FULL NAME\"}"
NAME="${2:-Administrator}"
TEMP="Crm-$(openssl rand -hex 4)-$(openssl rand -hex 2 | tr a-f A-F)9"
docker compose exec -T -e EMAIL="$EMAIL" -e NAME="$NAME" -e TEMP="$TEMP" app node -e '
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
(async () => {
  const db = new PrismaClient();
  const email = process.env.EMAIL.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(process.env.TEMP, 12);
  const u = await db.user.upsert({
    where: { email },
    create: { email, name: process.env.NAME, role: "ADMIN", passwordHash, mustChangePassword: true },
    update: { role: "ADMIN", active: true, passwordHash, mustChangePassword: true, lockedUntil: null, sessionVersion: { increment: 1 } },
  });
  await db.auditLog.create({ data: { entityType: "User", entityId: u.id, action: "ADMIN_CREATED_FROM_SERVER" } });
  await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
'
echo "Administrator ready: $EMAIL"
echo "Temporary password:  $TEMP   (they choose their own at first sign-in)"
