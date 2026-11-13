"use server";
// Sales → Presales → Purchase → Sales workflow: BOQ requests and revisions, questions, send-backs, pricing,
// BOQ editing (with locks and concurrency checks) and quotes with customer responses.
// The deal's workflow state is derived from these records by `deriveWorkflow` (src/lib/workflow.ts).
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { can, isManager, isSupportRole, opportunityScope } from "@/lib/authz";
import { recordEvent, recordChanges } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextCode } from "@/lib/sequence";
import { boqTotals, lineMultiplier } from "@/lib/boq";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { toNumber, fmtDate, endOfDayIST, startOfTodayIST } from "@/lib/format";
import { quoteMatchesLines, quotedLine, maxQuoteValidity, firstDifference } from "@/lib/quote";
import { THRESHOLDS, STAGE_META, CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { OPEN_PRESALES, OPEN_PRICING, resumeDueDate, specChanged, specLock } from "@/lib/workflow";
import { zodErrors, type ActionResult } from "@/lib/validation";
import { applyStageChange, UserError } from "@/server/domain/stage";
import { lineInputSchema, resolveSpec, rollUpDeal, costFactsLoader } from "@/server/domain/lines";
import { costExpired, lineCostStatus, linesText, needsInternalCost, needsPurchaseCost, resolveCostSource, type CostSourceKey } from "@/lib/costing";
import { safeAction } from "@/server/action-error";

const DAY = 86_400_000;
const openPresales = { in: [...OPEN_PRESALES] };
const openPricing = { in: [...OPEN_PRICING] };

async function visibleOpp(user: CurrentUser, id: string) {
  return db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] } });
}
function refresh(oppId: string) {
  revalidatePath(`/opportunities/${oppId}`);
  revalidatePath("/requests");
  revalidatePath("/dashboard");
}
const boqLink = (oppId: string) => `/opportunities/${oppId}?tab=boq`;
const isClosed = (stage: string) => CLOSED_STAGES.includes(stage as StageKey);

/** Run a transaction, turning rule violations (UserError) into a friendly result. */
async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    throw e;
  }
}

/** A date picked in a form: the end of that day in India (src/lib/format.ts) */
const day = z.coerce.date().transform((d) => endOfDayIST(d));
const isPast = (d: Date) => d < startOfTodayIST();

/**
 * Serialise workflow changes on one deal: two people (or two clicks) creating a request or a quote at the same time
 * would otherwise both pass the "nothing open yet" check. The row lock is held until the transaction ends.
 */
async function lockDeal(tx: Tx, oppId: string) {
  await tx.$queryRaw`SELECT 1 FROM "Opportunity" WHERE "id" = ${oppId} FOR UPDATE`;
}

/** Purchase lines whose supplier price has lapsed go back to purchase with any re-pricing */
const withExpired = <L extends Parameters<typeof needsPurchaseCost>[0] & { id: string }>(lines: L[], now: Date) => {
  const ids = new Set<string>();
  return lines.filter((l) => (needsPurchaseCost(l) || costExpired(l, now)) && !ids.has(l.id) && ids.add(l.id));
};

/** Line costs or validity changed outside the BOQ editor: an editor already open must reload before saving */
const touchBoq = (tx: Tx, oppId: string) => tx.opportunity.update({ where: { id: oppId }, data: { boqVersion: { increment: 1 } } });

/**
 * Keep the pipeline stage in step with who holds the deal: BOQ while presales works on it, Pricing while purchase
 * prices it and until the quote goes out (Proposal Submitted). Deals only move forward, except that a BOQ revision
 * during Pricing takes the deal back to BOQ. Once a quote is with the customer the stage is left to sales.
 */
async function syncStage(tx: Tx, user: CurrentUser, oppId: string, to: "BOQ" | "PRICING") {
  const { stage } = await tx.opportunity.findUniqueOrThrow({ where: { id: oppId }, select: { stage: true } });
  if (isClosed(stage) || stage === "HOLD" || stage === to) return;
  const forward = STAGE_META[to].order > STAGE_META[stage as StageKey].order;
  if (forward || (to === "BOQ" && stage === "PRICING")) await applyStageChange(tx, user, oppId, to, {}, { keepForecast: true, source: "system" });
}

/** Pick the purchase user with the fewest open pricing requests. */
async function leastLoadedPurchase(tx: Tx) {
  const users = await tx.user.findMany({
    where: { role: "PURCHASE", active: true },
    select: { id: true, _count: { select: { pricingAssigned: { where: { status: openPricing } } } } },
  });
  users.sort((a, b) => a._count.pricingAssigned - b._count.pricingAssigned);
  return users[0]?.id ?? null;
}

/** Keep the same purchase person on revisions when they are still active; otherwise balance the load. */
async function purchaseFor(tx: Tx, preferred: string | null | undefined) {
  if (preferred) {
    const u = await tx.user.findFirst({ where: { id: preferred, role: "PURCHASE", active: true }, select: { id: true } });
    if (u) return u.id;
  }
  const id = await leastLoadedPurchase(tx);
  if (!id) throw new UserError("No active purchase user to assign pricing to.");
  return id;
}

async function placeholderOemIds(tx: Tx) {
  return new Set((await tx.oem.findMany({ where: { isPlaceholder: true }, select: { id: true } })).map((o) => o.id));
}

/** Own-brand lines must carry their internal cost before the BOQ moves on: presales enters it, or the rate card. */
function assertInternalCosts(lines: Parameters<typeof needsInternalCost>[0][], what: string) {
  const missing = lines.filter(needsInternalCost).map((l) => l.lineNo!);
  if (missing.length)
    throw new UserError(`Enter the cost of own-brand ${linesText(missing)} before ${what}, or mark ${missing.length > 1 ? "them" : "it"} "Source via purchase".`);
}

/** BOQ must be made of real, fully classified lines before it goes to purchase or the customer. */
async function assertRealBoq(tx: Tx, oppId: string, what: string) {
  const lines = await tx.opportunityLineItem.findMany({ where: { opportunityId: oppId }, select: { lineNo: true, isEstimate: true, oemId: true } });
  if (!lines.some((l) => !l.isEstimate)) throw new UserError(`Add BOQ lines (catalogue or custom) before ${what}.`);
  const estimates = lines.filter((l) => l.isEstimate).map((l) => l.lineNo);
  if (estimates.length) throw new UserError(`Replace estimate line ${estimates.join(", ")} with BOQ lines before ${what}.`);
  const tbd = await placeholderOemIds(tx);
  const missingOem = lines.filter((l) => tbd.has(l.oemId)).map((l) => l.lineNo);
  if (missingOem.length) throw new UserError(`Choose the OEM on line ${missingOem.join(", ")} before ${what}.`);
  return lines.length;
}

// ───────────── Presales: BOQ and revisions ─────────────

const presalesSchema = z.object({
  assignedToId: z.string().min(1, "Select a presales owner"),
  dueDate: day,
  scope: z.string().trim().min(10, "Describe the scope in a sentence or two").max(4000),
  reason: z.string().trim().max(2000).optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
  deliverables: z.preprocess(
    (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? v.split(",") : ["BOQ"]),
    z.array(z.enum(["BOQ", "SOLUTION_DOC", "PRESENTATION", "SITE_SURVEY", "POC"])).min(1, "Choose at least one deliverable"),
  ),
  siteDetails: z.string().trim().max(2000).optional(),
});

/**
 * Ask presales for a BOQ, or for a revision of it. A revision supersedes any pricing in progress
 * (purchase would otherwise price the wrong thing) and records why it was needed.
 * Involving presales in a resale deal, at any point before it closes, makes it a solution deal: presales starts from
 * the lines sales built, and only the lines they change go back to purchase. A quote with the customer stays there
 * until sales sends a revised one.
 */
