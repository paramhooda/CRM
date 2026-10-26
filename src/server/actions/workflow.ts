"use server";
// Sales → Presales → Purchase → Sales workflow: BOQ requests and revisions, questions, send-backs, pricing,
// BOQ editing (with locks and concurrency checks) and quotes with customer responses.
// The deal's workflow state is derived from these records by `deriveWorkflow` (src/lib/workflow.ts).
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db, type Tx } from "@/lib/db";
import { requireUser, type CurrentUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { recordEvent, recordChanges } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { nextCode } from "@/lib/sequence";
import { boqTotals, lineMultiplier } from "@/lib/boq";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { toNumber, fmtDate } from "@/lib/format";
import { THRESHOLDS, STAGE_META, CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { OPEN_PRESALES, OPEN_PRICING, resumeDueDate, specChanged, specLock } from "@/lib/workflow";
import { zodErrors, type ActionResult } from "@/lib/validation";
import { applyStageChange, UserError } from "@/server/domain/stage";
import { lineInputSchema, resolveSpec, rollUpDeal } from "@/server/domain/lines";

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

/** Lines that are part of the real BOQ (not quick estimates) and still need a current cost from purchase. */
function needsCost(l: { isEstimate: boolean; pricingStatus: string; unitCost: unknown }) {
  return !l.isEstimate && (l.pricingStatus !== "QUOTED" || l.unitCost === null);
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
  dueDate: z.coerce.date(),
  scope: z.string().trim().min(10, "Describe the scope in a sentence or two").max(4000),
  reason: z.string().trim().max(2000).optional(),
  priority: z.enum(["NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
});

/**
 * Ask presales for a BOQ, or for a revision of it. A revision supersedes any pricing in progress
 * (purchase would otherwise price the wrong thing) and records why it was needed.
 */
export async function requestPresales(oppId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.requestPresales(user, opp)) return { ok: false, error: "Only the deal owner or a manager can pull in presales." };
  if (isClosed(opp.stage)) return { ok: false, error: "This deal is closed." };
  const parsed = presalesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  if (v.dueDate.getTime() < Date.now() - DAY) return { ok: false, error: "Due date is in the past.", fieldErrors: { dueDate: "Due date is in the past" } };
  const assignee = await db.user.findFirst({ where: { id: v.assignedToId, role: "PRESALES", active: true } });
  if (!assignee) return { ok: false, error: "Selected user is not an active presales engineer." };
  const previous = await db.presalesRequest.findMany({ where: { opportunityId: oppId }, orderBy: { revision: "desc" } });
  if (previous.some((p) => (OPEN_PRESALES as readonly string[]).includes(p.status)))
    return { ok: false, error: "A presales request is already open on this deal." };
  const revision = (previous[0]?.revision ?? 0) + 1;
  if (revision > 1 && (!v.reason || v.reason.length < 5)) return { ok: false, error: "Say what needs to change in this revision.", fieldErrors: { reason: "Say what needs to change" } };
  const latestQuote = await db.quote.findFirst({ where: { opportunityId: oppId }, orderBy: { version: "desc" } });
  const source = latestQuote?.status === "CHANGES_REQUESTED" ? "CUSTOMER" : "SALES";

  const res = await run(() =>
    db.$transaction(async (tx) => {
      const supersede = await tx.pricingRequest.findMany({ where: { opportunityId: oppId, status: openPricing } });
      for (const p of supersede) {
        await tx.pricingRequest.update({ where: { id: p.id }, data: { status: "CANCELLED", cancelReason: `Superseded by BOQ revision ${revision}` } });
        await notify(tx, [p.assignedToId], {
          type: "WORKFLOW",
          title: `Pricing on hold: ${opp.name}`,
          body: `${user.name} asked presales for BOQ revision ${revision}. Stop pricing; a new request will follow. Reason: ${v.reason}`,
          link: boqLink(oppId),
          exclude: user.id,
        });
      }
      await tx.presalesRequest.create({
        data: {
          opportunityId: oppId, requestedById: user.id, assignedToId: v.assignedToId, dueDate: v.dueDate, scope: v.scope, priority: v.priority,
          revision, source, reason: revision > 1 ? v.reason : v.reason || null,
        },
      });
      await tx.opportunity.update({ where: { id: oppId }, data: { presalesOwnerId: v.assignedToId, updatedById: user.id } });
      await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: opp, after: { presalesOwnerId: v.assignedToId }, fields: ["presalesOwnerId"], userId: user.id });
      await recordEvent(tx, {
        entityType: "Opportunity", entityId: oppId, userId: user.id,
        action: revision > 1 ? "BOQ_REVISION_REQUESTED" : "PRESALES_REQUESTED",
        newValue: revision > 1 ? `Revision ${revision} · ${assignee.name} · ${v.reason}` : assignee.name,
      });
      await notify(tx, [v.assignedToId], {
        type: "PRESALES_REQUEST",
        title: revision > 1 ? `BOQ revision ${revision}: ${opp.name}` : `BOQ requested: ${opp.name}`,
        body: `${user.name} ${revision > 1 ? `needs changes: ${v.reason}` : "pulled you in"}${v.priority !== "NORMAL" ? ` (${v.priority.toLowerCase()} priority)` : ""}. Due ${fmtDate(v.dueDate)}.`,
        link: boqLink(oppId),
      });
      await syncStage(tx, user, oppId, "BOQ");
      await recomputeOpportunity(tx, oppId);
    }),
  );
  if (res.ok) refresh(oppId);
  return res;
}

