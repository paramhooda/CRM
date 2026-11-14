import "server-only";

/** True when a Prisma write failed on a unique constraint (optionally one involving this column). */
export function isUniqueViolation(e: unknown, column?: string): boolean {
  const err = e as { code?: string; meta?: unknown; message?: string };
  if (err?.code !== "P2002") return false;
  if (!column) return true;
  const haystack = `${JSON.stringify(err.meta ?? {})} ${err.message ?? ""}`;
  return haystack.includes(column);
}