export const requestPresales = safeAction("requestPresales", async function requestPresales(oppId: string, input: Record<string, unknown>): Promise<ActionResult<{ requestId: string }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.requestPresales(user, opp)) return { ok: false, error: "Only the deal owner or a manager can pull in presales." };
  if (isClosed(opp.stage)) return { ok: false, error: "This deal is closed." };
  // One stage at a time: a deal is qualified before work starts on it; a held deal resumes first
  if (opp.stage === "IDENTIFIED") return { ok: false, error: "Qualify the deal first: advance it to Qualified, then request the BOQ." };
  if (opp.stage === "HOLD") return { ok: false, error: "The deal is on hold. Resume it first." };
  const parsed = presalesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (v.deliverables.includes("SITE_SURVEY") && (!v.siteDetails || v.siteDetails.length < 3))
    return { ok: false, error: "Say which sites to survey.", fieldErrors: { siteDetails: "Which sites, and where" } };
  if (isPast(v.dueDate)) return { ok: false, error: "Due date is in the past.", fieldErrors: { dueDate: "Due date is in the past" } };
  const assignee = await db.user.findFirst({ where: { id: v.assignedToId, role: "PRESALES", active: true } });
  if (!assignee) return { ok: false, error: "Selected user is not an active presales engineer." };
  const previous = await db.presalesRequest.findMany({ where: { opportunityId: oppId }, orderBy: { revision: "desc" } });
  if (previous.some((p) => (OPEN_PRESALES as readonly string[]).includes(p.status)))
    return { ok: false, error: "A presales request is already open on this deal." };
  const revision = (previous[0]?.revision ?? 0) + 1;
  const involving = !opp.presalesRequired;
  if (involving && (!v.reason || v.reason.length < 5)) return { ok: false, error: "Say why presales is needed now.", fieldErrors: { reason: "Say why presales is needed" } };
  // A revision changes a submitted BOQ and says why; asking again after a cancelled request is just a new request
  const changesBoq = previous.some((p) => p.status === "BOQ_SUBMITTED");
  if (changesBoq && !involving && (!v.reason || v.reason.length < 5)) return { ok: false, error: "Say what needs to change in this revision.", fieldErrors: { reason: "Say what needs to change" } };
  const lineCount = await db.opportunityLineItem.count({ where: { opportunityId: oppId, isEstimate: false } });
  const latestQuote = await db.quote.findFirst({ where: { opportunityId: oppId }, orderBy: { version: "desc" } });
  const source = latestQuote?.status === "CHANGES_REQUESTED" ? "CUSTOMER" : "SALES";

  const res = await run(() =>
    db.$transaction(async (tx) => {
      await lockDeal(tx, oppId);
      if (await tx.presalesRequest.count({ where: { opportunityId: oppId, status: openPresales } }))
        throw new UserError("A presales request is already open on this deal.");
      const supersede = await tx.pricingRequest.findMany({ where: { opportunityId: oppId, status: openPricing } });
      for (const p of supersede) {
        await tx.pricingRequest.update({ where: { id: p.id }, data: { status: "CANCELLED", cancelReason: involving ? "Presales brought in to prepare the BOQ" : `Superseded by BOQ revision ${revision}` } });
        await notify(tx, [p.assignedToId], {
          type: "WORKFLOW",
          title: `Pricing on hold: ${opp.name}`,
          body: `${user.name} ${involving ? "brought in presales to prepare the BOQ" : `asked presales for BOQ revision ${revision}`}. Stop pricing; a new request will follow. Reason: ${v.reason}`,
          link: boqLink(oppId),
          exclude: user.id,
        });
      }
      const created = await tx.presalesRequest.create({
        data: {
          opportunityId: oppId, requestedById: user.id, assignedToId: v.assignedToId, dueDate: v.dueDate, scope: v.scope, priority: v.priority,
          revision, source, reason: v.reason || null, involved: involving,
          deliverables: v.deliverables, siteDetails: v.deliverables.includes("SITE_SURVEY") ? v.siteDetails || null : null,
        },
      });
      // Pulling in presales makes it a solution deal
      await tx.opportunity.update({ where: { id: oppId }, data: { presalesOwnerId: v.assignedToId, presalesRequired: true, updatedById: user.id, version: { increment: 1 } } });
      await recordChanges(tx, {
        entityType: "Opportunity", entityId: oppId, before: opp, after: { presalesOwnerId: v.assignedToId, presalesRequired: true },
        fields: ["presalesOwnerId", "presalesRequired"], userId: user.id,
      });
      await recordEvent(tx, {
        entityType: "Opportunity", entityId: oppId, userId: user.id,
        action: involving || !changesBoq ? "PRESALES_REQUESTED" : "BOQ_REVISION_REQUESTED",
        newValue: involving ? `${assignee.name} · resale deal now needs presales · ${v.reason}` : changesBoq ? `Revision ${revision} · ${assignee.name} · ${v.reason}` : assignee.name,
      });
      const startFrom = involving && lineCount ? ` Start from the ${lineCount} line${lineCount > 1 ? "s" : ""} sales added.` : "";
      await notify(tx, [v.assignedToId], {
        type: "PRESALES_REQUEST",
        title: involving ? `Presales needed: ${opp.name}` : changesBoq ? `BOQ revision ${revision}: ${opp.name}` : `BOQ requested: ${opp.name}`,
        body: `${user.name} ${involving ? `brought you in: ${v.reason}` : changesBoq ? `needs changes: ${v.reason}` : "pulled you in"}${v.priority !== "NORMAL" ? ` (${v.priority.toLowerCase()} priority)` : ""}. Due ${fmtDate(v.dueDate)}.${startFrom}`,
        link: boqLink(oppId),
      });
      await syncStage(tx, user, oppId, "BOQ");
      await recomputeOpportunity(tx, oppId);
      return { requestId: created.id };
    }),
  );
  if (res.ok) refresh(oppId);
  return res;
});

async function presalesForAssignee(user: CurrentUser, requestId: string) {
  const r = await db.presalesRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || (r.assignedToId !== user.id && !isManager(user))) return null;
  return r;
}

