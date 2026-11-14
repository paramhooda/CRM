// The quotation: the deal's priced lines as the customer sees them, without tax ("GST extra as applicable"),
// in plain INR figures that print with the PDF's built-in fonts.
import { dec, type Money } from "./money";

export type QuoteLineIn = { lineNo: number; description: string; hsnSac: string | null; quantity: Money; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: number | null; unitSalesPrice: Money };
export type QuoteLine = { lineNo: number; description: string; hsnSac: string; quantity: string; unit: string; model: string; unitPrice: string; amount: string };

/** 12,34,567.00 in the Indian grouping, no symbol (Helvetica has no rupee sign). */
export function inrPlain(v: Money): string {
  const d = dec(v);
  if (!d) return "0.00";
  const [whole, frac = "00"] = d.toFixed(2).split(".");
  const neg = whole!.startsWith("-");
  const digits = neg ? whole!.slice(1) : whole!;
  const last3 = digits.slice(-3);
  const rest = digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${rest ? `${rest},` : ""}${last3}.${frac}`;
}

/** One quote line per deal line. Recurring lines are priced per year and the amount covers the term. */
export function quoteLines(lines: QuoteLineIn[]): QuoteLine[] {
  return lines.map((l) => {
    const qty = dec(l.quantity) ?? dec(0)!;
    const price = dec(l.unitSalesPrice) ?? dec(0)!;
    const term = l.revenueModel === "ARR" ? (l.termMonths ?? 12) : null;
    const amount = term ? qty.mul(price).mul(term).div(12) : qty.mul(price);
    return {
      lineNo: l.lineNo,
      description: l.description,
      hsnSac: l.hsnSac ?? "",
      quantity: qty.toString(),
      unit: l.unit,
      model: term ? `Per year, ${term} month${term === 1 ? "" : "s"}` : "One-time",
      unitPrice: amount.isZero() && price.isZero() ? "0.00" : price.toFixed(2),
      amount: amount.toFixed(2),
    };
  });
}

export function quoteSubtotal(lines: QuoteLine[]): string {
  return lines.reduce((a, l) => a.plus(dec(l.amount)!), dec(0)!).toFixed(2);
}

/** The last valid day: `days` after the quote date, as yyyy-mm-dd. */
export function validUntil(from: Date, days: number): string {
  return new Date(from.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function quoteFileName(quoteNo: string, dealName: string): string {
  const slug = dealName.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").slice(0, 40);
  return `${quoteNo}${slug ? `-${slug}` : ""}.pdf`;
}
