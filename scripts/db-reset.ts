// Drops and recreates the database named in a connection string (default: DATABASE_URL from .env).
// Used by `npm run db:reset` (dev) and scripts/test-all.sh (test database). Refuses to run in production.
import "dotenv/config";
import { Client } from "pg";

const url = process.argv[2] ?? process.env.DATABASE_URL;
if (!url) {
  console.error("Give a connection string or set DATABASE_URL.");
  process.exit(1);
}
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to reset a database in production.");
  process.exit(1);
}
const target = new URL(url);
const dbName = target.pathname.replace(/^\//, "");
if (!/^[a-zA-Z0-9_]+$/.test(dbName)) {
  console.error(`Unsafe database name: ${dbName}`);
  process.exit(1);
}
const admin = new URL(url);
admin.pathname = "/postgres";

async function main() {
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, [dbName]);
  await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
  await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();
  console.log(`Database ${dbName} recreated (empty).`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
