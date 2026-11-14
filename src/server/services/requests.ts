import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound, ValidationError } from "../errors";
import { recordEvent } from "../audit";
import { canEditDeal, dealWhere, isManager } from "../authz/scope";
import { toDate } from "@/contracts/common";
import type { RequestActionInput } from "@/contracts/stages";
import { loadDeal, todayDate } from "./deals";

const include = {
  assignedTo: { select: { id: true, fullName: true } },
  requestedBy: { select: { id: true, fullName: true } },
  deal: { select: { id: true, code: true, name: true, stage: true, ownerId: true, account: { select: { id: true, name: true } }, owner: { select: { id: true, fullName: true } }, _count: { select: { lines: true } } } },
} as const;

type Kind = "presales" | "pricing";
const OPEN = ["REQUESTED", "IN_PROGRESS"] as const;

function model(kind: Kind) {
  return kind === "presales" ? db.presalesRequest : db.pricingRequest;
}

/** Requests the actor may see: their own assignments, or requests on deals in their scope. */
export async function listRequests(actor: Actor, kind: Kind, f: { status?: string; mine?: boolean; dealId?: string }) {
  const where: Prisma.PresalesRequestWhereInput & Prisma.PricingRequestWhereInput = {
    status: f.status ? (f.status as never) : undefined,
    dealId: f.dealId,
    ...(actor.role === "PRESALES" || actor.role === "PURCHASE" || f.mine ? { assignedToId: actor.id } : { deal: await dealWhere(actor) }),
  };
  const rows = await (model(kind) as typeof db.presalesRequest).findMany({ where, include, orderBy: [{ dueDate: "asc" }, { requestedAt: "asc" }] });
  return { rows: rows.map((r) => ({ ...r, overdue: (OPEN as readonly string[]).includes(r.status) && r.dueDate < todayDate() })) };
}

async function assigneeOfRole(id: string, role: "PRESALES" | "PURCHASE", field: string) {
  const u = await db.user.findFirst({ where: { id, role, isActive: true } });
  if (!u) throw new ValidationError(role === "PRESALES" ? "Pick a presales engineer." : "Pick a buyer.", { [field]: "Pick someone with the right role." });
  return u;
}

function checkDue(iso: string) {
  const d = toDate(iso);
  if (d < todayDate()) throw new ValidationError("The due date can't be in the past.", { dueDate: "Can't be in the past." });
  return d;
}

export async function createRequest(actor: Actor, kind: Kind, dealId: string, input: { assignedToId: string; dueDate: string; scope?: string; notes?: string | null }, requestId: string) {
  const deal = await loadDeal(actor, dealId);
  const assignedPresales = actor.role === "PRESALES" && deal.presalesRequests.some((r) => r.assignedToId === actor.id && (OPEN as readonly string[]).includes(r.status));
  const mayRaise = (await canEditDeal(actor, deal)) || (kind === "pricing" && assignedPresales);
  if (!mayRaise) throw new Forbidden(kind === "presales" ? "Only the deal owner or a manager can ask presales." : "Only the deal owner, their manager or the assigned presales engineer can ask purchase.");
  if (deal.stage !== "QUALIFIED" && deal.stage !== "BOQ") throw new Conflict(`A ${kind} request can be raised while the deal is in Qualified or BOQ, not ${deal.stage.toLowerCase().replace("_", " ")}.`, "WRONG_STAGE");
  const open = (kind === "presales" ? deal.presalesRequests : deal.pricingRequests).find((r) => (OPEN as readonly string[]).includes(r.status));
  if (open) throw new Conflict(`There is already an open ${kind} request on this deal.`, "ALREADY_OPEN");
  await assigneeOfRole(input.assignedToId, kind === "presales" ? "PRESALES" : "PURCHASE", "assignedToId");
  const dueDate = checkDue(input.dueDate);
  const row = await db.$transaction(async (tx) => {
    const r =
      kind === "presales"
        ? await tx.presalesRequest.create({ data: { dealId, requestedById: actor.id, assignedToId: input.assignedToId, dueDate, scope: input.scope ?? "" }, include })
        : await tx.pricingRequest.create({ data: { dealId, requestedById: actor.id, assignedToId: input.assignedToId, dueDate, notes: input.notes ?? null }, include });
    if (kind === "presales") await tx.deal.update({ where: { id: dealId }, data: { presalesOwnerId: input.assignedToId, needsPresales: true } });
    await recordEvent(tx, { entityType: `${kind}_request`, entityId: r.id, dealId, action: "CREATE", userId: actor.id, requestId, newValue: `${kind === "presales" ? "BOQ" : "Pricing"} requested from ${r.assignedTo.fullName}, due ${input.dueDate}` });
    return r;
  });
  return row;
}

