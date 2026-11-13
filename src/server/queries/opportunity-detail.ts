import { quoteMatchesLines, quotedLine } from "@/lib/quote";
import "server-only";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { deriveWorkflow, specLock, OPEN_PRESALES, OPEN_PRICING } from "@/lib/workflow";
import { stageMoves, pathFor, checkSkip } from "@/lib/stage-rules";
import { loadStageFacts } from "@/server/domain/stage-facts";
import { toNumber } from "@/lib/format";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { boqTotals } from "@/lib/boq";
import { costExpired } from "@/lib/costing";
import { uploadKinds, visibleKinds } from "@/lib/documents";
import { CLOSED_STAGES, type StageKey } from "@/lib/constants";

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
      salesOwner: { select: { id: true, name: true, email: true, manager: { select: { id: true, name: true, active: true } } } },
      presalesOwner: { select: { id: true, name: true } },
      purchaseOwner: { select: { id: true, name: true } },
      contacts: { where: { contact: { deletedAt: null } }, include: { contact: { select: { id: true, firstName: true, lastName: true, title: true, email: true, phone: true, mobile: true } } } },
      lineItems: { orderBy: { lineNo: "asc" }, include: { oem: { select: { name: true, ownBrand: true } }, businessUnit: { select: { name: true } }, category: { select: { name: true, rateCard: true } }, product: { select: { listPrice: true, standardCost: true, gstRatePct: true } } } },
      presalesRequests: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } } } },
      pricingRequests: { orderBy: { createdAt: "desc" }, include: { requestedBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } } } },
      quotes: { orderBy: { version: "desc" } },
      activities: { orderBy: [{ occurredAt: "desc" }], take: 100, include: { owner: { select: { name: true } }, contact: { select: { firstName: true, lastName: true } } } },
      stageHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { name: true } } } },
    },
  });
  // Presales and purchase see their part of the deal only: no sell prices, margin, quotes' money, activity or audit
  const sales = can.viewSales(user);
  const [audit, accountContacts] = !sales ? [[], []] : await Promise.all([
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
  const now = new Date();
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
    ownBrand: l.oem.ownBrand,
    /** The line's category uses the rate card (Cloud, NOC, SOC) */
    rateCard: l.category.rateCard,
    costSource: l.costSource,
    costValidTill: l.costValidTill,
    costNote: showCost ? l.costNote : null,
    /** Costed once, but the specification changed since: the cost must be re-confirmed */
    costStale: !l.isEstimate && l.pricingStatus === "PENDING" && l.unitCost !== null && (l.needsReprice || l.costSource !== "PURCHASE"),
    costExpired: costExpired(l, now),
    unitPrice: sales && l.unitPrice !== null ? toNumber(l.unitPrice) : null,
    listPrice: sales && l.product?.listPrice ? toNumber(l.product.listPrice) : null,
    standardCost: l.product?.standardCost ? toNumber(l.product.standardCost) : null,
    billingStatus: l.billingStatus,
    lockedAt: l.lockedAt,
    notes: l.notes,
  }));
  const totals = boqTotals(o.lineItems);
  const ps = o.presalesRequests[0] ?? null;
  const pq = o.pricingRequests[0] ?? null;
  const workflow = deriveWorkflow({
    stage: o.stage,
    lines: o.lineItems.map((l) => ({
      lineNo: l.lineNo, pricingStatus: l.pricingStatus, costSource: l.costSource, costValidTill: l.costValidTill, isEstimate: l.isEstimate,
      unitCost: l.unitCost === null ? null : toNumber(l.unitCost), unitPrice: l.unitPrice === null ? null : toNumber(l.unitPrice),
    })),
    presales: ps && { ...ps, assignee: ps.assignedTo.name },
    pricing: pq && { ...pq, assignee: pq.assignedTo.name },
    quote: o.quotes[0] ? { ...o.quotes[0], matchesLines: quoteMatchesLines(o.quotes[0].snapshot, o.lineItems.map(quotedLine)) ?? undefined } : null,
    now,
  });
  const openPs = o.presalesRequests.find((r) => (OPEN_PRESALES as readonly string[]).includes(r.status));
  const openPq = o.pricingRequests.find((r) => (OPEN_PRICING as readonly string[]).includes(r.status));
  const lockReason = specLock({ presalesOpen: openPs ? { assigneeId: openPs.assignedToId } : null, pricingOpen: !!openPq, userId: user.id, isManager: isManager(user) });
  const facts = (await loadStageFacts(db, [id], now)).get(id)!;
  // Documents this viewer may see (never the file contents here)
  const kinds = visibleKinds(user.role);
  const documents = await db.opportunityDocument.findMany({
    where: { opportunityId: id, ...(kinds ? { OR: [{ uploadedById: user.id }, { kind: { in: kinds } }] } : {}) },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, kind: true, fileName: true, mimeType: true, sizeBytes: true, note: true, createdAt: true,
      uploadedBy: { select: { id: true, name: true } }, presalesRequest: { select: { id: true, revision: true } }, pricingRequest: { select: { id: true, kind: true } },
    },
  });
  const actor = { canEdit: can.editOpportunity(user, o), isManager: isManager(user) };
  const moves = stageMoves(facts, actor);
  return {
    moves,
    facts: { closeDatePast: facts.closeDatePast },
    path: pathFor(facts),
    canSkip: checkSkip(facts, actor).allowed,
    workflow,
    lockReason,
    documents,
    documentKinds: uploadKinds(user.role),
    opp: {
      ...o,
      amount: sales ? toNumber(o.amount) : 0,
      arrAmount: sales && o.arrAmount !== null ? toNumber(o.arrAmount) : null,
      expectedMarginPct: sales && o.expectedMarginPct !== null ? toNumber(o.expectedMarginPct) : null,
      lineItems: undefined,
      activities: sales ? o.activities : [],
      quotes: o.quotes.map((q) => ({
        ...q,
        totalPrice: sales ? toNumber(q.totalPrice) : 0,
        totalCost: sales && showCost ? toNumber(q.totalCost) : null,
        marginPct: sales && showCost ? toNumber(q.marginPct) : null,
        snapshot: sales ? q.snapshot : [],
        terms: sales ? q.terms : null,
      })),
      stageHistory: o.stageHistory.map((s) => ({ ...s, amount: sales ? toNumber(s.amount) : 0 })),
    },
    lines,
    totals: {
      ...totals,
      totalPrice: sales ? totals.totalPrice : 0, recurringValue: sales ? totals.recurringValue : 0,
      totalCost: showCost ? totals.totalCost : null, marginPct: sales && showCost ? totals.marginPct : null,
    },
    evaluation: sales ? evaluation : null,
    audit,
    accountContacts,
    viewer: { id: user.id, role: user.role, isManager: isManager(user) },
    perms: {
      edit: can.editOpportunity(user, o),
      requestPresales: can.requestPresales(user, o),
      spec: can.editBoqSpec(user, o) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      cost: can.editBoqCost(user) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      internalCost: can.editInternalCost(user, o) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      price: can.editBoqPrice(user, o) && !["WON", "LOST", "DROPPED"].includes(o.stage),
      viewCost: showCost,
      sales,
      quote: can.createQuote(user, o),
      /** Send quotes: sales managers. The deal owner sets the prices and hands them over. */
      sendQuote: can.sendQuote(user) && sales,
      delete: can.deleteRecords(user),
      addDocument: can.addDocument(user, { ...o, closed: CLOSED_STAGES.includes(o.stage as StageKey) }),
    },
  };
}

export type OppDetail = Awaited<ReturnType<typeof getOpportunityDetail>>;