async function presalesForAssignee(user: CurrentUser, requestId: string) {
  const r = await db.presalesRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || (r.assignedToId !== user.id && !isManager(user))) return null;
  return r;
}

export async function startPresales(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await presalesForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (r.status !== "REQUESTED") return { ok: true };
  await db.presalesRequest.update({ where: { id: requestId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  refresh(r.opportunityId);
  return { ok: true };
}

/** Presales needs an answer from sales. The request pauses; its due date moves out by the time spent waiting. */
export async function askSales(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
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
}

/** Sales answers the presales question; the request resumes with its due date extended. */
export async function answerPresales(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await db.presalesRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || !(await visibleOpp(user, r.opportunityId))) return { ok: false, error: "Request not found." };
  if (!can.requestPresales(user, r.opportunity) && r.requestedById !== user.id) return { ok: false, error: "Only the deal owner or a manager can answer." };
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
}

const submitBoqSchema = z.object({
  solutionSummary: z.string().trim().min(10, "Add a short solution summary").max(4000),
  purchaseUserId: z.string().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Presales hands over the BOQ. Purchase is asked to price only the lines without a current cost
 * (new lines, or lines whose specification changed). If nothing needs a cost, the deal goes straight to quoting.
 */
export async function submitBoq(requestId: string, input: Record<string, unknown>): Promise<ActionResult<{ pricing: boolean }>> {
  const user = await requireUser();
  const r = await presalesForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (!(OPEN_PRESALES as readonly string[]).includes(r.status)) return { ok: false, error: "This request is already closed." };
  const parsed = submitBoqSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const opp = r.opportunity;

  const res = await run(() =>
    db.$transaction(async (tx) => {
      const count = await assertRealBoq(tx, r.opportunityId, "submitting");
      const lines = await tx.opportunityLineItem.findMany({ where: { opportunityId: r.opportunityId } });
      const pending = lines.filter(needsCost);
      const now = new Date();
      await tx.presalesRequest.update({
        where: { id: requestId },
        data: { status: "BOQ_SUBMITTED", submittedAt: now, solutionSummary: parsed.data.solutionSummary, startedAt: r.startedAt ?? now },
      });
      await recordEvent(tx, {
        entityType: "Opportunity", entityId: r.opportunityId, action: "BOQ_SUBMITTED", userId: user.id,
        newValue: `Revision ${r.revision} · ${count} lines${pending.length ? ` · ${pending.length} to price` : " · no cost changes"}`,
      });
      if (pending.length) {
        const purchaseId = await purchaseFor(tx, parsed.data.purchaseUserId || opp.purchaseOwnerId);
        const kind = r.revision > 1 ? "REPRICE" : "FULL";
        await tx.opportunityLineItem.updateMany({ where: { id: { in: pending.map((l) => l.id) } }, data: { pricingStatus: "PENDING" } });
        await tx.pricingRequest.create({
          data: {
            opportunityId: r.opportunityId, presalesRequestId: r.id, requestedById: user.id, assignedToId: purchaseId, kind,
            reason: r.reason, dueDate: parsed.data.dueDate ?? new Date(now.getTime() + THRESHOLDS.pricingSlaDays * DAY), notes: parsed.data.notes || null,
          },
        });
        await tx.opportunity.update({ where: { id: r.opportunityId }, data: { purchaseOwnerId: purchaseId } });
        await notify(tx, [purchaseId], {
          type: "PRICING_REQUEST",
          title: `${kind === "REPRICE" ? "Re-pricing" : "Pricing"} requested: ${opp.name}`,
          body: kind === "REPRICE"
            ? `BOQ revision ${r.revision}: ${pending.length} of ${count} lines changed and need a cost. ${r.reason ?? ""}`.trim()
            : `${user.name} submitted a ${count}-line BOQ. Get OEM / distributor pricing.`,
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
      return { pricing: pending.length > 0 };
    }),
  );
  if (res.ok) refresh(r.opportunityId);
  return res;
}

// ───────────── Pricing ─────────────

const pricingSchema = z.object({
  assignedToId: z.string().optional(),
  dueDate: z.coerce.date(),
  reason: z.string().trim().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * Ask purchase for pricing without presales: a BOQ built by sales, a changed line, or re-validating costs
 * that have expired. With nothing changed, every line is re-validated.
 */
export async function requestPricing(oppId: string, input: Record<string, unknown>): Promise<ActionResult<{ kind: string }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.editBoqSpec(user, opp)) return { ok: false, error: "Only the deal owner, presales owner or a manager can request pricing." };
  if (isClosed(opp.stage)) return { ok: false, error: "This deal is closed." };
  const parsed = pricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const res = await run(() =>
    db.$transaction(async (tx) => {
      if (await tx.presalesRequest.count({ where: { opportunityId: oppId, status: openPresales } }))
        throw new UserError("Presales is working on the BOQ. Pricing is requested automatically when they submit it.");
      if (await tx.pricingRequest.count({ where: { opportunityId: oppId, status: openPricing } }))
        throw new UserError("A pricing request is already open on this deal.");
      await assertRealBoq(tx, oppId, "requesting pricing");
      const lines = await tx.opportunityLineItem.findMany({ where: { opportunityId: oppId } });
      const pending = lines.filter(needsCost);
      const previous = await tx.pricingRequest.count({ where: { opportunityId: oppId, status: { not: "CANCELLED" } } });
      const kind = pending.length ? (previous ? "REPRICE" : "FULL") : "REVALIDATE";
      if (kind !== "FULL" && (!parsed.data.reason || parsed.data.reason.length < 5))
        throw new UserError(kind === "REVALIDATE" ? "Say why the costs need re-validating." : "Say what changed so purchase knows what to price.");
      const purchaseId = await purchaseFor(tx, parsed.data.assignedToId || opp.purchaseOwnerId);
      const target = kind === "REVALIDATE" ? lines.filter((l) => !l.isEstimate) : pending;
      await tx.opportunityLineItem.updateMany({ where: { id: { in: target.map((l) => l.id) } }, data: { pricingStatus: "PENDING" } });
      await tx.pricingRequest.create({
        data: { opportunityId: oppId, requestedById: user.id, assignedToId: purchaseId, kind, reason: parsed.data.reason || null, dueDate: parsed.data.dueDate, notes: parsed.data.notes || null },
      });
      await tx.opportunity.update({ where: { id: oppId }, data: { purchaseOwnerId: purchaseId } });
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
      return { kind };
    }),
  );
  if (res.ok) refresh(oppId);
  return res;
}

async function pricingForAssignee(user: CurrentUser, requestId: string) {
  const r = await db.pricingRequest.findUnique({ where: { id: requestId }, include: { opportunity: true } });
  if (!r || (r.assignedToId !== user.id && !isManager(user))) return null;
  return r;
}

export async function startPricing(requestId: string): Promise<ActionResult> {
  const user = await requireUser();
  const r = await pricingForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (r.status === "REQUESTED") await db.pricingRequest.update({ where: { id: requestId }, data: { status: "IN_PROGRESS", startedAt: new Date() } });
  refresh(r.opportunityId);
  return { ok: true };
}

const completePricingSchema = z.object({
  quoteValidTill: z.coerce.date(),
  responseNotes: z.string().max(2000).optional(),
});

export async function completePricing(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await pricingForAssignee(user, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  if (!(OPEN_PRICING as readonly string[]).includes(r.status)) return { ok: false, error: "This request is already closed." };
  const parsed = completePricingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (parsed.data.quoteValidTill.getTime() < Date.now() - DAY) return { ok: false, error: "Supplier pricing validity is in the past.", fieldErrors: { quoteValidTill: "Already expired" } };
  const missing = await db.opportunityLineItem.findMany({ where: { opportunityId: r.opportunityId, isEstimate: false, unitCost: null }, select: { lineNo: true } });
  if (missing.length) return { ok: false, error: `Line ${missing.map((l) => l.lineNo).join(", ")} still need${missing.length === 1 ? "s" : ""} a unit cost.` };
  await db.$transaction(async (tx) => {
    const now = new Date();
    await tx.pricingRequest.update({
      where: { id: requestId },
      data: { status: "QUOTED", quotedAt: now, startedAt: r.startedAt ?? now, quoteValidTill: parsed.data.quoteValidTill, responseNotes: parsed.data.responseNotes || null },
    });
    await tx.opportunityLineItem.updateMany({ where: { opportunityId: r.opportunityId, isEstimate: false }, data: { pricingStatus: "QUOTED" } });
    await recordEvent(tx, { entityType: "Opportunity", entityId: r.opportunityId, action: "PRICING_COMPLETED", userId: user.id, newValue: `Valid till ${fmtDate(parsed.data.quoteValidTill)}` });
    await notify(tx, [r.opportunity.salesOwnerId, r.opportunity.presalesOwnerId, r.requestedById], {
      type: "PRICING_COMPLETE",
      title: `Pricing ready: ${r.opportunity.name}`,
      body: `${user.name} added costs, valid till ${fmtDate(parsed.data.quoteValidTill)}. Set sell prices and generate the quote.`,
      link: boqLink(r.opportunityId),
      exclude: user.id,
    });
    await recomputeOpportunity(tx, r.opportunityId);
  });
  refresh(r.opportunityId);
  return { ok: true };
}

/**
 * Purchase cannot price the BOQ as specified (wrong part, end-of-life, no distributor, unclear scope).
 * It goes back to presales as a new revision, or to sales when presales was never involved.
 */
export async function returnToPresales(requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
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
      await tx.pricingRequest.update({ where: { id: requestId }, data: { status: "RETURNED", returnReason: reason, returnedAt: now, startedAt: r.startedAt ?? now } });
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
}

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
export async function reassignRequest(kind: ReqKind, requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await loadRequest(kind, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  const open = (kind === "presales" ? OPEN_PRESALES : OPEN_PRICING) as readonly string[];
  if (!open.includes(r.status)) return { ok: false, error: "Only open requests can be reassigned." };
  if (!isManager(user) && r.assignedToId !== user.id && r.opportunity.salesOwnerId !== user.id) return { ok: false, error: "Not allowed." };
  const parsed = z.object({ assignedToId: z.string().min(1, "Choose who takes it over"), note: z.string().trim().max(1000).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (parsed.data.assignedToId === r.assignedToId) return { ok: true };
  const role = kind === "presales" ? "PRESALES" : "PURCHASE";
  const to = await db.user.findFirst({ where: { id: parsed.data.assignedToId, role, active: true } });
  if (!to) return { ok: false, error: `Choose an active ${role.toLowerCase()} user.` };
  const oppId = r.opportunityId;
  await db.$transaction(async (tx) => {
    const data = { assignedToId: to.id, remindedAt: null, escalatedAt: null };
    if (kind === "presales") await tx.presalesRequest.update({ where: { id: requestId }, data });
    else await tx.pricingRequest.update({ where: { id: requestId }, data });
    const field = kind === "presales" ? "presalesOwnerId" : "purchaseOwnerId";
    await tx.opportunity.update({ where: { id: oppId }, data: { [field]: to.id } });
    await recordChanges(tx, { entityType: "Opportunity", entityId: oppId, before: r.opportunity, after: { [field]: to.id }, fields: [field], userId: user.id });
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "REQUEST_REASSIGNED", userId: user.id, newValue: `${r.assignedTo.name} → ${to.name}${parsed.data.note ? ` · ${parsed.data.note}` : ""}` });
    await notify(tx, [to.id], {
      type: kind === "presales" ? "PRESALES_REQUEST" : "PRICING_REQUEST",
      title: `${kind === "presales" ? "BOQ" : "Pricing"} request handed to you: ${r.opportunity.name}`,
      body: `${user.name} reassigned it from ${r.assignedTo.name}. Due ${fmtDate(r.dueDate)}.${parsed.data.note ? ` ${parsed.data.note}` : ""}`,
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
}

/** Withdraw an open request with a reason. The assignee is told so they stop work. */
export async function cancelRequest(kind: ReqKind, requestId: string, input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const r = await loadRequest(kind, requestId);
  if (!r) return { ok: false, error: "Request not found." };
  const open = (kind === "presales" ? OPEN_PRESALES : OPEN_PRICING) as readonly string[];
  if (!open.includes(r.status)) return { ok: false, error: "This request is already closed." };
  if (!isManager(user) && r.opportunity.salesOwnerId !== user.id && r.requestedById !== user.id) return { ok: false, error: "Only the deal owner, the requester or a manager can cancel." };
  const parsed = z.object({ reason: z.string().trim().min(3, "Give a reason").max(1000) }).safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const oppId = r.opportunityId;
  await db.$transaction(async (tx) => {
    const data = { status: "CANCELLED" as const, cancelReason: parsed.data.reason };
    if (kind === "presales") await tx.presalesRequest.update({ where: { id: requestId }, data });
    else await tx.pricingRequest.update({ where: { id: requestId }, data });
    await recordEvent(tx, { entityType: "Opportunity", entityId: oppId, action: "REQUEST_CANCELLED", userId: user.id, newValue: `${kind === "presales" ? "BOQ" : "Pricing"} request · ${parsed.data.reason}` });
    await notify(tx, [r.assignedToId], {
      type: "WORKFLOW",
      title: `${kind === "presales" ? "BOQ" : "Pricing"} request cancelled: ${r.opportunity.name}`,
      body: `${user.name}: ${parsed.data.reason}. No further work needed.`,
      link: boqLink(oppId),
      exclude: user.id,
    });
    await recomputeOpportunity(tx, oppId);
  });
  refresh(oppId);
  return { ok: true };
}

// ───────────── Line items (BOQ) ─────────────

/**
 * Save the BOQ. Rules:
 * - `version` must match the deal's BOQ version, so two people cannot overwrite each other's work.
 * - Specification is locked while purchase is pricing, and to the assignee while presales is working on it.
 * - A costed line whose specification changes is flagged for re-pricing.
 * - "To be decided" OEM is only allowed on estimate lines.
 */
export async function saveBoq(oppId: string, rawLines: unknown[], version?: number): Promise<ActionResult<{ version: number }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  const parsed = z.array(lineInputSchema).max(200).safeParse(rawLines);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (!parsed.data.length) return { ok: false, error: "A deal needs at least one line item. Its OEM, BU and value come from the lines." };
  const spec = can.editBoqSpec(user, opp);
  const cost = can.editBoqCost(user);
  const price = can.editBoqPrice(user, opp);
  if (!spec && !cost && !price) return { ok: false, error: "You cannot edit these line items." };
  if (isClosed(opp.stage)) return { ok: false, error: "Line items are locked on closed deals." };

  const dec = (n: number | null | undefined) => (n === null || n === undefined ? null : new Prisma.Decimal(n));
  const num = (d: Prisma.Decimal | null) => (d === null ? null : toNumber(d));
  const res = await run(() =>
    db.$transaction(async (tx) => {
      // Optimistic concurrency: claim the next version atomically, or fail if someone saved first
      const next = (version ?? opp.boqVersion) + 1;
      const claimed = await tx.opportunity.updateMany({ where: { id: oppId, boqVersion: version ?? opp.boqVersion }, data: { boqVersion: next } });
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
        const costData = { unitCost: dec(l.unitCost), distributor: l.distributor || null, oemQuoteRef: l.oemQuoteRef || null, leadTimeDays: l.leadTimeDays ?? null };
        const priceData = { unitPrice: dec(l.unitPrice) };
        const specData = spec ? await resolveSpec(tx, l, opp.contractTermMonths) : null;
        if (specData && !specData.isEstimate && tbd.has(specData.oemId))
          throw new UserError(`Line ${lineNo}: choose the OEM. "To be decided" is only allowed on estimate lines.`);
        if (!cur) {
          if (!spec) continue;
          if (lock) throw new UserError(lock);
          await tx.opportunityLineItem.create({
            data: { opportunityId: oppId, lineNo, ...specData!, ...(cost ? costData : {}), ...(price ? priceData : {}), createdById: user.id, updatedById: user.id },
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
        const costChanged = cost && (num(cur.unitCost) !== (l.unitCost ?? null) || (cur.distributor ?? null) !== (l.distributor || null));
        if (cost) Object.assign(data, costData);
        if (price) Object.assign(data, priceData);
        if (cost && costChanged) data.pricingStatus = l.unitCost !== null && l.unitCost !== undefined ? "QUOTED" : "PENDING";
        else if (changedSpec && cur.pricingStatus === "QUOTED") {
          // Purchase priced a different specification: the cost stays as a reference but must be re-confirmed
          data.pricingStatus = "PENDING";
          repriced++;
        } else if (cost && !changedSpec && l.unitCost !== null && l.unitCost !== undefined) data.pricingStatus = "QUOTED";
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
    }),
  );
  if (res.ok) refresh(oppId);
  return res;
}

// ───────────── Quotes ─────────────

const quoteSchema = z.object({
  validTill: z.coerce.date(),
  terms: z.string().max(4000).optional(),
  /** When set, every line is priced at this gross margin on its cost before the quote is created */
  marginPct: z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).max(90).optional()),
});

export async function createQuote(oppId: string, input: Record<string, unknown>): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const opp = await visibleOpp(user, oppId);
  if (!opp) return { ok: false, error: "Opportunity not found." };
  if (!can.createQuote(user, opp)) return { ok: false, error: "Only the deal owner or a manager can issue quotes." };
  if (isClosed(opp.stage)) return { ok: false, error: "This deal is closed." };
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  if (parsed.data.validTill.getTime() < Date.now() - DAY) return { ok: false, error: "Quote validity is in the past.", fieldErrors: { validTill: "Validity is in the past" } };
  const res = await run(() =>
    db.$transaction(async (tx) => {
      if (await tx.presalesRequest.count({ where: { opportunityId: oppId, status: openPresales } }))
        throw new UserError("Presales is still working on the BOQ. Quote once they submit it.");
      if (await tx.pricingRequest.count({ where: { opportunityId: oppId, status: openPricing } }))
        throw new UserError("Purchase is still pricing the BOQ. Quote once pricing is complete.");
      await assertRealBoq(tx, oppId, "quoting");
      const m = parsed.data.marginPct;
      if (m !== undefined) {
        const costed = await tx.opportunityLineItem.findMany({ where: { opportunityId: oppId, isEstimate: false, unitCost: { not: null } }, select: { id: true, unitCost: true } });
        for (const l of costed)
          await tx.opportunityLineItem.update({ where: { id: l.id }, data: { unitPrice: new Prisma.Decimal(Math.round(toNumber(l.unitCost) / (1 - m / 100))), updatedById: user.id } });
      }
      const lines = await tx.opportunityLineItem.findMany({
        where: { opportunityId: oppId },
        orderBy: { lineNo: "asc" },
        include: { oem: { select: { name: true } }, product: { select: { hsnSac: true } } },
      });
      const t = boqTotals(lines);
      const pending = lines.filter(needsCost).map((l) => l.lineNo);
      if (pending.length) throw new UserError(`Line ${pending.join(", ")} changed since purchase priced ${pending.length > 1 ? "them" : "it"}. Request pricing first.`);
      if (!t.fullyPriced) throw new UserError("Every BOQ line needs a sell price before quoting.");
      if (!t.fullyCosted) throw new UserError("Pricing from Purchase is incomplete.");
      const pricing = await tx.pricingRequest.findFirst({ where: { opportunityId: oppId, status: "QUOTED" }, orderBy: { quotedAt: "desc" } });
      if (pricing?.quoteValidTill && pricing.quoteValidTill < new Date())
        throw new UserError(`Supplier pricing expired on ${fmtDate(pricing.quoteValidTill)}. Ask purchase to re-validate it before quoting.`);

      const last = await tx.quote.findFirst({ where: { opportunityId: oppId }, orderBy: { version: "desc" } });
      await tx.quote.updateMany({ where: { opportunityId: oppId, status: { in: ["DRAFT", "SUBMITTED", "CHANGES_REQUESTED"] } }, data: { status: "SUPERSEDED" } });
      const code = await nextCode(tx, "QT");
      const q = await tx.quote.create({
        data: {
          code, opportunityId: oppId, version: (last?.version ?? 0) + 1, status: "SUBMITTED", submittedAt: new Date(),
          totalPrice: new Prisma.Decimal(Math.round(t.totalPrice)), totalCost: new Prisma.Decimal(Math.round(t.totalCost)),
          marginPct: new Prisma.Decimal(Math.round((t.marginPct ?? 0) * 100) / 100), validTill: parsed.data.validTill,
          terms: parsed.data.terms || null, createdById: user.id,
          snapshot: lines.map((l) => ({
            lineNo: l.lineNo, oem: l.oem?.name ?? null, partNumber: l.partNumber, description: l.description,
            quantity: toNumber(l.quantity), unit: l.unit, billingFrequency: l.billingFrequency, termMonths: l.termMonths,
            hsnSac: l.hsnSac ?? l.product?.hsnSac ?? null,
            unitPrice: toNumber(l.unitPrice), extended: lineMultiplier(l) * toNumber(l.unitPrice),
          })),
        },
      });
      const amount = new Prisma.Decimal(Math.round(t.totalPrice));
      await tx.opportunity.update({
        where: { id: oppId },
        data: { amount, expectedMarginPct: new Prisma.Decimal(Math.round((t.marginPct ?? 0) * 100) / 100), lastActivityAt: new Date() },
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
}

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
export async function recordQuoteResponse(quoteId: string, input: Record<string, unknown>): Promise<ActionResult> {
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
  await db.$transaction(async (tx) => {
    await tx.quote.update({ where: { id: quoteId }, data: { status: response, respondedAt: new Date(), responseNote: note || null } });
    const label = response === "ACCEPTED" ? "accepted" : response === "REJECTED" ? "rejected" : "asked for changes to";
    await recordEvent(tx, { entityType: "Opportunity", entityId: q.opportunityId, action: "QUOTE_RESPONSE", userId: user.id, newValue: `Customer ${label} ${q.code} v${q.version}${note ? ` · ${note}` : ""}` });
    await tx.opportunity.update({ where: { id: q.opportunityId }, data: { lastActivityAt: new Date() } });
    await notify(tx, [q.opportunity.salesOwnerId, q.opportunity.presalesOwnerId], {
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
}
