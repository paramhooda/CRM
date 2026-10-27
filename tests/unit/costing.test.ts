import { describe, it, expect } from "vitest";
import { allowedCostSources, costExpired, defaultCostSource, lineCostStatus, needsInternalCost, needsPurchaseCost, resolveCostSource } from "@/lib/costing";

const DAY = 86_400_000;
const now = new Date("2026-10-26T06:00:00Z");
const thirdParty = { ownBrand: false, standardCost: 900, isProduct: true };
const rateCarded = { ownBrand: true, standardCost: 900, isProduct: true };
const ownCustom = { ownBrand: true, standardCost: null, isProduct: false };

describe("cost source", () => {
  it("third-party lines are priced by purchase; own brand uses the rate card when the catalogue has a cost, else presales", () => {
    expect(defaultCostSource(thirdParty)).toBe("PURCHASE");
    expect(defaultCostSource(rateCarded)).toBe("RATE_CARD");
    expect(defaultCostSource(ownCustom)).toBe("PRESALES");
    expect(defaultCostSource({ ownBrand: true, standardCost: null, isProduct: true })).toBe("PRESALES");
  });

  it("internal costing is only for own brand; any own-brand line may go via purchase (subcontracting)", () => {
    expect(allowedCostSources(thirdParty)).toEqual(["PURCHASE"]);
    expect(allowedCostSources(rateCarded)).toEqual(["RATE_CARD", "PRESALES", "PURCHASE"]);
    expect(allowedCostSources(ownCustom)).toEqual(["PRESALES", "PURCHASE"]);
  });

  it("a source the line cannot use falls back to its default", () => {
    expect(resolveCostSource("PRESALES", thirdParty)).toBe("PURCHASE");
    expect(resolveCostSource("RATE_CARD", ownCustom)).toBe("PRESALES");
    expect(resolveCostSource("PURCHASE", rateCarded)).toBe("PURCHASE");
    expect(resolveCostSource(undefined, rateCarded)).toBe("RATE_CARD");
  });
});

describe("who still owes a cost", () => {
  const l = (p: Record<string, unknown>) => ({ isEstimate: false, costSource: "PURCHASE", pricingStatus: "QUOTED", unitCost: 100, costValidTill: null, ...p });
  it("splits purchase and internal lines; estimates owe nothing", () => {
    expect(needsPurchaseCost(l({ pricingStatus: "PENDING" }))).toBe(true);
    expect(needsInternalCost(l({ pricingStatus: "PENDING" }))).toBe(false);
    expect(needsInternalCost(l({ costSource: "PRESALES", unitCost: null }))).toBe(true);
    expect(needsPurchaseCost(l({ costSource: "PRESALES", unitCost: null }))).toBe(false);
    expect(needsPurchaseCost(l({ isEstimate: true, pricingStatus: "PENDING" }))).toBe(false);
  });

  it("only a priced purchase line can lapse, on its own supplier's date", () => {
    expect(costExpired(l({ costValidTill: new Date(now.getTime() - DAY) }), now)).toBe(true);
    expect(costExpired(l({ costValidTill: new Date(now.getTime() + DAY) }), now)).toBe(false);
    expect(costExpired(l({ costValidTill: null }), now)).toBe(false);
    expect(costExpired(l({ costSource: "RATE_CARD", costValidTill: new Date(now.getTime() - DAY) }), now)).toBe(false);
  });
});

describe("lineCostStatus", () => {
  const base = { prevStatus: "QUOTED", sourceChanged: false, specChanged: false, canCost: false, costChanged: false, hasCost: true } as const;

  it("rate card lines are always current", () => {
    expect(lineCostStatus({ ...base, source: "RATE_CARD", specChanged: true })).toEqual({ status: "QUOTED", repriced: false });
  });

  it("sales changing a priced purchase line's quantity sends it back for re-pricing", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE", specChanged: true })).toEqual({ status: "PENDING", repriced: true });
  });

  it("purchase confirms a cost by saving it, but a new specification needs a new price", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE", prevStatus: "PENDING", canCost: true, costChanged: true })).toEqual({ status: "QUOTED", repriced: false });
    expect(lineCostStatus({ ...base, source: "PURCHASE", canCost: true, specChanged: true })).toEqual({ status: "PENDING", repriced: true });
  });

  it("presales owns the cost of presales lines, so their own changes stay costed", () => {
    expect(lineCostStatus({ ...base, source: "PRESALES", canCost: true, specChanged: true })).toEqual({ status: "QUOTED", repriced: false });
    expect(lineCostStatus({ ...base, source: "PRESALES", canCost: true, hasCost: false })).toEqual({ status: "PENDING", repriced: false });
  });

  it("moving a line to another source makes it wait for that source; new lines wait too", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE", sourceChanged: true })).toEqual({ status: "PENDING", repriced: false });
    expect(lineCostStatus({ ...base, source: "PRESALES", prevStatus: null })).toEqual({ status: "PENDING", repriced: false });
  });

  it("untouched lines keep their status", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE" })).toEqual({ status: "QUOTED", repriced: false });
    expect(lineCostStatus({ ...base, source: "PURCHASE", prevStatus: "PENDING" })).toEqual({ status: "PENDING", repriced: false });
  });
});
