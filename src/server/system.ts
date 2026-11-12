// Installation health for Admin → Email & system: version, database, latest backup.
import "server-only";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { fmtSize } from "@/lib/documents";

/** Where the backup service writes dumps; mounted read-only into the app container (docker-compose.yml) */
const BACKUP_DIR = process.env.BACKUP_DIR ?? "/backups";

export async function latestBackup() {
  try {
    const names = (await readdir(BACKUP_DIR)).filter((n) => n.endsWith(".dump"));
    const files = await Promise.all(names.map(async (n) => ({ n, s: await stat(path.join(BACKUP_DIR, n)) })));
    files.sort((a, b) => b.s.mtimeMs - a.s.mtimeMs);
    const top = files[0];
    return { visible: true, count: files.length, latest: top ? { file: top.n, at: top.s.mtime, size: fmtSize(top.s.size) } : null };
  } catch {
    return { visible: false, count: null, latest: null };
  }
}

export async function systemStatus() {
  const t = Date.now();
  let dbOk = true;
  let dbSize: string | null = null;
  try {
    const [r] = await db.$queryRaw<{ size: bigint }[]>`SELECT pg_database_size(current_database()) AS size`;
    dbSize = r ? fmtSize(Number(r.size)) : null;
  } catch {
    dbOk = false;
  }
  const dbMs = Date.now() - t;
  const b = await latestBackup();
  const mode = (process.env.COOKIE_SECURE ?? "auto").toLowerCase();
  return {
    version: `${process.env.APP_VERSION ?? "dev"}${process.env.GIT_SHA ? ` (${process.env.GIT_SHA.slice(0, 7)})` : ""}`,
    dbOk, dbMs, dbSize,
    lastBackup: b.latest,
    backupStale: !!b.latest && Date.now() - b.latest.at.getTime() > 2 * 86_400_000,
    backupsVisible: b.visible,
    backupCount: b.count,
    cookieMode: mode === "auto" ? "Automatic (on when opened over HTTPS)" : mode === "true" ? "Always" : "Off",
  };
}
