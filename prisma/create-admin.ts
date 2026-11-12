// Create or restore an administrator from the server (scripts/create-admin.sh). Bundled to prisma/dist/create-admin.js
// so it runs inside the app image. The password given is temporary: the person chooses their own at first sign-in.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

async function main() {
  const [emailRaw, name = "Administrator", temp] = process.argv.slice(2);
  if (!emailRaw || !temp) throw new Error("Usage: create-admin EMAIL NAME TEMP_PASSWORD");
  const email = emailRaw.trim().toLowerCase();
  const db = new PrismaClient();
  const passwordHash = await bcrypt.hash(temp, 12);
  const u = await db.user.upsert({
    where: { email },
    create: { email, name, role: "ADMIN", passwordHash, mustChangePassword: true },
    update: { role: "ADMIN", active: true, passwordHash, mustChangePassword: true, lockedUntil: null, sessionVersion: { increment: 1 } },
  });
  await db.auditLog.create({ data: { entityType: "User", entityId: u.id, action: "ADMIN_CREATED_FROM_SERVER" } });
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
