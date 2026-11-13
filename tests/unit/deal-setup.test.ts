import { describe, it, expect } from "vitest";
import { dealTypesFor, dealTypeFor, suggestPresales, needsBidDate, dealRegOems } from "@/lib/deal-setup";
import { draftLineErrors, typicalBilling } from "@/lib/deal-setup";

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

describe("new deal lines", () => {
  const est = { kind: "estimate" as const, buId: "b", categoryId: "c", oemId: "o" };
  it("an estimate may leave its value for later; what is sold must be said", () => {
    expect(draftLineErrors([{ ...est, value: null }, { ...est, value: 0 }])).toEqual({});
    expect(draftLineErrors([{ ...est, categoryId: "" }, { ...est, buId: "", categoryId: "", oemId: "" }], [0, 2])).toEqual({
      "lines.0.categoryId": "Choose a category",
      "lines.2.buId": "Choose a business unit",
    });
    expect(draftLineErrors([{ ...est, oemId: "" }])).toEqual({ "lines.0.oemId": "Choose an OEM, or To be decided" });
  });
  it("negative or absurd amounts and products without a pick are refused", () => {
    expect(draftLineErrors([{ ...est, value: -5 }])).toEqual({ "lines.0.value": "The value can't be negative" });
    expect(draftLineErrors([{ ...est, value: 1e12 }])).toEqual({ "lines.0.value": "That value is too large" });
    expect(draftLineErrors([{ kind: "product", productId: "" }, { kind: "product", productId: "p", unitPrice: -1 }])).toEqual({
      "lines.0.productId": "Pick a product",
      "lines.1.unitPrice": "The price can't be negative",
    });
  });
  it("billing defaults to recurring for categories whose catalogue mostly recurs", () => {
    const products = [
      { categoryId: "hosting", billingFrequency: "MONTHLY" }, { categoryId: "hosting", billingFrequency: "MONTHLY" }, { categoryId: "hosting", billingFrequency: "ONE_TIME" },
      { categoryId: "server", billingFrequency: "ONE_TIME" },
    ];
    expect(typicalBilling("hosting", products)).toBe("RECURRING");
    expect(typicalBilling("server", products)).toBe("ONE_TIME");
    expect(typicalBilling("unknown", products)).toBe("ONE_TIME");
  });
});