export const startPresales = safeAction("startPresales", async function startPresales(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await presalesForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (r.status !== "REQUESTED") return { ok: true };
  await db.presalesRequest.update({ where: { id: requestId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  refresh(r.opportunityId);
  return { ok: true };
});

/** Presales needs an answer from sales. The request pauses; its due date moves out by the time spent waiting. */
export const askSales = safeAction("askSales", async function askSales(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await presalesForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (r.status !== "REQUESTED" && r.status !== "IN_PROGRESS") return { ok: false, error: "Only open requests can be paused for a question." };
  const parsed = z.object({ question: z.string().trim().min(5, "Type your question").max(2000) }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.presalesRequest.update({
      where: { id: requestId },
      data: { status: "NEEDS_INFO", infoQuestion: parsed.data.question, infoAnswer: null, infoRequestedAt: now, startedAt: r.startedAt ?? now, remindedAt: null },
    });
    await recordEvent(tx, { entityType: "Opportunity", entityId: r.opportunityId, action: "PRESALES_QUESTION", userId: user.id, newValue: parsed.data.question });
    await notify(tx, [r.opportunity.salesOwnerId, r.requestedById], {
      type: "WORKFLOW",
      title: `Presales has a question: ${r.opportunity.name}`,
      body: `${user.name}: ${parsed.data.question}`,
      link: boqLink(r.opportunityId),
      exclude: user.id,
    });
    await recomputeOpportunity(tx, r.opportunityId);
  });
  refresh(r.opportunityId);
  return { ok: true };
});

/** Sales answers the presales question; the request resumes with its due date extended. */
export const answerPresales = safeAction("answerPresales", async function answerPresales(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.presalesRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || !(await visibleOpp(user, r.opportunityId))) return { ok: false, error: "Request not found." };
  if (!can.requestPresales(user, r.opportunity)) return { ok: false, error: "Only the deal owner or a manager can answer." };
  if (r.status !== "NEEDS_INFO") return { ok: false, error: "This request is not waiting on an answer." };
  const parsed = z.object({ answer: z.string().trim().min(2, "Type your answer").max(4000) }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const now = new Date();
  const due = resumeDueDate(r.dueDate, r.infoRequestedAt, now);
  await db.$transaction(async (tx) => {
    await tx.presalesRequest.update({
      where: { id: requestId },
      data: { status: "IN_PROGRESS", infoAnswer: parsed.data.answer, dueDate: due, remindedAt: null, escalatedAt: null },
    });
    await recordEvent(tx, { entityType: "Opportunity", entityId: r.opportunityId, action: "PRESALES_ANSWERED", userId: user.id, newValue: parsed.data.answer });
    await notify(tx, [r.assignedToId], {
      type: "WORKFLOW",
      title: `Answer from sales: ${r.opportunity.name}`,
      body: `${user.name}: ${parsed.data.answer} · Due date moved to ${fmtDate(due)}.`,
      link: boqLink(r.opportunityId),
      exclude: user.id,
    });
    await recomputeOpportunity(tx, r.opportunityId);
  });
  refresh(r.opportunityId);
  return { ok: true };
});

const submitBoqSchema = z.object({
  solutionSummary: z.string().trim().min(10, "Add a short solution summary").max(4000),
  assumptions: z.string().trim().max(4000).optional(),
  purchaseUserId: z.string().optional(),
  dueDate: day.optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Presales hands over the BOQ. Purchase is asked to price only the lines without a current cost
 * (new lines, or lines whose specification changed). If nothing needs a cost, the deal goes straight to quoting.
 */
export const submitBoq = safeAction("submitBoq", async function submitBoq(requestId: string, input: Record<string, unknown>): Promise<ActionResult<{ pricing: boolean; pricingRequestId?: string }>> {
  const user = await requireUser();
  const r = await presalesForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (!(OPEN_PRESALES as readonly string[]).includes(r.status)) return { ok: false, error: "This request is already closed." };
  const parsed = submitBoqSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (parsed.data.dueDate && isPast(parsed.data.dueDate)) return { ok: false, error: "The pricing due date is in the past.", fieldErrors: { dueDate: "In the past" } };
  const opp = r.opportunity;

  const res = await run(() =>
    db.$transaction(async (tx) => {
      const count = await assertRealBoq(tx, r.opportunityId, "submitting");
      let pricingRequestId: string | undefined;
      const lines = await tx.opportunityLineItem.findMany({ where: { opportunityId: r.opportunityId } });
      assertInternalCosts(lines, "submitting");
      const now = new Date();
      // Lines without a current cost, plus any whose supplier price has lapsed: they all need purchase again
      const pending = withExpired(lines, now);
      // Only from an open status: a double-click or a second tab finds it already submitted
      const claimed = await tx.presalesRequest.updateMany({
        where: { id: requestId, status: { in: [...OPEN_PRESALES] } },
        data: { status: "BOQ_SUBMITTED", submittedAt: now, solutionSummary: parsed.data.solutionSummary, assumptions: parsed.data.assumptions || null, startedAt: r.startedAt ?? now },
      });
      if (!claimed.count) throw new UserError("This BOQ was already submitted. Reload the page.");
      await recordEvent(tx, {
        entityType: "Opportunity", entityId: r.opportunityId, action: "BOQ_SUBMITTED", userId: user.id,
        newValue: `Revision ${r.revision} · ${count} lines${pending.length ? ` · ${pending.length} to price` : " · no cost changes"}`,
      });
      if (pending.length) {
        const purchaseId = await purchaseFor(tx, parsed.data.purchaseUserId || opp.purchaseOwnerId);
        const priced = await tx.pricingRequest.count({ where: { opportunityId: r.opportunityId, status: "QUOTED" } });
        const kind = priced ? "REPRICE" : "FULL";
        await tx.opportunityLineItem.updateMany({ where: { id: { in: pending.map((l) => l.id) } }, data: { pricingStatus: "PENDING" } });
        pricingRequestId = (await tx.pricingRequest.create({
          data: {
            opportunityId: r.opportunityId, presalesRequestId: r.id, requestedById: user.id, assignedToId: purchaseId, kind,
            reason: r.reason, dueDate: parsed.data.dueDate ?? endOfDayIST(new Date(now.getTime() + THRESHOLDS.pricingSlaDays * DAY)), notes: parsed.data.notes || null,
          },
        })).id;
        await tx.opportunity.update({ where: { id: r.opportunityId }, data: { purchaseOwnerId: purchaseId, boqVersion: { increment: 1 } } });
        await notify(tx, [purchaseId], {
          type: "PRICING_REQUEST",
          title: `${kind === "REPRICE" ? "Re-pricing" : "Pricing"} requested: ${opp.name}`,
          body: kind === "REPRICE"
            ? `BOQ revision ${r.revision}: ${pending.length} of ${count} lines changed and need a cost. ${r.reason ?? ""}`.trim()
            : `${user.name} submitted a ${count}-line BOQ. Get OEM / distributor pricing for ${pending.length} line${pending.length > 1 ? "s" : ""}.`,
          link: boqLink(r.opportunityId),
        });
      }
      await notify(tx, [opp.salesOwnerId, r.requestedById], {
        type: "BOQ_SUBMITTED",
        title: `BOQ${r.revision > 1 ? ` revision ${r.revision}` : ""} ready: ${opp.name}`,
        body: pending.length
          ? `${user.name} submitted the BOQ. Purchase has been asked to price ${pending.length} line${pending.length > 1 ? "s" : ""}.`
          : `${user.name} submitted the BOQ. Costs are unchanged, so you can set prices and quote.`,
        link: boqLink(r.opportunityId),
        exclude: user.id,
      });
      await syncStage(tx, user, r.opportunityId, "PRICING");
      await recomputeOpportunity(tx, r.opportunityId);
      return { pricing: pending.length > 0, pricingRequestId };
    }),
  );
  if (res.ok) refresh(r.opportunityId);
  return res;
});

// ───────────── Pricing ─────────────

const pricingSchema = z.object({
  assignedToId: z.string().optional(),
  dueDate: day,
  reason: z.string().trim().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Ask purchase for pricing without presales: a BOQ built by sales, a changed line, or re-validating costs
 * that have expired. With nothing changed, every line is re-validated.
 */
export const requestPricing = safeAction("requestPricing", async function requestPricing(oppId: string, input: Record<string, unknown>): Promise<ActionResult<{ kind: string; requestId: string }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.editBoqSpec(user, opp)) return { ok: false, error: "Only the deal owner, presales owner or a manager can request pricing." };
  if (isClosed(opp.stage)) return { ok: false, error: "This deal is closed." };
  if (opp.stage === "IDENTIFIED") return { ok: false, error: "Qualify the deal first: advance it to Qualified, then request pricing." };
  if (opp.stage === "HOLD") return { ok: false, error: "The deal is on hold. Resume it first." };
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (isPast(parsed.data.dueDate)) return { ok: false, error: "Due date is in the past.", fieldErrors: { dueDate: "In the past" } };
  const res = await run(() =>
    db.$transaction(async (tx) => {
      await lockDeal(tx, oppId);
      if (await tx.presalesRequest.count({ where: { opportunityId: oppId, status: openPresales } }))
        throw new UserError("Presales is working on the BOQ. Pricing is requested automatically when they submit it.");
      if (await tx.pricingRequest.count({ where: { opportunityId: oppId, status: openPricing } }))
        throw new UserError("A pricing request is already open on this deal.");
      // A solution deal is priced from presales' BOQ, never from lines sales put together
      if (opp.presalesRequired && !(await tx.presalesRequest.count({ where: { opportunityId: oppId, status: "BOQ_SUBMITTED" } })))
        throw new UserError("This deal needs a BOQ from presales before pricing. Request a BOQ from presales, or mark it as a resale deal in Edit.");
      await assertRealBoq(tx, oppId, "requesting pricing");
      const lines = await tx.opportunityLineItem.findMany({ where: { opportunityId: oppId } });
      const purchaseLines = lines.filter((l) => !l.isEstimate && l.costSource === "PURCHASE");
      if (!purchaseLines.length)
        throw new UserError("No line on this deal is costed by purchase. Own-brand lines use the rate card or a cost from presales.");
      const now = new Date();
      const pending = withExpired(lines, now).filter(needsPurchaseCost);
      const expired = lines.filter((l) => costExpired(l, now));
      const previous = await tx.pricingRequest.count({ where: { opportunityId: oppId, status: { not: "CANCELLED" } } });
      const kind = pending.length ? (previous ? "REPRICE" : "FULL") : "REVALIDATE";
      if (kind !== "FULL" && (!parsed.data.reason || parsed.data.reason.length < 5))
        throw new UserError(kind === "REVALIDATE" ? "Say why the costs need re-validating." : "Say what changed so purchase knows what to price.");
      const purchaseId = await purchaseFor(tx, parsed.data.assignedToId || opp.purchaseOwnerId);
      // Re-validation sends back only the lines whose supplier price has lapsed (all purchase lines when none has);
      // re-pricing also takes any lapsed lines along, so the deal comes back fully quotable
      const target = kind === "REVALIDATE" ? (expired.length ? expired : purchaseLines) : withExpired(lines, now);
      await tx.opportunityLineItem.updateMany({ where: { id: { in: target.map((l) => l.id) } }, data: { pricingStatus: "PENDING" } });
      const created = await tx.pricingRequest.create({
        data: { opportunityId: oppId, requestedById: user.id, assignedToId: purchaseId, kind, reason: parsed.data.reason || null, dueDate: parsed.data.dueDate, notes: parsed.data.notes || null },
      });
      await tx.opportunity.update({ where: { id: oppId }, data: { purchaseOwnerId: purchaseId, boqVersion: { increment: 1 } } });
      const what = kind === "REVALIDATE" ? "Re-validation" : kind === "REPRICE" ? "Re-pricing" : "Pricing";
      await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "PRICING_REQUESTED", userId: user.id, newValue: `${what} · ${target.length} lines${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}` });
      await notify(tx, [purchaseId], {
        type: "PRICING_REQUEST",
        title: `${what} requested: ${opp.name}`,
        body: `${user.name}: ${target.length} line${target.length > 1 ? "s" : ""} to ${kind === "REVALIDATE" ? "re-confirm" : "price"}. ${parsed.data.reason ?? ""}`.trim(),
        link: boqLink(oppId),
        exclude: user.id,
      });
      await syncStage(tx, user, oppId, "PRICING");
      await recomputeOpportunity(tx, oppId);
      return { kind, requestId: created.id };
    }),
  );
  if (res.ok) refresh(oppId);
  return res;
});

async function pricingForAssignee(user: CurrentUser, requestId: string) {
  const r = await db.pricingRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || (r.assignedToId !== user.id && !isManager(user))) return null;
  return r;
}

export const startPricing = safeAction("startPricing", async function startPricing(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await pricingForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (r.status === "REQUESTED") await db.pricingRequest.update({ where: { id: requestId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  refresh(r.opportunityId);
  return { ok: true };
});

const completePricingSchema = z.object({
  quoteValidTill: day,
  responseNotes: z.string().max(2000).optional(),
});

export const completePricing = safeAction("completePricing", async function completePricing(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await pricingForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (!(OPEN_PRICING as readonly string[]).includes(r.status)) return { ok: false, error: "This request is already closed." };
  const parsed = completePricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (isPast(parsed.data.quoteValidTill)) return { ok: false, error: "Supplier pricing validity is in the past.", fieldErrors: { quoteValidTill: "Already expired" } };
  const purchaseLines = { opportunityId: r.opportunityId, isEstimate: false, costSource: "PURCHASE" as const };
  const missing = await db.opportunityLineItem.findMany({ where: { ...purchaseLines, unitCost: null }, select: { lineNo: true } });
  if (missing.length) return { ok: false, error: `${linesText(missing.map((l) => l.lineNo)).replace(/^l/, "L")} still need${missing.length === 1 ? "s" : ""} a unit cost.` };
  // A line that changed after it was costed still shows the old cost: purchase must enter a new one or tick
  // "Price unchanged" on it, so an old price never passes as current
  const stale = await db.opportunityLineItem.findMany({ where: { ...purchaseLines, needsReprice: true }, select: { lineNo: true } });
  if (stale.length) return { ok: false, error: `${linesText(stale.map((l) => l.lineNo)).replace(/^l/, "L")} changed after ${stale.length > 1 ? "they were" : "it was"} costed. Enter the new cost, or tick "Price unchanged", and save the BOQ first.` };
  const now = new Date();
  // Each supplier quotes its own validity. Lines in this request without one, or with a lapsed one, take the date
  // confirmed here; lines not in the request keep theirs.
  const res = await run(() => db.$transaction(async (tx) => {
    const claimed = await tx.pricingRequest.updateMany({ where: { id: requestId, status: { in: [...OPEN_PRICING] } }, data: { status: "QUOTED" } });
    if (!claimed.count) throw new UserError("Pricing on this request was already completed. Reload the page.");
    // The dialog's date goes to lines without a validity of their own, and to lapsed lines purchase dealt with in this
    // request (still pending, or saved since it was raised); a lapsed line outside the request is never renewed
    const inRequest = { OR: [{ pricingStatus: "PENDING" as const }, { updatedAt: { gte: r.createdAt } }] };
    await tx.opportunityLineItem.updateMany({
      where: { ...purchaseLines, OR: [{ costValidTill: null }, { AND: [{ costValidTill: { lt: now } }, inRequest] }] },
      data: { costValidTill: parsed.data.quoteValidTill },
    });
    await tx.opportunityLineItem.updateMany({ where: { ...purchaseLines, pricingStatus: "PENDING" }, data: { pricingStatus: "QUOTED", needsReprice: false } });
    const first = await tx.opportunityLineItem.findFirst({ where: purchaseLines, orderBy: { costValidTill: "asc" }, select: { costValidTill: true } });
    const validTill = first?.costValidTill ?? parsed.data.quoteValidTill;
    await tx.pricingRequest.update({
      where: { id: requestId },
      data: { status: "QUOTED", quotedAt: now, startedAt: r.startedAt ?? now, quoteValidTill: validTill, responseNotes: parsed.data.responseNotes || null },
    });
    await recordEvent(tx, { entityType: "Opportunity", entityId: r.opportunityId, action: "PRICING_COMPLETED", userId: user.id, newValue: `Earliest validity ${fmtDate(validTill)}` });
    await notify(tx, [r.opportunity.salesOwnerId, r.opportunity.presalesOwnerId, r.requestedById], {
      type: "PRICING_COMPLETE",
      title: `Pricing ready: ${r.opportunity.name}`,
      body: `${user.name} added costs, the earliest valid till ${fmtDate(validTill)}. Set sell prices and generate the quote.`,
      link: boqLink(r.opportunityId),
      exclude: user.id,
    });
    await touchBoq(tx, r.opportunityId);
    await recomputeOpportunity(tx, r.opportunityId);
  }));
  if (!res.ok) return res;
  refresh(r.opportunityId);
  return { ok: true };
});

/**
 * Purchase cannot price the BOQ as specified (wrong part, end-of-life, no distributor, unclear scope).
 * It goes back to presales as a new revision, or to sales when presales was never involved.
 */
export const returnToPresales = safeAction("returnToPresales", async function returnToPresales(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await pricingForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (!(OPEN_PRICING as readonly string[]).includes(r.status)) return { ok: false, error: "This request is already closed." };
  const parsed = z.object({ reason: z.string().trim().min(5, "Say what needs fixing").max(2000) }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const reason = parsed.data.reason;
  const opp = r.opportunity;
  const res = await run(() =>
    db.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.pricingRequest.updateMany({ where: { id: requestId, status: { in: [...OPEN_PRICING] } }, data: { status: "RETURNED", returnReason: reason, returnedAt: now, startedAt: r.startedAt ?? now } });
      if (!claimed.count) throw new UserError("This pricing request was already closed. Reload the page.");
      const presales = opp.presalesOwnerId ? await tx.user.findFirst({ where: { id: opp.presalesOwnerId, role: "PRESALES", active: true } }) : null;
      if (presales) {
        const last = await tx.presalesRequest.findFirst({ where: { opportunityId: opp.id }, orderBy: { revision: "desc" } });
        const revision = (last?.revision ?? 0) + 1;
        await tx.presalesRequest.create({
          data: {
            opportunityId: opp.id, requestedById: user.id, assignedToId: presales.id, revision, source: "PURCHASE", reason,
            scope: last?.scope ?? "Fix the BOQ so it can be priced.", priority: "HIGH",
            dueDate: new Date(now.getTime() + Math.ceil(THRESHOLDS.presalesSlaDays / 2) * DAY),
          },
        });
        await recordEvent(tx, { entityType: "Opportunity", entityId: opp.id, action: "PRICING_RETURNED", userId: user.id, newValue: `To ${presales.name} as revision ${revision} · ${reason}` });
        await notify(tx, [presales.id], {
          type: "PRESALES_REQUEST",
          title: `BOQ sent back by purchase: ${opp.name}`,
          body: `${user.name}: ${reason}. Revision ${revision} is now with you.`,
          link: boqLink(opp.id),
        });
      } else {
        await recordEvent(tx, { entityType: "Opportunity", entityId: opp.id, action: "PRICING_RETURNED", userId: user.id, newValue: `To sales · ${reason}` });
      }
      await notify(tx, [opp.salesOwnerId], {
        type: "WORKFLOW",
        title: `Purchase sent the BOQ back: ${opp.name}`,
        body: `${user.name}: ${reason}${presales ? ` · ${presales.name} is revising it.` : " · Fix the lines and request pricing again."}`,
        link: boqLink(opp.id),
        exclude: user.id,
      });
      if (presales) await syncStage(tx, user, opp.id, "BOQ");
      await recomputeOpportunity(tx, opp.id);
    }),
  );
  if (res.ok) refresh(opp.id);
  return res;
});

// ───────────── Reassign and cancel (both request types) ─────────────

type ReqKind = "presales" | "pricing";

async function loadRequest(kind: ReqKind, id: string) {
  const r =
    kind === "presales"
      ? await db.presalesRequest.findUnique({ where: { id }, include: { opportunity: true, assignedTo: { select: { name: true } } } })
      : await db.pricingRequest.findUnique({ where: { id }, include: { opportunity: true, assignedTo: { select: { name: true } } } });
  return r;
}

/** Hand an open request to someone else: managers, the deal owner, or the current assignee handing off. */
export const reassignRequest = safeAction("reassignRequest", async function reassignRequest(kind: ReqKind, requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await loadRequest(kind, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  const open = (kind === "presales" ? OPEN_PRESALES : OPEN_PRICING) as readonly string[];
  if (!open.includes(r.status)) return { ok: false, error: "Only open requests can be reassigned." };
  if (!isManager(user) && r.assignedToId !== user.id && r.opportunity.salesOwnerId !== user.id) return { ok: false, error: "Not allowed." };
  const parsed = z.object({ assignedToId: z.string().min(1, "Choose who takes it over"), note: z.string().trim().max(1000).optional(), dueDate: day.optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (parsed.data.assignedToId === r.assignedToId) return { ok: true };
  // Handing over an overdue request needs a date the new person can meet, or it is escalated straight away
  const due = parsed.data.dueDate ?? r.dueDate;
  if (due < new Date()) return { ok: false, error: "This request is overdue. Give the new assignee a new due date.", fieldErrors: { dueDate: "Set a new due date" } };
  if (parsed.data.dueDate && isPast(parsed.data.dueDate)) return { ok: false, error: "Due date is in the past.", fieldErrors: { dueDate: "In the past" } };
  const role = kind === "presales" ? "PRESALES" : "PURCHASE";
  const to = await db.user.findFirst({ where: { id: parsed.data.assignedToId, role, active: true } });
  if (!to) return { ok: false, error: `Choose an active ${role.toLowerCase()} user.` };
  const oppId = r.opportunityId;
  await db.$transaction(async (tx) => {
    const data = { assignedToId: to.id, dueDate: due, remindedAt: null, escalatedAt: null };
    const where = { id: requestId, status: { in: [...open] } };
    const done = kind === "presales" ? await tx.presalesRequest.updateMany({ where: where as Prisma.PresalesRequestWhereInput, data }) : await tx.pricingRequest.updateMany({ where: where as Prisma.PricingRequestWhereInput, data });
    if (!done.count) throw new UserError("This request was just closed. Reload the page.");
    const field = kind === "presales" ? "presalesOwnerId" : "purchaseOwnerId";
    await tx.opportunity.update({ where: { id: oppId }, data: { [field]: to.id } });
    await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: r.opportunity, after: { [field]: to.id }, fields: [field], userId: user.id });
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "REQUEST_REASSIGNED", userId: user.id, newValue: `${r.assignedTo.name} → ${to.name}${parsed.data.note ? ` · ${parsed.data.note}` : ""}` });
    await notify(tx, [to.id], {
      type: kind === "presales" ? "PRESALES_REQUEST" : "PRICING_REQUEST",
      title: `${kind === "presales" ? "BOQ" : "Pricing"} request handed to you: ${r.opportunity.name}`,
      body: `${user.name} reassigned it from ${r.assignedTo.name}. Due ${fmtDate(due)}.${parsed.data.note ? ` ${parsed.data.note}` : ""}`,
      link: boqLink(oppId),
      exclude: user.id,
    });
    await notify(tx, [r.assignedToId, r.opportunity.salesOwnerId], {
      type: "ASSIGNMENT",
      title: `${kind === "presales" ? "BOQ" : "Pricing"} request reassigned: ${r.opportunity.name}`,
      body: `${user.name} handed it to ${to.name}.`,
      link: boqLink(oppId),
      exclude: user.id,
    });
  });
  refresh(oppId);
  return { ok: true };
});

/** Withdraw an open request with a reason. The assignee is told so they stop work. */
export const cancelRequest = safeAction("cancelRequest", async function cancelRequest(kind: ReqKind, requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await loadRequest(kind, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  const open = (kind === "presales" ? OPEN_PRESALES : OPEN_PRICING) as readonly string[];
  if (!open.includes(r.status)) return { ok: false, error: "This request is already closed." };
  // Sales decides what work the deal needs: the deal owner or a manager (or a sales requester) can withdraw it.
  // Presales and purchase hand work back with "Send back" instead of cancelling each other's requests.
  const salesRequester = r.requestedById === user.id && !isSupportRole(user);
  if (!isManager(user) && r.opportunity.salesOwnerId !== user.id && !salesRequester) return { ok: false, error: "Only the deal owner or a manager can cancel." };
  const parsed = z.object({ reason: z.string().trim().min(3, "Give a reason").max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const oppId = r.opportunityId;
  let revertedToResale = false;
  await db.$transaction(async (tx) => {
    const data = { status: "CANCELLED" as const, cancelReason: parsed.data.reason };
    const where = { id: requestId, status: { in: [...open] } };
    const done = kind === "presales" ? await tx.presalesRequest.updateMany({ where: where as Prisma.PresalesRequestWhereInput, data }) : await tx.pricingRequest.updateMany({ where: where as Prisma.PricingRequestWhereInput, data });
    if (!done.count) throw new UserError("This request was just closed. Reload the page.");
    // Presales brought into a resale deal and withdrawn before any BOQ: the deal is a resale deal again
    if (kind === "presales" && (r as { involved?: boolean }).involved) {
      const submitted = await tx.presalesRequest.count({ where: { opportunityId: oppId, status: "BOQ_SUBMITTED" } });
      if (!submitted) {
        await tx.opportunity.update({ where: { id: oppId }, data: { presalesRequired: false, version: { increment: 1 } } });
        await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: r.opportunity, after: { presalesRequired: false }, fields: ["presalesRequired"], userId: user.id });
        revertedToResale = true;
      }
    }
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "REQUEST_CANCELLED", userId: user.id, newValue: `${kind === "presales" ? "BOQ" : "Pricing"} request · ${parsed.data.reason}${revertedToResale ? " · back to a resale deal" : ""}` });
    await notify(tx, [r.assignedToId], {
      type: "WORKFLOW",
      title: `${kind === "presales" ? "BOQ" : "Pricing"} request cancelled: ${r.opportunity.name}`,
      body: `${user.name}: ${parsed.data.reason}. No further work needed.`,
      link: boqLink(oppId),
      exclude: user.id,
    });
    await notify(tx, [r.opportunity.salesOwnerId, r.requestedById], {
      type: "WORKFLOW",
      title: `${kind === "presales" ? "BOQ" : "Pricing"} request cancelled: ${r.opportunity.name}`,
      body: `${user.name} cancelled the request ${kind === "presales" ? "to" : "with"} ${r.assignedTo.name}: ${parsed.data.reason}.${revertedToResale ? " The deal is a resale deal again." : ""}`,
      link: boqLink(oppId),
      exclude: [user.id, r.assignedToId],
    });
    await recomputeOpportunity(tx, oppId);
  });
  refresh(oppId);
  return { ok: true };
});

// ───────────── Line items (BOQ) ─────────────

/**
 * Save the BOQ. Rules:
 * - `version` must match the deal's BOQ version, so two people cannot overwrite each other's work.
 * - Specification is locked while purchase is pricing, and to the assignee while presales is working on it.
 * - A costed line whose specification changes is flagged for re-pricing.
 * - "To be decided" OEM is only allowed on estimate lines.
 * - Each line's cost comes from its source: purchase lines from purchase (with the supplier's validity), rate card
 *   lines from the catalogue's standard cost, presales lines from presales. Spec editors choose the source, within
 *   what the line allows; moving a line to or from purchase is a specification change.
 */
export const saveBoq = safeAction("saveBoq", async function saveBoq(oppId: string, rawLines: unknown[], version: number): Promise<ActionResult<{ version: number }>> {
  const user = await requireUser();
  if (!Number.isInteger(version)) return { ok: false, error: "This page is out of date. Reload it and make your changes again." };
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  const parsed = z.array(lineInputSchema).max(200).safeParse(rawLines);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (!parsed.data.length) return { ok: false, error: "A deal needs at least one line item. Its OEM, BU and value come from the lines." };
  const spec = can.editBoqSpec(user, opp);
  const cost = can.editBoqCost(user);
  const price = can.editBoqPrice(user, opp);
  const internal = can.editInternalCost(user, opp);
  if (!spec && !cost && !price && !internal) return { ok: false, error: "You cannot edit these line items." };
  if (isClosed(opp.stage)) return { ok: false, error: "Line items are locked on closed deals." };

  const dec = (n: number | null | undefined) => (n === null || n === undefined ? null : new Prisma.Decimal(n));
  const num = (d: Prisma.Decimal | null) => (d === null ? null : toNumber(d));
  const res = await run(() =>
    db.$transaction(async (tx) => {
      // Optimistic concurrency: claim the next version atomically, or fail if someone saved first
      const next = version + 1;
      const claimed = await tx.opportunity.updateMany({ where: { id: oppId, boqVersion: version }, data: { boqVersion: next } });
      if (!claimed.count) throw new UserError("Someone else saved this BOQ after you opened it. Reload the page to see their changes, then make yours again.");

      const [presalesOpen, pricingOpen, tbd] = await Promise.all([
        tx.presalesRequest.findFirst({ where: { opportunityId: oppId, status: openPresales }, select: { assignedToId: true } }),
        tx.pricingRequest.count({ where: { opportunityId: oppId, status: openPricing } }),
        placeholderOemIds(tx),
      ]);
      // Editing the BOQ is starting work: no separate "Start" click needed
      const startedAt = new Date();
      await tx.presalesRequest.updateMany({ where: { opportunityId: oppId, status: "REQUESTED", assignedToId: user.id }, data: { status: "IN_PROGRESS", startedAt } });
      await tx.pricingRequest.updateMany({ where: { opportunityId: oppId, status: "REQUESTED", assignedToId: user.id }, data: { status: "IN_PROGRESS", startedAt } });
      const lock = spec ? specLock({ presalesOpen: presalesOpen && { assigneeId: presalesOpen.assignedToId }, pricingOpen: pricingOpen > 0, userId: user.id, isManager: isManager(user) }) : null;

      const costFacts = await costFactsLoader(tx);
      const existing = await tx.opportunityLineItem.findMany({ where: { opportunityId: oppId } });
      const byId = new Map(existing.map((l) => [l.id, l]));
      const incomingIds = new Set(parsed.data.filter((l) => l.id).map((l) => l.id!));
      const toDelete = existing.filter((l) => !incomingIds.has(l.id));
      if (toDelete.length && !spec) throw new UserError("Only presales or the deal owner can remove line items.");
      if (toDelete.length && lock) throw new UserError(lock);

      let saved = 0;
      let repriced = 0;
      if (toDelete.length) await tx.opportunityLineItem.deleteMany({ where: { id: { in: toDelete.map((l) => l.id) } } });
      let lineNo = 0;
      for (const l of parsed.data) {
        lineNo++;
        const cur = l.id ? byId.get(l.id) : undefined;
        const priceData = { unitPrice: dec(l.unitPrice) };
        const specData = spec ? await resolveSpec(tx, l, opp.contractTermMonths) : null;
        if (specData && !specData.isEstimate && tbd.has(specData.oemId))
          throw new UserError(`Line ${lineNo}: choose the OEM. "To be decided" is only allowed on estimate lines.`);
        if (!cur && !spec) continue;

        // Cost source, and what this user may enter for it
        const facts = await costFacts(specData ?? cur!);
        const source = resolveCostSource(spec || internal ? l.costSource ?? cur?.costSource : cur!.costSource, facts);
        const sourceChanged = !!cur && source !== cur.costSource;
        if (sourceChanged && lock && (source === "PURCHASE" || cur!.costSource === "PURCHASE")) throw new UserError(lock);
        const canCost = source === "PURCHASE" ? cost : source === "PRESALES" && internal;
        const costData: {
          costSource: CostSourceKey; unitCost?: Prisma.Decimal | null; costValidTill?: Date | null; costNote?: string | null;
          distributor?: string | null; oemQuoteRef?: string | null; leadTimeDays?: number | null;
        } = { costSource: source };
        if (source === "RATE_CARD") Object.assign(costData, { unitCost: dec(facts.standardCost), costValidTill: null });
        else if (canCost) {
          Object.assign(costData, { unitCost: dec(l.unitCost), costNote: l.costNote || null });
          if (source === "PURCHASE")
            Object.assign(costData, { distributor: l.distributor || null, oemQuoteRef: l.oemQuoteRef || null, leadTimeDays: l.leadTimeDays ?? null, costValidTill: l.costValidTill ?? null });
        } else if (spec && l.costNote !== undefined) costData.costNote = l.costNote || null;
        const costChanged = canCost && (!cur || num(cur.unitCost) !== (l.unitCost ?? null) || (cur.distributor ?? null) !== (l.distributor || null)
          || (cur.costValidTill?.getTime() ?? null) !== (l.costValidTill?.getTime() ?? null));
        const hasCost = source === "RATE_CARD" ? facts.standardCost !== null : canCost ? l.unitCost !== null && l.unitCost !== undefined : !!cur && cur.unitCost !== null;

        if (!cur) {
          if (lock) throw new UserError(lock);
          const { status } = lineCostStatus({ source, prevStatus: null, sourceChanged: false, specChanged: false, canCost, costChanged: true, hasCost });
          await tx.opportunityLineItem.create({
            data: {
              opportunityId: oppId, lineNo, ...specData!, ...costData,
              pricingStatus: status, ...(price ? priceData : {}), createdById: user.id, updatedById: user.id,
            },
          });
          saved++;
          continue;
        }
        const data: Prisma.OpportunityLineItemUncheckedUpdateInput = { lineNo, updatedById: user.id };
        let changedSpec = false;
        if (specData) {
          changedSpec = specChanged(
            { ...cur, quantity: toNumber(cur.quantity) },
            { ...specData, quantity: toNumber(specData.quantity) },
          ) || cur.isEstimate !== specData.isEstimate;
          if (changedSpec && lock) throw new UserError(lock);
          Object.assign(data, specData);
        }
        Object.assign(data, costData);
        if (price) Object.assign(data, priceData);
        // A purchase line whose specification changed keeps its old cost as a reference until purchase re-confirms it
        const st = lineCostStatus({
          source, prevStatus: cur.pricingStatus, sourceChanged, specChanged: changedSpec, canCost, costChanged, hasCost,
          stale: cur.needsReprice, confirmed: canCost && source === "PURCHASE" && !!l.confirmCost,
        });
        data.pricingStatus = st.status;
        data.needsReprice = st.stale;
        if (st.repriced) repriced++;
        await tx.opportunityLineItem.update({ where: { id: cur.id }, data });
        saved++;
      }
      await recordEvent(tx, {
        entityType: "Opportunity", entityId: oppId, action: "BOQ_UPDATED", userId: user.id,
        newValue: `${saved} lines saved, ${toDelete.length} removed${repriced ? `, ${repriced} need re-pricing` : ""}`,
      });
      await tx.opportunity.update({ where: { id: oppId }, data: { lastActivityAt: new Date() } });
      await rollUpDeal(tx, oppId, user.id);
      await recomputeOpportunity(tx, oppId);
      return { version: next };
    }, { timeout: 20_000, maxWait: 5_000 }), // a 200-line BOQ is many statements
  );
  if (res.ok) refresh(oppId);
  return res;
});

// ───────────── Quotes ─────────────

const quoteSchema = z.object({
  validTill: day,
  terms: z.string().max(4000).optional(),
  /** When set, every line is priced at this gross margin on its cost before the quote is created */
  marginPct: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).max(90).optional()),
});

