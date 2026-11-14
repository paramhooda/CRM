import "server-only";
import type { Actor } from "../auth/actor";
import { Forbidden, RateLimited } from "../errors";
import { canEditDeal } from "../authz/scope";
import { isSupportRole } from "@/domain/scope";
import { STAGE_META } from "@/domain/stages";
import { buildPrompt, type DealForPrompt } from "@/domain/ai-prompts";
import type { AiDraftKind } from "@/contracts/ai";
import { aiEnabled, complete } from "../ai";
import { dealHistory, dealView, loadDeal, viewerFor } from "./deals";

/** Twenty drafts an hour per person keeps a stuck button from running up a bill. */
const LIMIT = 20;
const calls = new Map<string, number[]>();
function throttle(userId: string) {
  const now = Date.now();
  const recent = (calls.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= LIMIT) throw new RateLimited("That is enough drafting for this hour; try again later.");
  recent.push(now);
  calls.set(userId, recent);
}

/** Drafts text for the deal. Scope: owner or manager. BOQ summary: the assigned presales engineer or sales. Brief: sales roles only. */
export async function draft(actor: Actor, dealId: string, kind: AiDraftKind) {
  const deal = await loadDeal(actor, dealId);
  const viewer = await viewerFor(actor, deal);
  if (kind === "brief" && isSupportRole(actor.role)) throw new Forbidden("The brief carries prices and margin; it is for sales roles.");
  if (kind === "scope" && !(await canEditDeal(actor, deal))) throw new Forbidden("Only the deal owner or a manager drafts the scope.");
  if (kind === "boq_summary" && !viewer.isAssignedPresales && !viewer.canEdit && actor.role !== "ADMIN") throw new Forbidden("Only the assigned presales engineer drafts the BOQ summary.");
  if (!(await aiEnabled())) return complete({ system: "", user: "", maxTokens: 0 }); // throws AI_OFF
  throttle(actor.id);

  const view = await dealView(actor, deal);
  const history = kind === "brief" ? (await dealHistory(actor, dealId)).stages : [];
  const latestPresales = deal.presalesRequests[0];
  const d: DealForPrompt = {
    code: deal.code,
    name: deal.name,
    account: deal.account.name,
    stage: STAGE_META[deal.stage].label,
    owner: deal.owner.fullName,
    presales: deal.presalesOwner?.fullName ?? null,
    description: deal.description,
    expectedCloseDate: deal.expectedCloseDate.toISOString().slice(0, 10),
    daysInStage: view.daysInStage,
    lines: deal.lines.map((l) => ({ lineNo: l.lineNo, description: l.description, businessUnit: l.businessUnit.name, subBusinessUnit: l.subBusinessUnit.name, oem: l.oem.name, quantity: l.quantity.toString(), unit: l.unit, revenueModel: l.revenueModel, termMonths: l.termMonths, unitSalesPrice: l.unitSalesPrice?.toString() ?? null, unitPurchaseCost: l.unitPurchaseCost?.toString() ?? null })),
    documents: view.documents.map((x) => `${x.kind.name}: ${x.fileName}`),
    latestScope: latestPresales?.scope ?? null,
    latestBoqSummary: deal.presalesRequests.find((r) => r.summary)?.summary ?? null,
    nextHeadline: view.next.headline,
    history: history.map((h) => ({ when: h.changedAt.toISOString().slice(0, 10), from: h.fromLabel, to: h.toLabel, note: h.note })),
    money: isSupportRole(actor.role) ? undefined : { value: deal.dealValue.toString(), gmPct: deal.expectedGmPct?.toString() ?? null, forecast: deal.forecastCategory, approvalState: view.approvalState },
  };
  return { text: await complete(buildPrompt(kind, d)) };
}
