import { describe, it, expect, vi } from "vitest";
import { attribute, rollup } from "@/lib/attribution";
import { mixBy, billingPeriods } from "@/lib/boq";

vi.mock("server-only", () => ({}));

describe("line-level attribution", () => {
  const deal = { amount: 1_000_000, businessUnit: "IT Infrastructure", category: "Server", oem: "Dell" };

  it("splits a multi-OEM deal by line value", () => {
    const slices = attribute(deal, [
      { quantity: 2, unitPrice: 300_000, billingFrequency: "ONE_TIME", termMonths: null, businessUnit: "IT Infrastructure", category: "Server", oem: "Dell", product: "DELL-SRV-01" },
      { quantity: 1, unitPrice: 100_000, billingFrequency: "ONE_TIME", termMonths: null, businessUnit: "IT Infrastructure", category: "Licence", oem: "VMware", product: "VMW-VLC-01" },
      { quantity: 10, unitPrice: 30_000, billingFrequency: "ONE_TIME", termMonths: null, businessUnit: "Services", category: "Professional Services", oem: "Progression", product: "PRG-PSV-01" },
    ]);
    const byOem = Object.fromEntries(rollup(slices, "oem").map((r) => [r.key, Math.round(r.amount)]));
    expect(byOem).toEqual({ Dell: 600_000, Progression: 300_000, VMware: 100_000 });
    const byBu = Object.fromEntries(rollup(slices, "businessUnit").map((r) => [r.key, Math.round(r.amount)]));
    expect(byBu).toEqual({ "IT Infrastructure": 700_000, Services: 300_000 });
  });

  it("uses list price for unpriced lines and the header when there are no lines", () => {
    const est = attribute(deal, [
      { quantity: 1, unitPrice: null, listPrice: 400, billingFrequency: "ONE_TIME", termMonths: null, businessUnit: "Cloud", category: "Colo", oem: "Progression", product: null },
      { quantity: 1, unitPrice: 600, billingFrequency: "ONE_TIME", termMonths: null, businessUnit: "Services", category: "NOC", oem: "Progression", product: null },
    ]);
    expect(est.map((x) => Math.round(x.share * 100))).toEqual([40, 60]);
    expect(attribute(deal, [])).toEqual([{ businessUnit: "IT Infrastructure", category: "Server", oem: "Dell", product: null, amount: 1_000_000, share: 1 }]);
  });

  it("weights recurring lines over their full term", () => {
    const slices = attribute({ ...deal, amount: 100 }, [
      { quantity: 1, unitPrice: 10, billingFrequency: "MONTHLY", termMonths: 12, businessUnit: "Cloud", category: "Hosting", oem: "Neon Cloud", product: null },
      { quantity: 1, unitPrice: 120, billingFrequency: "ONE_TIME", termMonths: null, businessUnit: "Services", category: "Professional Services", oem: "Progression", product: null },
    ]);
    expect(slices.map((s) => s.amount)).toEqual([50, 50]);
  });

  it("computes mix shares and billing periods", () => {
    const mix = mixBy(
      [
        { quantity: 1, unitCost: null, unitPrice: 75, billingFrequency: "ONE_TIME" as const, termMonths: null, oem: "A" },
        { quantity: 1, unitCost: null, unitPrice: 25, billingFrequency: "ONE_TIME" as const, termMonths: null, oem: "B" },
      ],
      (l) => l.oem,
    );
    expect(mix.map((m) => [m.key, m.share])).toEqual([["A", 0.75], ["B", 0.25]]);
    expect(billingPeriods({ billingFrequency: "QUARTERLY", termMonths: 13 })).toBe(5);
  });
});

describe("billing readiness and contract", () => {
  it("blocks closing as won when lines are missing, unpriced or lack HSN/SAC", async () => {
    const { billingReadinessIssues } = await import("@/server/domain/billing");
    const tx = (lines: unknown[]) => ({ opportunityLineItem: { findMany: async () => lines } }) as never;
    expect(await billingReadinessIssues(tx([]), "o1")).toHaveLength(1);
    const issues = await billingReadinessIssues(
      tx([
        { lineNo: 1, unitPrice: 100, hsnSac: null, product: { hsnSac: "84715000" } },
        { lineNo: 2, unitPrice: null, hsnSac: "998313", product: null },
        { lineNo: 3, unitPrice: 50, hsnSac: null, product: null },
      ]),
      "o1",
    );
    expect(issues).toEqual(["Set a sell price on line 2.", "Add HSN/SAC on line 3 (pick a catalogue product or enter it)."]);
    expect(await billingReadinessIssues(tx([{ lineNo: 1, unitPrice: 1, hsnSac: "998316", product: null }]), "o1")).toEqual([]);
  });

  it("maps lines to the versioned BillableLine contract", async () => {
    const { toBillableLines, BILLABLE_LINE_SCHEMA_VERSION } = await import("@/server/domain/billing");
    const opp = {
      id: "o1", code: "OPP-FY27-0001", name: "Zenith - SOC", poNumber: "PO/1", poDate: new Date("2026-10-01T00:00:00Z"),
      account: { id: "a1", code: "ACC-0001", name: "Zenith", gstin: "27AAACK4019X1Z2", pan: "AAACK4019X", addressLine: "BKC", city: "Mumbai", state: "Maharashtra", pincode: "400051" },
      salesOwner: { id: "u1", name: "Rakesh Pawar", email: "r@p.com" },
      lineItems: [{
        id: "l1", lineNo: 1, productId: "p1", productCode: "PRG-SOC-01", productName: "Managed SOC", partNumber: "PRG-SOC-01",
        description: "Managed SOC", hsnSac: "998316", gstRatePct: 18, quantity: 1, unit: "Month", billingFrequency: "MONTHLY",
        termMonths: 36, billingStartDate: new Date("2026-10-01T00:00:00Z"), unitPrice: 400_000, billingStatus: "READY", externalRef: null,
        businessUnit: { name: "Cybersecurity" }, category: { name: "SOC" }, oem: { name: "Progression" }, product: null,
      }],
    };
    const tx = { opportunity: { findUniqueOrThrow: async () => opp } } as never;
    const [line] = await toBillableLines(tx, "o1");
    expect(line).toMatchObject({
      schemaVersion: BILLABLE_LINE_SCHEMA_VERSION, opportunityCode: "OPP-FY27-0001", businessUnit: "Cybersecurity", oem: "Progression",
      hsnSac: "998316", gstRatePct: 18, unitPrice: 400_000, taxableValue: 14_400_000, currency: "INR", billingStatus: "READY",
      billing: { frequency: "MONTHLY", termMonths: 36, periods: 36, amountPerPeriod: 400_000, startDate: "2026-10-01T00:00:00.000Z" },
      customer: { gstin: "27AAACK4019X1Z2", billingAddress: { city: "Mumbai" } },
      purchaseOrder: { number: "PO/1" },
    });
  });
});