export const createQuote = safeAction("createQuote", async function createQuote(oppId: string, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.createQuote(user, opp)) return { ok: false, error: "Only the deal owner or a manager can issue quotes." };
  if (isClosed(opp.stage)) return { ok: false, error: "This deal is closed." };
  if (opp.stage === "HOLD") return { ok: false, error: "The deal is on hold. Resume it before sending a quote." };
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (isPast(parsed.data.validTill)) return { ok: false, error: "Quote validity is in the past.", fieldErrors: { validTill: "Validity is in the past" } };
  const res = await run(() =>
    db.$transaction(async (tx) => {
      await lockDeal(tx, oppId);
      if (await tx.presalesRequest.count({ where: { opportunityId: oppId, status: openPresales } }))
        throw new UserError("Presales is still working on the BOQ. Quote once they submit it.");
      if (await tx.pricingRequest.count({ where: { opportunityId: oppId, status: openPricing } }))
        throw new UserError("Purchase is still pricing the BOQ. Quote once pricing is complete.");
      if (opp.presalesRequired && !(await tx.presalesRequest.count({ where: { opportunityId: oppId, status: "BOQ_SUBMITTED" } })))
        throw new UserError("This deal needs a BOQ from presales before it can be quoted.");
      await assertRealBoq(tx, oppId, "quoting");
      const m = parsed.data.marginPct;
      if (m !== undefined) {
        const costed = await tx.opportunityLineItem.findMany({ where: { opportunityId: oppId, isEstimate: false, unitCost: { not: null } }, select: { id: true, unitCost: true } });
        for (const l of costed)
          // To the paisa: rounding to whole rupees would turn small per-unit prices (₹0.40/GB) into ₹0
          await tx.opportunityLineItem.update({ where: { id: l.id }, data: { unitPrice: new Prisma.Decimal(Math.round((toNumber(l.unitCost) / (1 - m / 100)) * 100) / 100), updatedById: user.id } });
      }
      const lines = await tx.opportunityLineItem.findMany({
        where: { opportunityId: oppId },
        orderBy: { lineNo: "asc" },
        include: { oem: { select: { name: true } }, product: { select: { hsnSac: true, gstRatePct: true } } },
      });
      const t = boqTotals(lines);
      const pending = lines.filter(needsPurchaseCost).map((l) => l.lineNo);
      if (pending.length) throw new UserError(`${linesText(pending).replace(/^l/, "L")} still need${pending.length > 1 ? "" : "s"} a current cost from purchase. Request pricing first.`);
      assertInternalCosts(lines, "quoting");
      if (!t.fullyPriced) throw new UserError("Every BOQ line needs a sell price before quoting.");
      if (!t.fullyCosted) throw new UserError("Some lines have no cost yet.");
      const expired = lines.filter((l) => costExpired(l, new Date()));
      if (expired.length) {
        const first = new Date(Math.min(...expired.map((l) => l.costValidTill!.getTime())));
        throw new UserError(`Supplier pricing on ${linesText(expired.map((l) => l.lineNo))} expired on ${fmtDate(first)}. Ask purchase to re-validate it before quoting.`);
      }
      // The customer can't be promised a price for longer than the suppliers promised theirs
      const cap = maxQuoteValidity(lines.filter((l) => !l.isEstimate && l.costSource === "PURCHASE").map((l) => l.costValidTill));
      if (cap && parsed.data.validTill > endOfDayIST(cap))
        throw new UserError(`Supplier prices hold only until ${fmtDate(cap)}. Make the quote valid till then at most, or ask purchase to extend the supplier validity.`);

      const last = await tx.quote.findFirst({ where: { opportunityId: oppId }, orderBy: { version: "desc" } });
      // Only one quote is ever live (or accepted): a revised quote replaces all earlier ones
      await tx.quote.updateMany({ where: { opportunityId: oppId, status: { in: ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED", "ACCEPTED"] } }, data: { status: "SUPERSEDED" } });
      const code = await nextCode(tx, "QT");
      const q = await tx.quote.create({
        data: {
          code, opportunityId: oppId, version: (last?.version ?? 0) + 1, status: "SUBMITTED", submittedAt: new Date(),
          totalPrice: new Prisma.Decimal(Math.round(t.totalPrice)), totalCost: new Prisma.Decimal(Math.round(t.totalCost)),
          marginPct: new Prisma.Decimal(Math.round((t.marginPct ?? 0) * 100) / 100), validTill: parsed.data.validTill,
          terms: parsed.data.terms || null, createdById: user.id,
          // What the customer sees; src/lib/quote.ts compares the deal's lines against this to keep the quote honest
          snapshot: lines.map((l) => ({
            ...quotedLine(l), oem: l.oem?.name ?? null, hsnSac: l.hsnSac ?? l.product?.hsnSac ?? null,
            unitPrice: toNumber(l.unitPrice), extended: lineMultiplier(l) * toNumber(l.unitPrice),
          })),
        },
      });
      const amount = new Prisma.Decimal(Math.round(t.totalPrice));
      await tx.opportunity.update({
        where: { id: oppId },
        // version: an edit form opened before the quote must not put back the old margin
        data: { amount, expectedMarginPct: new Prisma.Decimal(Math.round((t.marginPct ?? 0) * 100) / 100), lastActivityAt: new Date(), version: { increment: 1 } },
      });
      await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: opp, after: { amount }, fields: ["amount"], userId: user.id });
      await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "QUOTE_ISSUED", userId: user.id, newValue: `${code} v${q.version}${m !== undefined ? ` at ${m}% margin` : ""}` });
      await tx.opportunity.update({ where: { id: oppId }, data: { boqVersion: { increment: 1 } } });
      if (STAGE_META[opp.stage as StageKey].order < STAGE_META.PROPOSAL.order) {
        await applyStageChange(tx, user, oppId, "PROPOSAL", {}, { keepForecast: true, source: "system" });
      }
      await recomputeOpportunity(tx, oppId);
      return { id: q.id };
    }),
  );
  if (res.ok) refresh(oppId);
  return res;
});

