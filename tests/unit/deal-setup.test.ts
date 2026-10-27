import { describe, it, expect } from "vitest";
import { dealTypesFor, dealTypeFor, suggestPresales, needsBidDate, dealRegOems } from "@/lib/deal-setup";

describe("deal setup", () => {
  it("deal type follows the account type", () => {
    expect(dealTypesFor("NEW_LOGO")).toEqual(["NEW_BUSINESS"]);
    expect(dealTypesFor("EXISTING")).toEqual(["UPSELL", "CROSS_SELL", "RENEWAL"]);
    expect(dealTypeFor("NEW_LOGO", "RENEWAL")).toBe("NEW_BUSINESS");
    expect(dealTypeFor("EXISTING", "NEW_BUSINESS")).toBe("UPSELL");
    expect(dealTypeFor("EXISTING", "RENEWAL")).toBe("RENEWAL");
  });

  it("presales is suggested when any line is in a solution category", () => {
    const cats = [{ id: "server", needsPresales: true }, { id: "laptop", needsPresales: false }];
    expect(suggestPresales(["laptop"], cats)).toBe(false);
    expect(suggestPresales(["laptop", "server"], cats)).toBe(true);
    expect(suggestPresales([], cats)).toBe(false);
  });

  it("bid date only for RFP and tender; deal registration only for OEMs that run it", () => {
    expect(needsBidDate("RFP")).toBe(true);
    expect(needsBidDate("DIRECT")).toBe(false);
    const oems = [{ id: "dell", name: "Dell", dealRegistration: true }, { id: "prog", name: "Progression", dealRegistration: false }];
    expect(dealRegOems(["prog"], oems)).toEqual([]);
    expect(dealRegOems(["prog", "dell"], oems).map((o) => o.name)).toEqual(["Dell"]);
  });
});
