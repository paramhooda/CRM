import { describe, it, expect } from "vitest";
import { allowedCostSources, costExpired, costHeading, defaultCostSource, lineCostStatus, needsInternalCost, needsPurchaseCost, resolveCostSource } from "@/lib/costing";

const DAY = 86_400_000;
const now = new Date("2026-10-26T06:00:00Z");
const thirdParty = { ownBrand: false, standardCost: 900, isProduct: true, rateCard: false };
const rateCarded = { ownBrand: true, standardCost: 900, isProduct: true, rateCard: true };
const ownCustom = { ownBrand: true, standardCost: null, isProduct: false, rateCard: true };
/** Own-brand catalogue item with a standard cost, in a category without a rate card (e.g. professional services) */
const ownOffCard = { ownBrand: true, standardCost: 900, isProduct: true, rateCard: false };

describe("cost source", () => {
  it("third-party lines are priced by purchase; own brand uses the rate card when the catalogue has a cost, else presales", () => {
    expect(defaultCostSource(thirdParty)).toBe("PURCHASE");
    expect(defaultCostSource(rateCarded)).toBe("RATE_CARD");
    expect(defaultCostSource(ownCustom)).toBe("PRESALES");
    expect(defaultCostSource({ ownBrand: true, standardCost: null, isProduct: true, rateCard: true })).toBe("PRESALES");
  });

  it("the rate card applies only in its categories (Cloud, NOC, SOC); other own-brand lines are costed by presales", () => {
    expect(defaultCostSource(ownOffCard)).toBe("PRESALES");
    expect(allowedCostSources(ownOffCard)).toEqual(["PRESALES", "PURCHASE"]);
    expect(resolveCostSource("RATE_CARD", ownOffCard)).toBe("PRESALES");
  });

  it("the cost column says purchase price only for purchase lines", () => {
    expect(costHeading(["PURCHASE"])).toBe("Purchase price");
    expect(costHeading(["RATE_CARD", "PRESALES"])).toBe("Internal cost");
    expect(costHeading(["PURCHASE", "RATE_CARD"])).toBe("Purchase price / internal cost");
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
    expect(lineCostStatus({ ...base, source: "RATE_CARD", specChanged: true })).toMatchObject({ status: "QUOTED", repriced: false });
  });

  it("sales changing a priced purchase line's quantity sends it back for re-pricing", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE", specChanged: true })).toMatchObject({ status: "PENDING", repriced: true });
  });

  it("purchase confirms a cost by saving it, but a new specification needs a new price", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE", prevStatus: "PENDING", canCost: true, costChanged: true })).toMatchObject({ status: "QUOTED", repriced: false });
    expect(lineCostStatus({ ...base, source: "PURCHASE", canCost: true, specChanged: true })).toMatchObject({ status: "PENDING", repriced: true });
  });

  it("presales owns the cost of presales lines, so their own changes stay costed", () => {
    expect(lineCostStatus({ ...base, source: "PRESALES", canCost: true, specChanged: true })).toMatchObject({ status: "QUOTED", repriced: false });
    expect(lineCostStatus({ ...base, source: "PRESALES", canCost: true, hasCost: false })).toMatchObject({ status: "PENDING", repriced: false });
  });

  it("moving a line to another source makes it wait for that source; new lines wait too", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE", sourceChanged: true })).toMatchObject({ status: "PENDING", repriced: false });
    expect(lineCostStatus({ ...base, source: "PRESALES", prevStatus: null })).toMatchObject({ status: "PENDING", repriced: false });
  });

  it("untouched lines keep their status", () => {
    expect(lineCostStatus({ ...base, source: "PURCHASE" })).toMatchObject({ status: "QUOTED", repriced: false });
    expect(lineCostStatus({ ...base, source: "PURCHASE", prevStatus: "PENDING" })).toMatchObject({ status: "PENDING", repriced: false });
  });
});

describe("changed lines need a new or confirmed cost from purchase", () => {
  const base = { source: "PURCHASE", prevStatus: "PENDING", sourceChanged: false, specChanged: false, canCost: true, costChanged: false, hasCost: true } as const;
  it("a stale line saved by purchase without a new cost stays pending (no silent confirmation)", () => {
    expect(lineCostStatus({ ...base, stale: true })).toEqual({ status: "PENDING", repriced: false, stale: true });
  });
  it("entering a new cost or validity, or ticking Price unchanged, makes it current", () => {
    expect(lineCostStatus({ ...base, stale: true, costChanged: true })).toEqual({ status: "QUOTED", repriced: false, stale: false });
    expect(lineCostStatus({ ...base, stale: true, confirmed: true })).toEqual({ status: "QUOTED", repriced: false, stale: false });
  });
  it("re-validation lines (pending but not changed) are confirmed by saving, as before", () => {
    expect(lineCostStatus({ ...base, stale: false })).toEqual({ status: "QUOTED", repriced: false, stale: false });
  });
  it("sales changing a priced purchase line flags it stale", () => {
    expect(lineCostStatus({ ...base, prevStatus: "QUOTED", canCost: false, specChanged: true })).toEqual({ status: "PENDING", repriced: true, stale: true });
  });
});