const responseSchema = z
  .object({
    response: z.enum(["ACCEPTED", "CHANGES_REQUESTED", "REJECTED"]),
    note: z.string().trim().max(2000).optional(),
  })
  .refine((v) => v.response === "ACCEPTED" || (v.note && v.note.length >= 3), { path: ["note"], message: "Say what the customer asked for" });

/**
 * Record what the customer said about the latest quote. Accepted waits for the PO (mark the deal Won);
 * changes requested sends sales back to re-price or ask presales for a revision; rejected keeps the deal open
 * until sales closes it, in case the customer re-engages.
 */
export const recordQuoteResponse = safeAction("recordQuoteResponse", async function recordQuoteResponse(quoteId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const q = await db.quote.findUnique({ where: { id: quoteId }, include: { opportunity: true } });
  if (!q || !(await visibleOpp(user, q.opportunityId))) return { ok: false, error: "Quote not found." };
  if (!can.createQuote(user, q.opportunity)) return { ok: false, error: "Only the deal owner or a manager can record the customer's response." };
  if (isClosed(q.opportunity.stage)) return { ok: false, error: "This deal is closed." };
  const latest = await db.quote.findFirst({ where: { opportunityId: q.opportunityId }, orderBy: { version: "desc" }, select: { id: true } });
  if (latest?.id !== q.id) return { ok: false, error: "Only the latest quote can get a response." };
  if (q.status !== "SUBMITTED" && q.status !== "CHANGES_REQUESTED") return { ok: false, error: "This quote already has a final response." };
  const parsed = responseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const { response, note } = parsed.data;
  if (response === "ACCEPTED") {
    // Acceptance is only meaningful for a quote that still describes the deal and is still valid
    if (q.validTill < new Date()) return { ok: false, error: `Quote v${q.version} expired on ${fmtDate(q.validTill)}. Extend its validity first (or send a revised quote).` };
    const diff = await quoteDifference(q.opportunityId, q.snapshot);
    if (diff) return { ok: false, error: `The deal changed after quote v${q.version} was sent (${diff}). Send a revised quote for the customer to accept.` };
  }
  await db.$transaction(async (tx) => {
    const done = await tx.quote.updateMany({ where: { id: quoteId, status: { in: ["SUBMITTED", "CHANGES_REQUESTED"] } }, data: { status: response, respondedAt: new Date(), responseNote: note || null } });
    if (!done.count) throw new UserError("This quote already has a response. Reload the page.");
    const label = response === "ACCEPTED" ? "accepted" : response === "REJECTED" ? "rejected" : "asked for changes to";
    await recordEvent(tx, { entityType: "Opportunity", entityId: q.opportunityId, action: "QUOTE_RESPONSE", userId: user.id, newValue: `Customer ${label} ${q.code} v${q.version}${note ? ` · ${note}` : ""}` });
    await tx.opportunity.update({ where: { id: q.opportunityId }, data: { lastActivityAt: new Date() } });
    await notify(tx, [q.opportunity.salesOwnerId, q.opportunity.presalesOwnerId, ...(response === "ACCEPTED" ? [q.opportunity.purchaseOwnerId] : [])], {
      type: "WORKFLOW",
      title: `Customer ${label} quote v${q.version}: ${q.opportunity.name}`,
      body: response === "ACCEPTED" ? "Mark the deal Won when the PO arrives." : note,
      link: `/opportunities/${q.opportunityId}?tab=quotes`,
      exclude: user.id,
    });
    await recomputeOpportunity(tx, q.opportunityId);
  });
  refresh(q.opportunityId);
  return { ok: true };
});

