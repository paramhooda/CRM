// Seeds the database. `npm run db:seed` loads reference data (always safe) and demo data (only into an empty
// database, or with --force, which wipes everything first). Never run --force against production.
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { seedReference } from "./reference";

async function main() {
  const force = process.argv.includes("--force");
  const referenceOnly = process.argv.includes("--reference-only");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  const log = (s: string) => console.log(`[seed] ${s}`);
  try {
    const existingUsers = await db.user.count();
    if (force) {
      if (process.env.NODE_ENV === "production" && process.env.ALLOW_SEED_FORCE !== "true")
        throw new Error("Refusing to wipe a production database (set ALLOW_SEED_FORCE=true if you really mean it)");
      log("Wiping all data (--force)");
      const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
      await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    }
    const ref = await seedReference(db, log);
    if (referenceOnly) return;
    if (existingUsers > 0 && !force) {
      log("Database already has data; reference data refreshed, demo data skipped (use --force to start over)");
      return;
    }
    const { seedDemo } = await import("./demo");
    await seedDemo(db, ref, log);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
