// Formatting helpers. Currency is INR using the Indian lakh/crore system; display timezone is IST.

const TZ = "Asia/Kolkata";

export function toNumber(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v) || 0;
  if (typeof v === "object" && v !== null && "toNumber" in v) return (v as { toNumber(): number }).toNumber();
  return Number(v) || 0;
}

/** Compact INR: ₹1.25 Cr, ₹48.6 L, ₹85K, ₹950 */
export function inr(value: unknown, opts: { precise?: boolean } = {}): string {
  const n = toNumber(value);
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (opts.precise) return sign + "₹" + a.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  if (a >= 1e7) return `${sign}₹${trim(a / 1e7, a >= 1e9 ? 0 : 2)} Cr`;
  if (a >= 1e5) return `${sign}₹${trim(a / 1e5, a >= 1e6 ? 1 : 2)} L`;
  if (a >= 1e3) return `${sign}₹${trim(a / 1e3, 1)}K`;
  return `${sign}₹${Math.round(a)}`;
}

/** Axis-friendly short INR without symbol clutter: 1.2Cr, 45L */
export function inrAxis(value: number): string {
  const a = Math.abs(value);
  if (a >= 1e7) return `${trim(value / 1e7, 1)}Cr`;
  if (a >= 1e5) return `${trim(value / 1e5, 0)}L`;
  if (a >= 1e3) return `${trim(value / 1e3, 0)}K`;
  return String(value);
}

function trim(n: number, digits: number) {
  return Number(n.toFixed(digits)).toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function pct(value: unknown, digits = 0): string {
  const n = toNumber(value);
  return `${n.toFixed(digits)}%`;
}

export function num(value: unknown): string {
  return toNumber(value).toLocaleString("en-IN");
}

export function fmtDate(d: Date | string | null | undefined, style: "short" | "medium" = "medium"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    ...(style === "medium" ? { year: "numeric" } : {}),
  });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-IN", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Date as yyyy-mm-dd in IST, for <input type="date"> values */
export function isoDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

export function relativeDays(d: Date | string | null | undefined, now = new Date()): string {
  if (!d) return "never";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = daysBetween(date, now);
  if (diff === 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff === -1) return "tomorrow";
  if (diff > 0) return diff < 60 ? `${diff}d ago` : `${Math.round(diff / 30)}mo ago`;
  return -diff < 60 ? `in ${-diff}d` : `in ${Math.round(-diff / 30)}mo`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}
