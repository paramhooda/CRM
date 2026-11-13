import { describe, expect, it } from "vitest";
import { approvalState, matchRules, priceFingerprint, resolveSteps, type Rule } from "@/domain/approvals";

const rule = (p: Partial<Rule>): Rule => ({ id: "r", name: "rule", isActive: true, gmBelowPct: null, dealValueAtLeast: null, businessUnitId: null, steps: [], ...p });

describe("approval rules", () => {
  it("every condition on a rule must hold; a rule with no condition never applies", () => {
    const low = rule({ id: "low", gmBelowPct: 12 });
    const big = rule({ id: "big", dealValueAtLeast: 10_000_000, businessUnitId: "cloud" });
    const empty = rule({ id: "empty" });
    expect(matchRules([low, big, empty], { gmPct: 10, dealValue: 20_000_000, businessUnitIds: ["cloud"] }).map((m) => m.rule.id)).toEqual(["low", "big"]);
    expect(matchRules([low, big], { gmPct: 15, dealValue: 20_000_000, businessUnitIds: ["iti"] })).toEqual([]);
    expect(matchRules([low], { gmPct: null, dealValue: 1, businessUnitIds: [] })).toEqual([]);
    expect(matchRules([rule({ gmBelowPct: 12, isActive: false })], { gmPct: 1, dealValue: 1, businessUnitIds: [] })).toEqual([]);
  });

  it("builds one chain in rule order, each approver once, skipping the requester and falling back to admins", () => {
    const r1 = rule({ id: "1", steps: [{ stepNo: 1, approverKind: "OWNER_MANAGER", approverRole: null, approverUserId: null }, { stepNo: 2, approverKind: "ROLE", approverRole: "SALES_HEAD", approverUserId: null }] });
    const r2 = rule({ id: "2", steps: [{ stepNo: 1, approverKind: "ROLE", approverRole: "SALES_HEAD", approverUserId: null }, { stepNo: 2, approverKind: "USER", approverRole: null, approverUserId: "cfo" }] });
    const ctx = { requesterId: "rep", ownerManagerId: "mgr", usersByRole: { SALES_HEAD: ["mgr", "head2"] }, adminIds: ["admin"], nameOf: (id: string) => id.toUpperCase() };
    const steps = resolveSteps([{ rule: r1 }, { rule: r2 }], ctx);
    expect(steps.map((s) => [s.label, s.approverUserIds, s.autoPassed])).toEqual([
      ["MGR (manager)", ["mgr"], false],
      ["Any Sales Head", ["mgr", "head2"], false],
      ["CFO", ["cfo"], false],
    ]);
    // The manager asking for approval of their own deal: their step passes on its own
    const own = resolveSteps([{ rule: r1 }], { ...ctx, requesterId: "mgr", ownerManagerId: "mgr", usersByRole: { SALES_HEAD: ["mgr"] } });
    expect(own.map((s) => s.autoPassed)).toEqual([true, true]);
    // Nobody with the role: admins decide
    const none = resolveSteps([{ rule: r2 }], { ...ctx, usersByRole: {} });
    expect(none[0]).toMatchObject({ approverUserIds: ["admin"], autoPassed: false });
    expect(none[0]!.label).toMatch(/Admin/);
  });

  it("fingerprint is stable across order and formatting, and changes with any price-affecting field", () => {
    const a = [{ id: "b", quantity: 2, unitSalesPrice: "10", unitPurchaseCost: 8, revenueModel: "ONE_TIME", termMonths: null }, { id: "a", quantity: "1.00", unitSalesPrice: 5, unitPurchaseCost: null, revenueModel: "ARR", termMonths: 12 }];
    const b = [a[1]!, { ...a[0]!, quantity: "2.0", unitSalesPrice: 10.0 }];
    expect(priceFingerprint(a)).toBe(priceFingerprint(b));
    expect(priceFingerprint([{ ...a[0]!, unitSalesPrice: 11 }, a[1]!])).not.toBe(priceFingerprint(a));
    expect(priceFingerprint([{ ...a[1]!, termMonths: 24 }, a[0]!])).not.toBe(priceFingerprint(a));
  });

  it("approval state", () => {
    expect(approvalState({ rulesMatch: false, fingerprint: "x", latest: { status: "PENDING", priceFingerprint: "x" } })).toBe("NONE_NEEDED");
    expect(approvalState({ rulesMatch: true, fingerprint: "x", latest: null })).toBe("NEEDED");
    expect(approvalState({ rulesMatch: true, fingerprint: "x", latest: { status: "PENDING", priceFingerprint: "x" } })).toBe("PENDING");
    expect(approvalState({ rulesMatch: true, fingerprint: "x", latest: { status: "APPROVED", priceFingerprint: "x" } })).toBe("APPROVED");
    expect(approvalState({ rulesMatch: true, fingerprint: "y", latest: { status: "APPROVED", priceFingerprint: "x" } })).toBe("STALE");
    expect(approvalState({ rulesMatch: true, fingerprint: "x", latest: { status: "REJECTED", priceFingerprint: "x" } })).toBe("REJECTED");
    expect(approvalState({ rulesMatch: true, fingerprint: "y", latest: { status: "REJECTED", priceFingerprint: "x" } })).toBe("NEEDED");
  });
});