/** Why the deal's lines no longer match a quote ("line 3 changed"), or null when they still do */
async function quoteDifference(oppId: string, snapshot: unknown, tx: Tx = db) {
  const lines = await tx.opportunityLineItem.findMany({
    where: { opportunityId: oppId },
    orderBy: { lineNo: "asc" },
    select: { lineNo: true, partNumber: true, description: true, quantity: true, unit: true, billingFrequency: true, termMonths: true, unitPrice: true, gstRatePct: true, product: { select: { gstRatePct: true } } },
  });
  const current = lines.map(quotedLine);
  return quoteMatchesLines(snapshot, current) !== false ? null : firstDifference(snapshot, current) ?? "lines changed";
}

/**
 * The customer needs more time and nothing about the deal changed: extend the latest quote instead of re-issuing it.
 * Only while its lines still match, and never past the supplier prices behind it.
 */
export const extendQuoteValidity = safeAction("extendQuoteValidity", async function extendQuoteValidity(quoteId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const q = await db.quote.findUnique({ where: { id: quoteId }, include: { opportunity: true } });
  if (!q || !(await visibleOpp(user, q.opportunityId))) return { ok: false, error: "Quote not found." };
  if (!can.createQuote(user, q.opportunity)) return { ok: false, error: "Only the deal owner or a manager can change a quote." };
  if (isClosed(q.opportunity.stage)) return { ok: false, error: "This deal is closed." };
  const latest = await db.quote.findFirst({ where: { opportunityId: q.opportunityId }, orderBy: { version: "desc" }, select: { id: true } });
  if (latest?.id !== q.id || !["SUBMITTED", "ACCEPTED"].includes(q.status)) return { ok: false, error: "Only the latest quote with the customer can be extended." };
  const parsed = z.object({ validTill: day, reason: z.string().trim().max(500).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const until = parsed.data.validTill;
  if (isPast(until) || until <= q.validTill) return { ok: false, error: "Pick a date later than the current validity.", fieldErrors: { validTill: "Later than now" } };
  const diff = await quoteDifference(q.opportunityId, q.snapshot);
  if (diff) return { ok: false, error: `The deal changed after quote v${q.version} (${diff}). Send a revised quote instead.` };
  const purchase = await db.opportunityLineItem.findMany({ where: { opportunityId: q.opportunityId, isEstimate: false, costSource: "PURCHASE" }, select: { lineNo: true, costValidTill: true, pricingStatus: true } });
  const cap = maxQuoteValidity(purchase.map((l) => l.costValidTill));
  if (cap && until > endOfDayIST(cap))
    return { ok: false, error: `Supplier prices hold only until ${fmtDate(cap)}. Ask purchase to re-validate them (Re-validate costs) before extending past that.`, fieldErrors: { validTill: `At most ${fmtDate(cap)}` } };
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quoteId }, data: { validTill: until, remindedAt: null } });
    await recordEvent(tx, {
      entityType: "Opportunity", entityId: q.opportunityId, action: "QUOTE_EXTENDED", userId: user.id,
      oldValue: fmtDate(q.validTill), newValue: `${q.code} v${q.version} valid till ${fmtDate(until)}${parsed.data.reason ? ` · ${parsed.data.reason}` : ""}`,
    });
    await recomputeOpportunity(tx, q.opportunityId);
  });
  refresh(q.opportunityId);
  return { ok: true };
});

