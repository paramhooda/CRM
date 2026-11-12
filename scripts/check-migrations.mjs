#!/usr/bin/env node
// Guards the database migrations, the part of an upgrade that can lose data. Run in CI and before committing.
//
//   node scripts/check-migrations.mjs          check
//   node scripts/check-migrations.mjs --ship   after a release is deployed: record the new migrations as shipped
//
// 1. Shipped migrations (listed in prisma/migrations/shipped.txt with a checksum) must never change: production has
//    already run them, and Prisma would refuse to start, or the change would silently never apply.
// 2. New migrations must only add things. Dropping, renaming or retyping a column or table, or deleting rows, loses
//    data. When it is truly intended (a column emptied and unused for a release), the migration must say why on a line
//    `-- destructive-ok: <reason>`.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync, appendFileSync, statSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "prisma", "migrations");
const MANIFEST = path.join(DIR, "shipped.txt");

/** Statements that lose data, with what to do instead */
export const DESTRUCTIVE = [
  [/\bDROP\s+TABLE\b/i, "drops a table"],
  [/\bDROP\s+COLUMN\b/i, "drops a column"],
  [/\bRENAME\s+(COLUMN|TO)\b/i, "renames a column or table (add the new one, copy the data, drop the old one in a later release)"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "changes a column's type"],
  [/\bDROP\s+TYPE\b/i, "drops an enum"],
  [/\bTRUNCATE\b/i, "empties a table"],
  [/\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bSET\s+NOT\s+NULL\b/i, "makes a column required (existing rows must be filled first in the same migration)"],
];

export function destructiveProblems(sql) {
  if (/^--\s*destructive-ok:\s*\S+/im.test(sql)) return [];
  const code = sql.replace(/--.*$/gm, "");
  return DESTRUCTIVE.filter(([re]) => re.test(code)).map(([, why]) => why);
}

const sha = (f) => createHash("sha256").update(readFileSync(f)).digest("hex");

function migrations() {
  return readdirSync(DIR)
    .filter((n) => statSync(path.join(DIR, n)).isDirectory())
    .sort()
    .map((name) => ({ name, file: path.join(DIR, name, "migration.sql") }));
}

function shipped() {
  if (!existsSync(MANIFEST)) return new Map();
  return new Map(
    readFileSync(MANIFEST, "utf8").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")).map((l) => l.split(/\s+/)).map(([n, h]) => [n, h]),
  );
}

function main() {
  const all = migrations();
  const done = shipped();
  if (process.argv.includes("--ship")) {
    const add = all.filter((m) => !done.has(m.name));
    if (!existsSync(MANIFEST)) appendFileSync(MANIFEST, "# Migrations already applied in production. Never edit or remove a line; never edit these migrations.\n");
    for (const m of add) appendFileSync(MANIFEST, `${m.name} ${sha(m.file)}\n`);
    console.log(add.length ? `Recorded ${add.length} migration(s) as shipped.` : "Nothing new to record.");
    return;
  }
  const errors = [];
  const names = new Set(all.map((m) => m.name));
  for (const [name, hash] of done) {
    if (!names.has(name)) errors.push(`${name}: a shipped migration was deleted. Restore it from git.`);
    else if (sha(path.join(DIR, name, "migration.sql")) !== hash) errors.push(`${name}: a shipped migration was edited. Undo the edit and put the change in a new migration.`);
  }
  for (const m of all.filter((m) => !done.has(m.name))) {
    for (const why of destructiveProblems(readFileSync(m.file, "utf8"))) {
      errors.push(`${m.name}: ${why}. This can lose data. Make the change additive, or add "-- destructive-ok: <reason>" if it is intended.`);
    }
  }
  if (errors.length) {
    console.error("Migration check failed:\n" + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`Migration check passed: ${done.size} shipped, ${all.length - done.size} new.`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
