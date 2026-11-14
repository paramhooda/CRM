import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` needs no database (the Docker image is built without one); `migrate` and `db` commands do,
// and Prisma reports a missing URL itself when they run.
const url = process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed/index.ts",
  },
  ...(url ? { datasource: { url } } : {}),
});