/**
 * Agree a new due date for an open request (the escalation message asks for exactly this). The requester, the
 * assignee, the deal owner or a manager can; the other side is told.
 */
export const changeDueDate = safeAction("changeDueDate", async function changeDueDate(kind: ReqKind, requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await loadRequest(kind, requestId);
  if (!r || !(await visibleOpp(user, r.opportunityId))) return { ok: false, error: "Request not found." };
  const open = (kind === "presales" ? OPEN_PRESALES : OPEN_PRICING) as readonly string[];
  if (!open.includes(r.status)) return { ok: false, error: "Only open requests have a due date to change." };
  if (!isManager(user) && ![r.assignedToId, r.requestedById, r.opportunity.salesOwnerId].includes(user.id)) return { ok: false, error: "Not allowed." };
  const parsed = z.object({ dueDate: day, reason: z.string().trim().min(3, "Say why the date moves").max(500) }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (isPast(parsed.data.dueDate)) return { ok: false, error: "Due date is in the past.", fieldErrors: { dueDate: "In the past" } };
  await db.$transaction(async (tx) => {
    const data = { dueDate: parsed.data.dueDate, remindedAt: null, escalatedAt: null };
    const where = { id: requestId, status: { in: [...open] } };
    const done = kind === "presales" ? await tx.presalesRequest.updateMany({ where: where as Prisma.PresalesRequestWhereInput, data }) : await tx.pricingRequest.updateMany({ where: where as Prisma.PricingRequestWhereInput, data });
    if (!done.count) throw new UserError("This request was just closed. Reload the page.");
    await recordEvent(tx, {
      entityType: "Opportunity", entityId: r.opportunityId, action: "REQUEST_DUE_CHANGED", userId: user.id,
      oldValue: fmtDate(r.dueDate), newValue: `${kind === "presales" ? "BOQ" : "Pricing"} due ${fmtDate(parsed.data.dueDate)} · ${parsed.data.reason}`,
    });
    await notify(tx, [r.assignedToId, r.requestedById, r.opportunity.salesOwnerId], {
      type: "WORKFLOW",
      title: `New due date for the ${kind === "presales" ? "BOQ" : "pricing"}: ${r.opportunity.name}`,
      body: `${user.name} moved it from ${fmtDate(r.dueDate)} to ${fmtDate(parsed.data.dueDate)}: ${parsed.data.reason}`,
      link: boqLink(r.opportunityId),
      exclude: user.id,
    });
    await recomputeOpportunity(tx, r.opportunityId);
  });
  refresh(r.opportunityId);
  return { ok: true };
});
