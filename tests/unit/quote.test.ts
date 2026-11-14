import { describe, expect, it } from "vitest";
import { inrPlain, quoteFileName, quoteLines, quoteSubtotal, validUntil } from "@/domain/quote";

describe("quotation", () => {
  it("prints INR in the Indian grouping with two decimals and no symbol", () => {
    expect(inrPlain("1234567.5")).toBe("12,34,567.50");
    expect(inrPlain(999)).toBe("999.00");
    expect(inrPlain("100000")).toBe("1,00,000.00");
    expect(inrPlain(null)).toBe("0.00");
    expect(inrPlain("-2500")).toBe("-2,500.00");
  });

  it("prices one-time lines by quantity and recurring lines per year over the term; the subtotal is exact", () => {
    const lines = quoteLines([
      { lineNo: 1, description: "Server", hsnSac: "8471", quantity: "2", unit: "Nos", revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: "1200000" },
      { lineNo: 2, description: "Compute pool", hsnSac: null, quantity: "1", unit: "Nos", revenueModel: "ARR", termMonths: 18, unitSalesPrice: "2000000" },
      { lineNo: 3, description: "Install", hsnSac: "9987", quantity: "10", unit: "Days", revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: "0.1" },
    ]);
    expect(lines[0]).toMatchObject({ model: "One-time", unitPrice: "1200000.00", amount: "2400000.00", hsnSac: "8471" });
    expect(lines[1]).toMatchObject({ model: "Per year, 18 months", amount: "3000000.00", hsnSac: "" });
    expect(lines[2]!.amount).toBe("1.00");
    expect(quoteSubtotal(lines)).toBe("5400001.00");
  });

  it("validity and file names", () => {
    expect(validUntil(new Date("2026-11-14T10:00:00Z"), 30)).toBe("2026-12-14");
    expect(quoteFileName("QT-FY27-0007", "DC refresh: phase 2 (Pune)")).toBe("QT-FY27-0007-DC-refresh-phase-2-Pune.pdf");
  });
});
