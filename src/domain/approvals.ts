// Price approvals: which admin-defined rules apply to a deal, who approves in what order, and whether an existing
// approval still covers the deal's current prices.
import type { ApprovalState } from "./stages";
import { dec, type Money } from "./money";

export type Role = "ADMIN" | "SALES_HEAD" | "SALES" | "PRESALES" | "PURCHASE";

export type RuleStep = { stepNo: number; approverKind: "OWNER_MANAGER" | "ROLE" | "USER"; approverRole: Role | null; approverUserId: string | null };
export type Rule = {
  id: string;
  name: string;
  isActive: boolean;
  gmBelowPct: Money;
  dealValueAtLeast: Money;
  businessUnitId: string | null;
  steps: RuleStep[];
};

export type DealForRules = { gmPct: Money; dealValue: Money; businessUnitIds: string[] };

/** The rules whose every condition holds, with the conditions in words. A rule with no condition never applies. */
export function matchRules(rules: Rule[], d: DealForRules): { rule: Rule; reasons: string[] }[] {
  const gm = dec(d.gmPct);
  const value = dec(d.dealValue);
  const out: { rule: Rule; reasons: string[] }[] = [];
  for (const rule of rules) {
    if (!rule.isActive) continue;
    const reasons: string[] = [];
    let conditions = 0, ok = true;
    const gmBelow = dec(rule.gmBelowPct);
    if (gmBelow) {
      conditions++;
      if (gm && gm.lt(gmBelow)) reasons.push(`GM ${gm.toFixed(1)}% is below ${gmBelow.toFixed(1)}%`);
      else ok = false;
    }
    const atLeast = dec(rule.dealValueAtLeast);
    if (atLeast) {
      conditions++;
      if (value && value.gte(atLeast)) reasons.push(`Deal value ${value.toFixed(0)} is at or above ${atLeast.toFixed(0)}`);
      else ok = false;
    }
    if (rule.businessUnitId) {
      conditions++;
      if (d.businessUnitIds.includes(rule.businessUnitId)) reasons.push("Business unit matches");
      else ok = false;
    }
    if (conditions > 0 && ok) out.push({ rule, reasons });
  }
  return out;
}

export type ResolvedStep = { stepNo: number; label: string; approverUserIds: string[]; autoPassed: boolean };

export type ResolveContext = {
  requesterId: string;
  ownerManagerId: string | null;
  usersByRole: Partial<Record<Role, string[]>>;
  adminIds: string[];
  nameOf: (id: string) => string;
};

/**
 * Turns the matched rules' steps into one chain: rule order, each approver once. A step whose only approver is the
 * requester passes on its own; a step with nobody available goes to the admins.
 */
export function resolveSteps(matched: { rule: Rule }[], ctx: ResolveContext): ResolvedStep[] {
  const seen = new Set<string>();
  const out: ResolvedStep[] = [];
  for (const { rule } of matched) {
    for (const step of [...rule.steps].sort((a, b) => a.stepNo - b.stepNo)) {
      let ids: string[] = [];
      let label = "";
      if (step.approverKind === "OWNER_MANAGER") {
        ids = ctx.ownerManagerId ? [ctx.ownerManagerId] : [];
        label = ctx.ownerManagerId ? `${ctx.nameOf(ctx.ownerManagerId)} (manager)` : "Owner's manager";
      } else if (step.approverKind === "ROLE" && step.approverRole) {
        ids = ctx.usersByRole[step.approverRole] ?? [];
        label = step.approverRole === "ADMIN" ? "Any Admin" : step.approverRole === "SALES_HEAD" ? "Any Sales Head" : `Any ${step.approverRole.toLowerCase()}`;
      } else if (step.approverKind === "USER" && step.approverUserId) {
        ids = [step.approverUserId];
        label = ctx.nameOf(step.approverUserId);
      }
      const key = `${step.approverKind}:${step.approverRole ?? ""}:${step.approverUserId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const withoutRequester = ids.filter((id) => id !== ctx.requesterId);
      if (ids.length > 0 && withoutRequester.length === 0) {
        out.push({ stepNo: out.length + 1, label, approverUserIds: [], autoPassed: true });
        continue;
      }
      const finalIds = withoutRequester.length ? withoutRequester : ctx.adminIds.filter((id) => id !== ctx.requesterId);
      out.push({ stepNo: out.length + 1, label: withoutRequester.length ? label : `${label} (no one available: Admin)`, approverUserIds: finalIds, autoPassed: finalIds.length === 0 });
    }
  }
  return out;
}

/** FNV-1a 64-bit as hex: short, stable, pure. */
function fnv1a(s: string): string {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

export type FingerprintLine = { id: string; quantity: Money; unitSalesPrice: Money; unitPurchaseCost: Money; revenueModel: string; termMonths: number | null | undefined };

/** A hash of everything on the lines that affects the price. An approval holds only while it matches. */
export function priceFingerprint(lines: FingerprintLine[]): string {
  const parts = [...lines]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((l) => [l.id, dec(l.quantity)?.toFixed(2) ?? "", dec(l.unitSalesPrice)?.toFixed(2) ?? "", dec(l.unitPurchaseCost)?.toFixed(2) ?? "", l.revenueModel, l.termMonths ?? ""].join("|"));
  return fnv1a(parts.join("\n"));
}

export type ApprovalRecord = { status: "PENDING" | "APPROVED" | "REJECTED" | "SUPERSEDED"; priceFingerprint: string };

/** Where the deal stands on approval. `latest` is the most recent approval request, if any. */
export function approvalState(opts: { rulesMatch: boolean; fingerprint: string; latest: ApprovalRecord | null }): ApprovalState {
  if (!opts.rulesMatch) return "NONE_NEEDED";
  const a = opts.latest;
  if (!a || a.status === "SUPERSEDED") return "NEEDED";
  const same = a.priceFingerprint === opts.fingerprint;
  if (a.status === "PENDING") return same ? "PENDING" : "STALE";
  if (a.status === "APPROVED") return same ? "APPROVED" : "STALE";
  return same ? "REJECTED" : "NEEDED";
}
