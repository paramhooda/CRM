import { describe, expect, it } from "vitest";
import { boqExtractSchema, extractPrompt, matchBoqLines, matchPrices, priceExtractSchema } from "@/domain/ai-extract";

const ref = {
  products: [{ id: "p1", code: "PRD-0001", name: "HPE 2U Rack Server, 2x Xeon Gold, 512 GB", unit: "Nos", revenueModel: "ONE_TIME" as const, defaultTermMonths: null, businessUnitId: "bu1", subBusinessUnitId: "s1", oemId: "o1" }, { id: "p2", code: "PRD-0002", name: "NOC monitoring, per device", unit: "Devices", revenueModel: "ARR" as const, defaultTermMonths: 12, businessUnitId: "bu2", subBusinessUnitId: "s2", oemId: "o2" }],
  businessUnits: [{ id: "bu1", name: "IT Infrastructure" }, { id: "bu2", name: "Services" }],
  subBusinessUnits: [{ id: "s1", name: "Server", businessUnitId: "bu1" }, { id: "s2", name: "NOC", businessUnitId: "bu2" }, { id: "s3", name: "Networking", businessUnitId: "bu1" }],
  oems: [{ id: "o1", name: "HPE", isOwnIp: false }, { id: "o2", name: "Progression", isOwnIp: true }, { id: "o3", name: "Cisco", isOwnIp: false }],
};

describe("reading a BOQ document", () => {
  it("matches catalogue codes and names, then OEM, BU and Sub BU by name, and names what is left to fix", () => {
    const raw = boqExtractSchema.parse({ lines: [
      { description: "HPE DL380 server", productCode: "prd-0001", quantity: "2" },
      { description: "NOC monitoring, per device", quantity: 25, recurring: true, termMonths: 36 },
      { description: "48-port access switch", oem: "cisco", businessUnit: "IT Infrastructure", subBusinessUnit: "networking", quantity: "4", unit: "Nos" },
      { description: "Consultant days", oem: "Progression", quantity: "abc", unitPurchaseCost: "18,000" },
      { description: "Mystery box" },
    ] });
    const lines = matchBoqLines(raw, ref);
    expect(lines[0]).toMatchObject({ productId: "p1", oemId: "o1", businessUnitId: "bu1", subBusinessUnitId: "s1", quantity: "2", unit: "Nos", revenueModel: "ONE_TIME", issues: [] });
    expect(lines[1]).toMatchObject({ productId: "p2", revenueModel: "ARR", termMonths: "36", unit: "Devices", quantity: "25", issues: [] });
    expect(lines[2]).toMatchObject({ productId: null, oemId: "o3", businessUnitId: "bu1", subBusinessUnitId: "s3", issues: [] });
    expect(lines[3]).toMatchObject({ oemId: "o2", quantity: "1", unitPurchaseCost: "18000" });
    expect(lines[3]!.issues).toEqual(["Pick the business unit", "Pick the Sub BU", "Quantity read as 1; check it"]);
    expect(lines[4]!.issues).toEqual(["Pick the OEM", "Pick the business unit", "Pick the Sub BU"]);
  });

  it("a Sub BU from another business unit is dropped; own-IP costs are kept, third-party costs are not", () => {
    const raw = boqExtractSchema.parse({ lines: [{ description: "Switch", oem: "Cisco", businessUnit: "Services", subBusinessUnit: "Networking", unitPurchaseCost: "5000" }] });
    const [l] = matchBoqLines(raw, ref);
    expect(l).toMatchObject({ businessUnitId: "bu2", subBusinessUnitId: null, unitPurchaseCost: "" });
  });
});

describe("reading vendor quotes", () => {
  const lines = [{ id: "l1", lineNo: 1, description: "HPE 2U Rack Server" }, { id: "l2", lineNo: 2, description: "Lenovo Business laptop, Core i5" }];
  it("matches by line number or description, keeps the lowest of several vendors, and lists what did not match", () => {
    const raw = priceExtractSchema.parse({ costs: [
      { lineNo: 1, unitPurchaseCost: "9,50,000", vendor: "Ingram" },
      { lineNo: 1, unitPurchaseCost: 930000, vendor: "Redington", note: "valid 30 days" },
      { description: "Lenovo business laptop core i5", unitPurchaseCost: "58000.50", vendor: "Ingram" },
      { description: "Rack PDU", unitPurchaseCost: "12000" },
      { lineNo: 2, unitPurchaseCost: "free" },
    ] });
    const r = matchPrices(raw, lines);
    expect(r.costs).toEqual([{ lineId: "l1", lineNo: 1, unitPurchaseCost: "930000", vendor: "Redington", note: "valid 30 days" }, { lineId: "l2", lineNo: 2, unitPurchaseCost: "58000.50", vendor: "Ingram", note: null }]);
    expect(r.unmatched).toEqual(["Rack PDU: no matching line on the deal", 'line 2: cost "free" is not an amount']);
  });
  it("the prompts carry the catalogue and the deal lines", () => {
    const p = extractPrompt("boq", { products: [{ code: "PRD-0001", name: "Server", oem: "HPE", subBusinessUnit: "Server", unit: "Nos" }], oems: ["HPE"], businessUnits: [{ name: "IT Infrastructure", subs: ["Server"] }] });
    expect(p).toContain("PRD-0001 | Server | HPE | Server | Nos");
    expect(p).toMatch(/Never invent items/);
    const q = extractPrompt("prices", { products: [], oems: [], businessUnits: [], lines: [{ lineNo: 1, description: "Server", quantity: "2", unit: "Nos" }] });
    expect(q).toContain("1 | Server | 2 Nos");
    expect(q).toMatch(/lowest/);
  });
});
