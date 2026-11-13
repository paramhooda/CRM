// Price approvals (pure, unit-tested). An admin defines rules: when a deal's prices need approval before the quote
// goes out (GM below a threshold, a rate card discount, a large deal, optionally only for some business units) and
// who approves, in order. Every condition set on a rule must hold; several rules give "or". The deal owner asks for
// approval; each step is approved by one person; nobody approves their own prices.

export type ApproverKindKey = "OWNER_MANAGER" | "ROLE" | "USER";
export type StepSpec = { kind: ApproverKindKey; role?: string | null; userId?: string | null };

export type RuleInput = {
  id: string;
  name: string;
  active: boolean;
  gmBelowPct: number | null;
  rateCardDiscount: boolean;
  minDealValue: number | null;
  businessUnitIds: string[];
  steps: StepSpec[];
};

/** What the rules look at, worked out from the deal's lines at their current (or proposed) prices */
export type DealPricing = {
  gmPct: number | null;
  value: number;
  businessUnitIds: string[];
  /** Line numbers of rate card items priced below their rate card price */
  rateCardDiscountLines: number[];
};

export const hasCondition = (r: Pick<RuleInput, "gmBelowPct" | "rateCardDiscount" | "minDealValue">) =>
  r.gmBelowPct !== null || r.rateCardDiscount || r.minDealValue !== null;

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

/** Rules that apply to this deal, each with why. */
export function matchRules(rules: RuleInput[], deal: DealPricing): { rule: RuleInput; reasons: string[] }[] {
  const out: { rule: RuleInput; reasons: string[] }[] = [];
  for (const rule of rules) {
    if (!rule.active || !hasCondition(rule)) continue;
    if (rule.businessUnitIds.length && !deal.businessUnitIds.some((b) => rule.businessUnitIds.includes(b))) continue;
    const reasons: string[] = [];
    if (rule.gmBelowPct !== null) {
      if (deal.gmPct === null || !(deal.gmPct < rule.gmBelowPct)) continue;
      reasons.push(`GM ${deal.gmPct.toFixed(1)}% is below ${rule.gmBelowPct}%`);
    }
    if (rule.rateCardDiscount) {
      if (!deal.rateCardDiscountLines.length) continue;
      const n = deal.rateCardDiscountLines;
      reasons.push(`Rate card discount on line${n.length > 1 ? "s" : ""} ${n.join(", ")}`);
    }
    if (rule.minDealValue !== null) {
      if (!(deal.value >= rule.minDealValue)) continue;
      reasons.push(`Deal value ${inr(deal.value)} is ${inr(rule.minDealValue)} or more`);
    }
    out.push({ rule, reasons });
  }
  return out;
}

/** Approver steps of the matching rules, in rule order, each approver once. */
export function mergeSteps(matched: { rule: RuleInput }[]): StepSpec[] {
  const seen = new Set<string>();
  const out: StepSpec[] = [];
  for (const { rule } of matched) {
    for (const s of rule.steps) {
      const key = `${s.kind}|${s.role ?? ""}|${s.userId ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out;
}

export type Person = { id: string; name: string };
export type ResolvedStep = {
  label: string;
  approverIds: string[];
  decision?: "APPROVED" | "REJECTED";
  decidedById?: string;
  decidedByName?: string;
  note?: string | null;
  decidedAt?: string;
  /** Passed without anyone acting: the requester was the only approver of this step */
  auto?: boolean;
};

const ROLE_LABEL: Record<string, string> = { SALES_HEAD: "Sales Head", ADMIN: "Admin" };

/**
 * Who approves each step. The requester never approves their own prices: a step whose only approver is the
 * requester passes on its own (recorded). A step nobody can approve (no manager, a person who left) goes to the admins.
 */
export function resolveSteps(
  specs: StepSpec[],
  ctx: { requesterId: string; ownerManager: Person | null; byRole: Record<string, Person[]>; byId: Record<string, Person>; admins: Person[] },
  now = new Date(),
): ResolvedStep[] {
  return specs.map((s) => {
    let label: string;
    let people: Person[];
    if (s.kind === "OWNER_MANAGER") {
      people = ctx.ownerManager ? [ctx.ownerManager] : [];
      label = ctx.ownerManager ? `${ctx.ownerManager.name} (owner's manager)` : "Owner's manager";
    } else if (s.kind === "ROLE") {
      people = ctx.byRole[s.role ?? ""] ?? [];
      label = `Any ${ROLE_LABEL[s.role ?? ""] ?? s.role}`;
    } else {
      const p = s.userId ? ctx.byId[s.userId] : undefined;
      people = p ? [p] : [];
      label = p?.name ?? "A person who has left";
    }
    if (!people.length) {
      people = ctx.admins;
      label = `${label} · no one available, so an Admin`;
    }
    const others = people.filter((p) => p.id !== ctx.requesterId);
    if (!others.length) {
      return { label, approverIds: people.map((p) => p.id), decision: "APPROVED", decidedById: ctx.requesterId, decidedByName: "Passed: own prices", decidedAt: now.toISOString(), auto: true };
    }
    return { label, approverIds: others.map((p) => p.id) };
  });
}

/** The first step still waiting, or -1 when every step is decided. */
export const nextOpenStep = (steps: ResolvedStep[]) => steps.findIndex((s) => !s.decision);

/** Rate card items priced below their rate card (list) price. */
export function rateCardDiscountLines(lines: { lineNo: number; costSource: string; unitPrice: number | null; listPrice: number | null }[]): number[] {
  return lines
    .filter((l) => l.costSource === "RATE_CARD" && l.listPrice !== null && l.unitPrice !== null && l.unitPrice < l.listPrice - 0.005)
    .map((l) => l.lineNo);
}

/** What an approval approves: the lines, quantities, terms, costs and prices. Any change needs a new approval. */
export function priceFingerprint(lines: { id: string; quantity: number; unitPrice: number | null; unitCost: number | null; billingFrequency: string; termMonths: number | null }[]): string {
  const r = (n: number | null) => (n === null ? "" : (Math.round(n * 100) / 100).toFixed(2));
  return [...lines]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((l) => [l.id, r(l.quantity), r(l.unitPrice), r(l.unitCost), l.billingFrequency, l.billingFrequency === "ONE_TIME" ? "" : l.termMonths ?? ""].join("|"))
    .join("\n");
}
