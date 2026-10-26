import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { deriveWorkflow, specLock, OPEN_PRESALES, OPEN_PRICING } from "@/lib/workflow";
import { toNumber } from "@/lib/format";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { boqTotals } from "@/lib/boq";

export async function getOpportunityDetail(user: CurrentUser, id: string) {
  const exists = await db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] }, select: { id: true } });
  if (!exists) notFound();
  const evaluation = await recomputeOpportunity(db, id);
  const o = await db.opportunity.findUniqueOrThrow({
    where: { id },
    include: {
      account: { select: { id: true, name: true, code: true, city: true, segment: true, industry: true } },
      primaryContact: { select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true } },
      businessUnit: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      oem: { select: { id: true, name: true } },
      salesOwner: { select: { id: true, name: true, email: true } },
      presalesOwner: { select: { id: true, name: true } },
      purchaseOwner: { select: { id: true, name: true } },
      contacts: { include: { contact: { select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true, mobile: true } } } },
      lineItems: { orderBy: { lineNo: "asc" }, include: { oem: { select: { name: true } }, businessUnit: { select: { name: true } }, category: { select: { name: true } }, product: { select: { listPrice: true, standardCost: true } } } },
      presalesRequests: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { name: true } }, assignedTo: { select: { id: true, name: true } } } },
      pricingRequests: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { name: true } }, assignedTo: { select: { id: true, name: true } } } },
      quotes: { orderBy: { version: "desc" } },
      activities: { orderBy: [{ occurredAt: "desc" }], take: 100, include: { owner: { select: { name: true } }, contact: { select: { firstName: true, lastName: true } } } },
      stageHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { name: true } } } },
    },
  });
  const [audit, accountContacts] = await Promise.all([
    db.auditLog.findMany({
      where: { entityType: "Opportunity", entityId: id },
      orderBy: { changedAt: "desc" },
      take: 150,
      include: { changedBy: { select: { name: true } } },
    }),
    db.contact.findMany({
      where: { accountId: o.accountId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, title: true, role: true },
      orderBy: { firstName: "asc" },
    }),
  ]);
  const showCost = can.viewCost(user);
  const lines = o.lineItems.map((l) => ({
    id: l.id,
    lineNo: l.lineNo,
    productId: l.productId,
    businessUnitId: l.businessUnitId,
    categoryId: l.categoryId,
    oemId: l.oemId,
    oemName: l.oem.name,
    buName: l.businessUnit.name,
    categoryName: l.category.name,
    partNumber: l.partNumber,
    description: l.description,
    isEstimate: l.isEstimate,
    quantity: toNumber(l.quantity),
    unit: l.unit,
    billingFrequency: l.billingFrequency,
    termMonths: l.termMonths,
    hsnSac: l.hsnSac,
    gstRatePct: l.gstRatePct === null ? null : toNumber(l.gstRatePct),
    unitCost: showCost && l.unitCost !== null ? toNumber(l.unitCost) : null,
    distributor: showCost ? l.distributor : null,
    oemQuoteRef: showCost ? l.oemQuoteRef : null,
    leadTimeDays: l.leadTimeDays,
    pricingStatus: l.pricingStatus,
    /** Costed once, but the specification changed since: purchase must re-confirm */
    costStale: !l.isEstimate && l.pricingStatus === "PENDING" && l.unitCost !== null,
    unitPrice: l.unitPrice !== null ? toNumber(l.unitPrice) : null,
    listPrice: l.product?.listPrice ? toNumber(l.product.listPrice) : null,
    standardCost: l.product?.standardCost ? toNumber(l.product.standardCost) : null,
    billingStatus: l.billingStatus,
    lockedAt: l.lockedAt,
    notes: l.notes,
  }));
  const totals = boqTotals(o.lineItems);
  const now = new Date();
  const ps = o.presalesRequests[0] ?? null;
  const pq = o.pricingRequests[0] ?? null;
  const workflow = deriveWorkflow({
    stage: o.stage,
    lines: o.lineItems.map((l) => ({ pricingStatus: l.pricingStatus, unitCost: l.unitCost === null ? null : toNumber(l.unitCost), unitPrice: l.unitPrice === null ? null : toNumber(l.unitPrice), isEstimate: l.isEstimate })),
    presales: ps && { ...ps, assignee: ps.assignedTo.name },
    pricing: pq && { ...pq, assignee: pq.assignedTo.name },
    quote: o.quotes[0] ?? null,
    now,
  });
  const openPs = o.presalesRequests.find((r) => (OPEN_PRESALES as readonly string[]).includes(r.status));
  const openPq = o.pricingRequests.find((r) => (OPEN_PRICING as readonly string[]).includes(r.status));
  const lockReason = specLock({ presalesOpen: openPs ? { assigneeId: openPs.assignedToId } : null, pricingOpen: !!openPq, userId: user.id, isManager: isManager(user) });
  return {
    workflow,
    lockReason,
    opp: {
      ...o,
      amount: toNumber(o.amount),
      arrAmount: o.arrAmount === null ? null : toNumber(o.arrAmount),
      expectedMarginPct: o.expectedMarginPct === null ? null : toNumber(o.expectedMarginPct),
      lineItems: undefined,
      quotes: o.quotes.map((q) => ({
        ...q,
        totalPrice: toNumber(q.totalPrice),
        totalCost: showCost ? toNumber(q.totalCost) : null,
        marginPct: showCost ? toNumber(q.marginPct) : null,
      })),
      stageHistory: o.stageHistory.map((s) => ({ ...s, amount: toNumber(s.amount) })),
    },
    lines,
    totals: { ...totals, totalCost: showCost ? totals.totalCost : null, marginPct: showCost ? totals.marginPct : null },
    evaluation,
    audit,
    accountContacts,
    viewer: { id: user.id, role: user.role },
    perms: {
      edit: can.editOpportunity(user, o),
      requestPresales: can.requestPresales(user, o),
      spec: can.editBoqSpec(user, o) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      cost: can.editBoqCost(user) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      price: can.editBoqPrice(user, o) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      viewCost: showCost,
      quote: can.createQuote(user, o),
      delete: can.deleteRecords(user),
    },
  };
}

export type OppDetail = Awaited<ReturnType<typeof getOpportunityDetail>>;
