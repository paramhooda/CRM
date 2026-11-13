// Display helpers shared by server and client components.
export { inr, pct } from "@/domain/money";

const IST = "Asia/Kolkata";

export function fmtDate(d: Date | string | null | undefined, style: "short" | "long" = "short"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: IST });
}

/** "in 3d", "today", "4d ago" for a date-only value. */
export function relativeDays(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.round((date.getTime() - today) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days}d` : `${-days}d ago`;
}

export const isoDay = (d: Date | string | null | undefined) => (d ? (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10)) : "");

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]!.toUpperCase())
    .join("");

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
