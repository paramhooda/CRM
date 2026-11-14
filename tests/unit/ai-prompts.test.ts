import { describe, expect, it } from "vitest";
import { buildPrompt, technicalOnly, type DealForPrompt } from "@/domain/ai-prompts";

const deal: DealForPrompt = {
  code: "OPP-FY27-0042", name: "DC refresh", account: "Shakti Steel", stage: "BOQ", owner: "Rakesh Pawar", presales: "Rakesh Yadav", description: "Two hosts and NOC", expectedCloseDate: "2026-12-20", daysInStage: 4,
  lines: [
    { lineNo: 1, description: "HPE 2U rack server", businessUnit: "IT Infrastructure", subBusinessUnit: "Server", oem: "HPE", quantity: "2", unit: "Nos", revenueModel: "ONE_TIME", termMonths: null, unitSalesPrice: "1200000", unitPurchaseCost: "987654" },
    { lineNo: 2, description: "NOC monitoring", businessUnit: "Services", subBusinessUnit: "NOC", oem: "Progression", quantity: "10", unit: "Devices", revenueModel: "ARR", termMonths: 12, unitSalesPrice: null, unitPurchaseCost: "4321" },
  ],
  documents: ["Customer RFP: rfp.pdf"], latestScope: "Size the hosts", latestBoqSummary: null, nextHeadline: "Waiting on presales (Rakesh Yadav): start the BOQ",
  history: [{ when: "2026-11-10", from: null, to: "Qualified", note: "Created" }, { when: "2026-11-12", from: "Qualified", to: "BOQ", note: null }],
  money: { value: "2400000", gmPct: "17.7", forecast: "UPSIDE", approvalState: "NONE_NEEDED" },
};

describe("ai prompts", () => {
  it("the scope and BOQ prompts carry the lines and documents but never a price, cost or margin", () => {
    for (const kind of ["scope", "boq_summary"] as const) {
      const p = buildPrompt(kind, deal);
      expect(p.user).toContain("HPE 2U rack server");
      expect(p.user).toContain("recurring, 12 months");
      expect(p.user).toContain("Customer RFP: rfp.pdf");
      expect(p.user).not.toMatch(/1200000|987654|4321|GM|margin|forecast/i);
      expect(p.system).toMatch(/never invent/);
    }
    expect(buildPrompt("boq_summary", deal).user).toContain("Scope asked for: Size the hosts");
    expect(technicalOnly(deal).money).toBeUndefined();
  });

  it("the brief carries the money, the next step and the history", () => {
    const p = buildPrompt("brief", deal);
    expect(p.user).toContain("Value 2400000; GM 17.7%; forecast UPSIDE");
    expect(p.user).toContain("cost 987654, price 1200000");
    expect(p.user).toContain("unpriced");
    expect(p.user).toContain("What's next: Waiting on presales");
    expect(p.user).toContain("2026-11-12: Qualified → BOQ");
    expect(p.maxTokens).toBeGreaterThan(buildPrompt("scope", deal).maxTokens);
  });

  it("a brief for a support role would carry no money even if asked", () => {
    const { money: _m, ...noMoney } = deal;
    expect(buildPrompt("brief", noMoney).user).not.toMatch(/Value|GM/);
  });
});
