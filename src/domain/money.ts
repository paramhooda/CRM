// Money helpers. Amounts travel as strings or numbers; arithmetic goes through decimal.js so that
// quantity × price never picks up floating-point noise.
import Decimal from "decimal.js";

export type Money = string | number | Decimal | { toString(): string } | null | undefined;

export function dec(v: Money): Decimal | null {
  if (v === null || v === undefined || v === "") return null;
  try {
    const d = new Decimal(typeof v === "object" && !(v instanceof Decimal) ? v.toString() : (v as string | number | Decimal));
    return d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

export const round2 = (d: Decimal): Decimal => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export const toNumber = (v: Money, fallback = 0): number => dec(v)?.toNumber() ?? fallback;

/** Lakh/crore formatting used everywhere amounts are displayed: ₹950, ₹85K, ₹48.6 L, ₹1.25 Cr. */
export function inr(v: Money, opts: { precise?: boolean } = {}): string {
  const d = dec(v);
  if (!d) return "—";
  if (opts.precise) return `₹${d.toNumber().toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const n = d.toNumber();
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const fmt = (x: number, digits: number) => {
    const s = x.toFixed(digits);
    return s.endsWith(".0") || s.endsWith(".00") ? String(Math.round(x * 10) / 10).replace(/\.0$/, "") : s.replace(/\.?0+$/, "");
  };
  if (abs >= 1e7) return `${sign}₹${fmt(abs / 1e7, 2)} Cr`;
  if (abs >= 1e5) return `${sign}₹${fmt(abs / 1e5, 1)} L`;
  if (abs >= 1e3) return `${sign}₹${fmt(abs / 1e3, abs >= 1e4 ? 0 : 1)}K`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

export function pct(v: Money, digits = 1): string {
  const d = dec(v);
  return d ? `${d.toFixed(digits)}%` : "—";
}
