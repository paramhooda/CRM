// Minimal structured logging: one JSON line per event on stdout/stderr, read with `docker compose logs app`.
import "server-only";

type Level = "info" | "warn" | "error";

function write(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write("info", msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write("warn", msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write("error", msg, fields),
};

export function errorFields(e: unknown) {
  if (e instanceof Error) return { error: e.message, name: e.name, code: (e as { code?: string }).code, stack: e.stack?.split("\n").slice(0, 8).join("\n") };
  return { error: String(e) };
}