export async function actOnRequest(actor: Actor, kind: Kind, id: string, input: RequestActionInput, requestId: string) {
  const r = await (model(kind) as typeof db.presalesRequest).findUnique({ where: { id }, include });
  if (!r) throw new NotFound();
  const deal = await loadDeal(actor, r.dealId); // 404 outside scope
  const isAssignee = r.assignedToId === actor.id;
  const mayManage = (await canEditDeal(actor, deal)) || r.requestedById === actor.id || isManager(actor);
  const open = (OPEN as readonly string[]).includes(r.status);
  const now = new Date();
  const data: Record<string, unknown> = {};
  let note = "";

  switch (input.action) {
    case "START":
      if (!isAssignee && actor.role !== "ADMIN") throw new Forbidden("Only the person it is assigned to can start it.");
      if (r.status !== "REQUESTED") throw new Conflict("This request has already been started.", "WRONG_STATUS");
      Object.assign(data, { status: "IN_PROGRESS", startedAt: now });
      note = "started";
      break;
    case "SUBMIT":
    case "COMPLETE": {
      if ((kind === "presales") !== (input.action === "SUBMIT")) throw new ValidationError(kind === "presales" ? "A presales request is submitted." : "A pricing request is completed.");
      if (!isAssignee && actor.role !== "ADMIN") throw new Forbidden("Only the person it is assigned to can finish it.");
      if (!open) throw new Conflict("This request is no longer open.", "WRONG_STATUS");
      if (kind === "presales") {
        if (!input.summary) throw new ValidationError("Add a short summary of the BOQ.", { summary: "Required." });
        if (deal.lines.length === 0) throw new Conflict("Add the lines before submitting the BOQ.", "NO_LINES");
        Object.assign(data, { status: "SUBMITTED", submittedAt: now, summary: input.summary });
        note = "BOQ submitted";
      } else {
        const missing = deal.lines.filter((l) => !l.oem.isOwnIp && l.unitPurchaseCost === null).map((l) => l.lineNo);
        if (missing.length) throw new Conflict(`Enter the purchase cost on line${missing.length > 1 ? "s" : ""} ${missing.join(", ")} first.`, "LINES_UNCOSTED");
        Object.assign(data, { status: "COMPLETED", completedAt: now, completionNotes: input.completionNotes ?? null });
        note = "pricing completed";
      }
      break;
    }
    case "CANCEL":
      if (!mayManage) throw new Forbidden("Only the person who raised it, the deal owner or a manager can cancel it.");
      if (!open) throw new Conflict("This request is no longer open.", "WRONG_STATUS");
      Object.assign(data, { status: "CANCELLED", cancelledAt: now });
      note = "cancelled";
      break;
    case "REASSIGN": {
      if (!mayManage) throw new Forbidden("Only the person who raised it, the deal owner or a manager can reassign it.");
      if (!open) throw new Conflict("This request is no longer open.", "WRONG_STATUS");
      if (input.assignedToId) {
        await assigneeOfRole(input.assignedToId, kind === "presales" ? "PRESALES" : "PURCHASE", "assignedToId");
        data.assignedToId = input.assignedToId;
      }
      if (input.dueDate) data.dueDate = checkDue(input.dueDate);
      if (!Object.keys(data).length) throw new ValidationError("Pick a new person or due date.");
      note = "reassigned";
      break;
    }
  }
  const updated = await db.$transaction(async (tx) => {
    const u = kind === "presales" ? await tx.presalesRequest.update({ where: { id }, data, include }) : await tx.pricingRequest.update({ where: { id }, data, include });
    if (kind === "presales" && data.assignedToId) await tx.deal.update({ where: { id: r.dealId }, data: { presalesOwnerId: data.assignedToId as string } });
    await recordEvent(tx, { entityType: `${kind}_request`, entityId: id, dealId: r.dealId, action: "UPDATE", userId: actor.id, requestId, field: "status", oldValue: r.status, newValue: `${(data.status as string) ?? r.status} (${note})` });
    return u;
  });
  return updated;
}
