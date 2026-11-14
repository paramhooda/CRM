import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db, type Tx } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound, ValidationError } from "../errors";
import { recordChanges, recordEvent } from "../audit";
import { assertCanEditDeal, assertOwnerInScope, assertPermission, canEditDeal, dealWhere, isManager, notVisible, usersLite, visibleOwnerIds } from "../authz/scope";
import { shapeDeal } from "../authz/shape";
import { nextCode } from "../sequence";
import { paged, type Pagination } from "../http";
import { toDate } from "@/contracts/common";
import type { CreateDealInput, DealListQuery, LineInput, LinesPatchInput, PatchDealInput } from "@/contracts/deals";
import { defaultNeedsPresales, deriveLine, lineFieldWhitelist, lineValidationErrors, rollupDeal, type LineField } from "@/domain/lines";
import { allowedMoves, isOpen, STAGE_META, type ApprovalState, type DealFacts, type Stage } from "@/domain/stages";
import { canUploadDocument, nextActions, requestBlockers, type People, type Viewer } from "@/domain/workflow";
import { approvalState as computeApprovalState, matchRules, priceFingerprint } from "@/domain/approvals";
import { dateOnly, istDate, parsePeriodKey } from "@/domain/fiscal";
import { orderBy } from "./accounts";

export const OPEN_REQUEST_PRESALES = ["REQUESTED", "IN_PROGRESS"] as const;
export const OPEN_REQUEST_PRICING = ["REQUESTED", "IN_PROGRESS"] as const;

// ───────────── Selects ─────────────

export const lineSelect = {
  id: true, lineNo: true, productId: true, description: true, businessUnitId: true, subBusinessUnitId: true, oemId: true, quantity: true, unit: true, revenueModel: true, termMonths: true,
  unitSalesPrice: true, unitPurchaseCost: true, costSetById: true, costSetAt: true, salesMethodId: true, annualValue: true, lineValue: true, lineCost: true, expectedGmPct: true, updatedAt: true,
  product: { select: { id: true, code: true, name: true } },
  businessUnit: { select: { id: true, name: true, colourToken: true } },
  subBusinessUnit: { select: { id: true, name: true } },
  oem: { select: { id: true, name: true, isOwnIp: true } },
  salesMethod: { select: { id: true, name: true } },
} satisfies Prisma.DealLineSelect;

export const dealListSelect = {
  id: true, code: true, name: true, stage: true, stageEnteredAt: true, forecastCategory: true, expectedCloseDate: true, dealValue: true, annualRecurringValue: true, expectedGmPct: true, needsPresales: true, nextStep: true, nextStepDate: true, updatedAt: true, createdAt: true, deletedAt: true, closedAt: true, version: true,
  account: { select: { id: true, code: true, name: true } },
  owner: { select: { id: true, fullName: true } },
  presalesOwner: { select: { id: true, fullName: true } },
  primaryBusinessUnit: { select: { id: true, name: true, colourToken: true } },
  primaryOem: { select: { id: true, name: true } },
  lines: { select: { businessUnitId: true, oemId: true, businessUnit: { select: { id: true, name: true, colourToken: true } } } },
} satisfies Prisma.DealSelect;

export const dealDetailInclude = {
  account: { select: { id: true, code: true, name: true, ownerId: true } },
  primaryContact: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, mobile: true, designation: true } },
  owner: { select: { id: true, fullName: true, managerId: true } },
  presalesOwner: { select: { id: true, fullName: true } },
  leadSource: { select: { id: true, name: true } },
  lossReason: { select: { id: true, name: true } },
  primaryBusinessUnit: { select: { id: true, name: true, colourToken: true } },
  primaryOem: { select: { id: true, name: true } },
  lines: { select: lineSelect, orderBy: { lineNo: "asc" } },
  presalesRequests: { orderBy: { requestedAt: "desc" }, include: { assignedTo: { select: { id: true, fullName: true } }, requestedBy: { select: { id: true, fullName: true } } } },
  pricingRequests: { orderBy: { requestedAt: "desc" }, include: { assignedTo: { select: { id: true, fullName: true } }, requestedBy: { select: { id: true, fullName: true } } } },
  documents: { where: { deletedAt: null }, orderBy: { uploadedAt: "desc" }, select: { id: true, fileName: true, contentType: true, sizeBytes: true, description: true, uploadedAt: true, kind: { select: { id: true, name: true, restrictedToSales: true, requiredAtWon: true } }, uploadedBy: { select: { id: true, fullName: true } } } },
  approvals: { orderBy: { requestedAt: "desc" }, take: 5, include: { steps: { orderBy: { stepNo: "asc" } }, requestedBy: { select: { id: true, fullName: true } } } },
} satisfies Prisma.DealInclude;

export type DealDetailRecord = Prisma.DealGetPayload<{ include: typeof dealDetailInclude }>;

// ───────────── Facts, moves and approval state ─────────────

export async function activeRules() {
  return db.approvalRule.findMany({ where: { isActive: true, deletedAt: null }, include: { steps: { orderBy: { stepNo: "asc" } } }, orderBy: { sortOrder: "asc" } });
}

export function rulesMatchFor(deal: { expectedGmPct: Prisma.Decimal | null; dealValue: Prisma.Decimal; lines: { businessUnitId: string }[] }, rules: Awaited<ReturnType<typeof activeRules>>) {
  return matchRules(
    rules.map((r) => ({ ...r, gmBelowPct: r.gmBelowPct?.toString() ?? null, dealValueAtLeast: r.dealValueAtLeast?.toString() ?? null })),
    { gmPct: deal.expectedGmPct?.toString() ?? null, dealValue: deal.dealValue.toString(), businessUnitIds: [...new Set(deal.lines.map((l) => l.businessUnitId))] },
  );
}

export function approvalStateFor(deal: DealDetailRecord, rules: Awaited<ReturnType<typeof activeRules>>): ApprovalState {
  const latest = deal.approvals[0] ?? null;
  return computeApprovalState({ rulesMatch: rulesMatchFor(deal, rules).length > 0, fingerprint: deal.priceFingerprint ?? "", latest: latest ? { status: latest.status, priceFingerprint: latest.priceFingerprint } : null });
}

export function todayDate(now = new Date()): Date {
  const { year, month, day } = istDate(now);
  return dateOnly(year, month, day);
}

const isOpenRequest = (r: { status: string }) => (OPEN_REQUEST_PRESALES as readonly string[]).includes(r.status);

export function dealFacts(deal: DealDetailRecord, approval: ApprovalState, approvalRules: string[] = []): DealFacts {
  const thirdParty = deal.lines.filter((l) => !l.oem.isOwnIp);
  return {
    stage: deal.stage,
    heldFromStage: deal.heldFromStage,
    lastOpenStage: deal.lastOpenStage,
    needsPresales: deal.needsPresales,
    deleted: !!deal.deletedAt,
    lineCount: deal.lines.length,
    unpricedLines: deal.lines.filter((l) => l.unitSalesPrice === null).length,
    uncostedLines: deal.lines.filter((l) => l.unitPurchaseCost === null).length,
    thirdPartyLines: thirdParty.length,
    uncostedThirdPartyLines: thirdParty.filter((l) => l.unitPurchaseCost === null).length,
    presalesDocuments: deal.documents.filter((d) => !d.kind.restrictedToSales).length,
    presalesRequest: deal.presalesRequests[0]?.status ?? null,
    pricingRequest: deal.pricingRequests[0]?.status ?? null,
    openPresalesRequest: deal.presalesRequests.some(isOpenRequest),
    openPricingRequest: deal.pricingRequests.some(isOpenRequest),
    approvalState: approval,
    approvalRules,
    hasPrimaryContact: !!deal.primaryContactId,
    closeDatePast: deal.expectedCloseDate < todayDate(),
    hasPoDocument: deal.documents.some((d) => d.kind.requiredAtWon),
  };
}

/** Who the actor is to this deal, for the workflow rules. Assignment means the open request of that kind. */
export async function viewerFor(actor: Actor, deal: DealDetailRecord): Promise<Viewer> {
  const latest = deal.approvals[0];
  const step = latest?.status === "PENDING" ? latest.steps.find((s) => s.stepNo === latest.currentStep) : undefined;
  return {
    role: actor.role,
    canEdit: await canEditDeal(actor, deal),
    isManager: isManager(actor),
    isAssignedPresales: actor.role === "PRESALES" && deal.presalesRequests.some((r) => r.assignedToId === actor.id && isOpenRequest(r)),
    isAssignedPurchase: actor.role === "PURCHASE" && deal.pricingRequests.some((r) => r.assignedToId === actor.id && isOpenRequest(r)),
    isApprover: !!step && step.approverUserIds.includes(actor.id) && latest!.requestedById !== actor.id,
  };
}

export function peopleFor(deal: DealDetailRecord): People {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const presales = deal.presalesRequests.find(isOpenRequest);
  const pricing = deal.pricingRequests.find(isOpenRequest);
  return { owner: deal.owner.fullName, presales: presales?.assignedTo.fullName ?? deal.presalesOwner?.fullName ?? null, purchase: pricing?.assignedTo.fullName ?? null, presalesDue: presales ? iso(presales.dueDate) : null, pricingDue: pricing ? iso(pricing.dueDate) : null };
}

// ───────────── List ─────────────

export async function dealListWhere(actor: Actor, f: DealListQuery): Promise<Prisma.DealWhereInput> {
  const stages = f.stage ? (Array.isArray(f.stage) ? f.stage : [f.stage]) : undefined;
  const period = parsePeriodKey(f.period);
  const lineFilter: Prisma.DealLineWhereInput = { businessUnitId: f.bu, subBusinessUnitId: f.sub_bu, oemId: f.oem };
  return {
    AND: [
      await dealWhere(actor, { includeDeleted: f.includeDeleted }),
      {
        stage: stages ? { in: stages } : f.open ? { in: ["QUALIFIED", "BOQ", "PROPOSAL_SUBMITTED", "NEGOTIATION", "HOLD"] } : undefined,
        ownerId: f.owner,
        forecastCategory: f.forecast,
        accountId: f.account_id,
        expectedCloseDate: period ? { gte: period.from, lte: period.to } : undefined,
        ...(f.bu || f.sub_bu || f.oem ? { lines: { some: lineFilter } } : {}),
        ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { code: { contains: f.q, mode: "insensitive" } }, { account: { name: { contains: f.q, mode: "insensitive" } } }] } : {}),
      },
    ],
  };
}

const SORTS: Record<string, (d: "asc" | "desc") => Prisma.DealOrderByWithRelationInput> = {
  name: (d) => ({ name: d }),
  code: (d) => ({ code: d }),
  account: (d) => ({ account: { name: d } }),
  owner: (d) => ({ owner: { fullName: d } }),
  stage: (d) => ({ stage: d }),
  dealValue: (d) => ({ dealValue: d }),
  expectedGmPct: (d) => ({ expectedGmPct: d }),
  expectedCloseDate: (d) => ({ expectedCloseDate: d }),
  updatedAt: (d) => ({ updatedAt: d }),
  createdAt: (d) => ({ createdAt: d }),
};

export function toListRow(actor: Actor, d: Prisma.DealGetPayload<{ select: typeof dealListSelect }>) {
  const bus = new Map(d.lines.map((l) => [l.businessUnit.id, l.businessUnit]));
  const { lines: _lines, ...rest } = d;
  const row = {
    ...rest,
    stageLabel: STAGE_META[d.stage].label,
    daysInStage: Math.floor((Date.now() - d.stageEnteredAt.getTime()) / 86_400_000),
    dealValue: d.dealValue.toString(),
    annualRecurringValue: d.annualRecurringValue.toString(),
    expectedGmPct: d.expectedGmPct?.toString() ?? null,
    businessUnits: [...bus.values()],
    lineCount: d.lines.length,
  };
  return shapeDeal(actor, row);
}
export type DealListRow = ReturnType<typeof toListRow>;

export async function listDeals(actor: Actor, f: DealListQuery, p: Pagination) {
  const where = await dealListWhere(actor, f);
  const [rows, total, totals] = await Promise.all([
    db.deal.findMany({ where, select: dealListSelect, orderBy: orderBy(SORTS, p.sort, { updatedAt: "desc" }), skip: (p.page - 1) * p.pageSize, take: p.pageSize }),
    db.deal.count({ where }),
    actor.role === "PRESALES" || actor.role === "PURCHASE" ? null : db.deal.aggregate({ where, _sum: { dealValue: true, annualRecurringValue: true } }),
  ]);
  return { ...paged(rows.map((r) => toListRow(actor, r)), total, p), totals: totals ? { dealValue: totals._sum.dealValue?.toString() ?? "0", annualRecurringValue: totals._sum.annualRecurringValue?.toString() ?? "0" } : null };
}

export async function allDeals(actor: Actor, f: DealListQuery, sort?: string) {
  const where = await dealListWhere(actor, f);
  const rows = await db.deal.findMany({ where, select: dealListSelect, orderBy: orderBy(SORTS, sort, { updatedAt: "desc" }), take: 10_000 });
  return rows.map((r) => toListRow(actor, r));
}

// ───────────── Detail ─────────────

export async function loadDeal(actor: Actor, id: string, o?: { includeDeleted?: boolean }): Promise<DealDetailRecord> {
  const deal = await db.deal.findFirst({ where: { id, ...(await dealWhere(actor, o)) }, include: dealDetailInclude });
  if (!deal) notVisible("That deal");
  return deal;
}

function lineOut(l: DealDetailRecord["lines"][number]) {
  return {
    ...l,
    quantity: l.quantity.toString(),
    unitSalesPrice: l.unitSalesPrice?.toString() ?? null,
    unitPurchaseCost: l.unitPurchaseCost?.toString() ?? null,
    annualValue: l.annualValue?.toString() ?? null,
    lineValue: l.lineValue?.toString() ?? null,
    lineCost: l.lineCost?.toString() ?? null,
    expectedGmPct: l.expectedGmPct?.toString() ?? null,
  };
}

/** The line-editing context: who the actor is plus which requests are open (they freeze parts of the lines). */
async function editContext(actor: Actor, deal: DealDetailRecord) {
  const v = await viewerFor(actor, deal);
  return { ...v, dealOpen: isOpen(deal.stage) && !deal.deletedAt, openPresalesRequest: deal.presalesRequests.some(isOpenRequest), openPricingRequest: deal.pricingRequests.some(isOpenRequest) };
}

const whitelistFor = (ctx: Awaited<ReturnType<typeof editContext>>, ownIp: boolean) =>
  lineFieldWhitelist({ role: ctx.role, canEditDeal: ctx.canEdit, isAssignedPresales: ctx.isAssignedPresales, isAssignedPurchase: ctx.isAssignedPurchase, dealOpen: ctx.dealOpen, lineOwnIp: ownIp, openPresalesRequest: ctx.openPresalesRequest, openPricingRequest: ctx.openPricingRequest });

export async function dealView(actor: Actor, deal: DealDetailRecord) {
  const rules = await activeRules();
  const approval = approvalStateFor(deal, rules);
  const matched = rulesMatchFor(deal, rules);
  const facts = dealFacts(deal, approval, matched.map((m) => m.rule.name));
  const ctx = await editContext(actor, deal);
  const moves = allowedMoves(facts, { canEdit: ctx.canEdit, isManager: ctx.isManager });
  const whitelist = (ownIp: boolean) => [...whitelistFor(ctx, ownIp)];
  const ability = (kind: "presales" | "pricing") => {
    const reasons = requestBlockers(kind, facts, ctx);
    return { enabled: reasons.length === 0, reason: reasons[0] ?? null };
  };
  const salesSide = actor.role !== "PRESALES" && actor.role !== "PURCHASE";
  const view = {
    ...deal,
    stageLabel: STAGE_META[deal.stage].label,
    daysInStage: Math.floor((Date.now() - deal.stageEnteredAt.getTime()) / 86_400_000),
    dealValue: deal.dealValue.toString(),
    oneTimeValue: deal.oneTimeValue.toString(),
    annualRecurringValue: deal.annualRecurringValue.toString(),
    totalCost: deal.totalCost?.toString() ?? null,
    expectedGmPct: deal.expectedGmPct?.toString() ?? null,
    lines: deal.lines.map((l) => ({ ...lineOut(l), editable: whitelist(l.oem.isOwnIp) })),
    documents: deal.documents.filter((d) => salesSide || !d.kind.restrictedToSales),
    approvals: deal.approvals.map((a) => ({ ...a, dealValue: a.dealValue.toString(), gmPct: a.gmPct?.toString() ?? null })),
    approvalState: approval,
    approvalReasons: matched.flatMap((m) => m.reasons.map((r) => `${m.rule.name}: ${r}`)),
    approvalRules: matched.map((m) => m.rule.name),
    moves: salesSide ? moves : [],
    canEdit: ctx.canEdit && isOpen(deal.stage) && !deal.deletedAt,
    canEditLines: whitelist(false).length > 0 || whitelist(true).length > 0,
    lineEditable: { thirdParty: whitelist(false), ownIp: whitelist(true) },
    canUpload: canUploadDocument(ctx, deal.stage, !!deal.deletedAt),
    requestAbility: { presales: ability("presales"), pricing: ability("pricing") },
    next: nextActions(facts, ctx, peopleFor(deal)),
    facts,
  };
  return shapeDeal(actor, view);
}
export type DealView = Awaited<ReturnType<typeof dealView>>;

export async function getDeal(actor: Actor, id: string) {
  return dealView(actor, await loadDeal(actor, id, { includeDeleted: true }));
}

// ───────────── Create ─────────────

type LineRefs = { products: Map<string, Prisma.ProductGetPayload<{ select: { id: true; name: true; unit: true; revenueModel: true; defaultTermMonths: true; businessUnitId: true; subBusinessUnitId: true; oemId: true; standardCost: true } }>>; subs: Map<string, { id: string; businessUnitId: string; needsPresales: boolean }>; oems: Map<string, { id: string; isOwnIp: boolean }>; salesMethods: Set<string> };

async function lineRefs(): Promise<LineRefs> {
  const [products, subs, oems, sms] = await Promise.all([
    db.product.findMany({ where: { deletedAt: null }, select: { id: true, name: true, unit: true, revenueModel: true, defaultTermMonths: true, businessUnitId: true, subBusinessUnitId: true, oemId: true, standardCost: true } }),
    db.subBusinessUnit.findMany({ select: { id: true, businessUnitId: true, needsPresales: true } }),
    db.oem.findMany({ select: { id: true, isOwnIp: true } }),
    db.salesMethod.findMany({ select: { id: true } }),
  ]);
  return { products: new Map(products.map((p) => [p.id, p])), subs: new Map(subs.map((s) => [s.id, s])), oems: new Map(oems.map((o) => [o.id, o])), salesMethods: new Set(sms.map((s) => s.id)) };
}

type ResolvedLine = {
  productId: string | null; description: string; businessUnitId: string; subBusinessUnitId: string; oemId: string; quantity: string; unit: string;
  revenueModel: "ONE_TIME" | "ARR"; termMonths: number | null; unitSalesPrice: string | null; unitPurchaseCost: string | null; salesMethodId: string | null; ownIp: boolean;
};

/** Fills a line from its product (when given), checks the Sub BU belongs to the BU, and applies the line rules. */
function resolveLine(input: LineInput, refs: LineRefs, existing?: Partial<ResolvedLine>, lineNo = 0): ResolvedLine {
  const productId = input.productId === undefined ? existing?.productId ?? null : input.productId;
  const product = productId ? refs.products.get(productId) : undefined;
  if (productId && !product) throw new ValidationError("Pick a product from the catalogue.", { [`lines.${lineNo}.productId`]: "Not in the catalogue." });
  const businessUnitId = product?.businessUnitId ?? input.businessUnitId ?? existing?.businessUnitId;
  const subBusinessUnitId = product?.subBusinessUnitId ?? input.subBusinessUnitId ?? existing?.subBusinessUnitId;
  const oemId = product?.oemId ?? input.oemId ?? existing?.oemId;
  if (!businessUnitId || !subBusinessUnitId || !oemId) throw new ValidationError("Each line needs a product, or a business unit, Sub BU and OEM.", { [`lines.${lineNo}.subBusinessUnitId`]: "Required." });
  const sub = refs.subs.get(subBusinessUnitId);
  if (!sub || sub.businessUnitId !== businessUnitId) throw new ValidationError("That Sub BU is not in the chosen business unit.", { [`lines.${lineNo}.subBusinessUnitId`]: "Not in this business unit." });
  const oem = refs.oems.get(oemId);
  if (!oem) throw new ValidationError("Pick an OEM.", { [`lines.${lineNo}.oemId`]: "Pick an OEM." });
  const revenueModel = input.revenueModel ?? existing?.revenueModel ?? product?.revenueModel ?? "ONE_TIME";
  const termMonths = revenueModel === "ARR" ? input.termMonths ?? existing?.termMonths ?? product?.defaultTermMonths ?? null : null;
  const salesMethodId = oem.isOwnIp ? null : input.salesMethodId === undefined ? existing?.salesMethodId ?? null : input.salesMethodId;
  if (salesMethodId && !refs.salesMethods.has(salesMethodId)) throw new ValidationError("Pick a sales method.", { [`lines.${lineNo}.salesMethodId`]: "Pick a sales method." });
  const line: ResolvedLine = {
    productId: product?.id ?? null,
    description: (input.description || existing?.description || product?.name || "").trim(),
    businessUnitId, subBusinessUnitId, oemId,
    quantity: input.quantity ?? existing?.quantity ?? "1",
    unit: input.unit ?? existing?.unit ?? product?.unit ?? "Nos",
    revenueModel, termMonths,
    unitSalesPrice: input.unitSalesPrice === undefined ? existing?.unitSalesPrice ?? null : input.unitSalesPrice,
    // An own-IP catalogue line takes the product's standard cost unless someone sets a cost; a blank never clears it
    unitPurchaseCost: input.unitPurchaseCost ?? existing?.unitPurchaseCost ?? (oem.isOwnIp && product?.standardCost ? product.standardCost.toString() : null),
    salesMethodId,
    ownIp: oem.isOwnIp,
  };
  if (!line.description) throw new ValidationError("Each line needs a description.", { [`lines.${lineNo}.description`]: "Required." });
  const problems = lineValidationErrors(line, oem.isOwnIp);
  if (problems.length) throw new ValidationError(problems[0], { [`lines.${lineNo}.quantity`]: problems[0]! });
  return line;
}

/** Recomputes a deal's derived money, primary dimensions and price fingerprint from its lines. */
export async function recomputeDeal(tx: Tx, dealId: string, actorId: string, requestId: string) {
  const before = await tx.deal.findUniqueOrThrow({ where: { id: dealId }, select: { dealValue: true, oneTimeValue: true, annualRecurringValue: true, totalCost: true, expectedGmPct: true, primaryBusinessUnitId: true, primaryOemId: true, priceFingerprint: true } });
  const lines = await tx.dealLine.findMany({ where: { dealId }, orderBy: { lineNo: "asc" } });
  const roll = rollupDeal(lines.map((l) => ({ ...l, annualValue: l.annualValue?.toString() ?? null, lineValue: l.lineValue?.toString() ?? null, lineCost: l.lineCost?.toString() ?? null, expectedGmPct: l.expectedGmPct?.toString() ?? null })));
  const fingerprint = priceFingerprint(lines);
  await tx.deal.update({ where: { id: dealId }, data: { ...roll, priceFingerprint: fingerprint } });
  await recordChanges(tx, { entityType: "deal", entityId: dealId, dealId, userId: actorId, requestId, before: { ...before, dealValue: before.dealValue.toString(), expectedGmPct: before.expectedGmPct?.toString() ?? null, totalCost: before.totalCost?.toString() ?? null, annualRecurringValue: before.annualRecurringValue.toString() }, after: { dealValue: roll.dealValue, expectedGmPct: roll.expectedGmPct, totalCost: roll.totalCost, annualRecurringValue: roll.annualRecurringValue, primaryBusinessUnitId: roll.primaryBusinessUnitId, primaryOemId: roll.primaryOemId }, fields: ["dealValue", "expectedGmPct", "totalCost", "annualRecurringValue", "primaryBusinessUnitId", "primaryOemId"] });
  // An approval covers exactly the prices it was asked for
  if (before.priceFingerprint && before.priceFingerprint !== fingerprint) {
    const stale = await tx.dealApproval.updateMany({ where: { dealId, status: { in: ["PENDING", "APPROVED"] } }, data: { status: "SUPERSEDED", decidedAt: new Date() } });
    if (stale.count) await recordEvent(tx, { entityType: "deal", entityId: dealId, dealId, action: "UPDATE", userId: actorId, requestId, field: "approval", oldValue: "approved or pending", newValue: "superseded: lines changed" });
  }
  return roll;
}

export async function createDeal(actor: Actor, input: CreateDealInput, requestId: string) {
  assertPermission(actor, "deals.create");
  const ownerId = input.ownerId ?? actor.id;
  if (ownerId !== actor.id) await assertOwnerInScope(actor, ownerId);
  const owner = await db.user.findUnique({ where: { id: ownerId } });
  if (!owner || !owner.isActive || (owner.role !== "SALES" && owner.role !== "SALES_HEAD" && owner.role !== "ADMIN")) throw new ValidationError("The owner must be a sales person.", { ownerId: "Pick a sales person." });
  const account = await db.account.findFirst({ where: { id: input.accountId, deletedAt: null } });
  if (!account) throw new ValidationError("Pick an account.", { accountId: "Pick an account." });
  if (input.primaryContactId) {
    const c = await db.contact.findFirst({ where: { id: input.primaryContactId, accountId: account.id, deletedAt: null } });
    if (!c) throw new ValidationError("The contact must belong to the account.", { primaryContactId: "Not at this account." });
  }
  await assertLeadSource(input.leadSourceId);
  const refs = await lineRefs();
  const lines = (input.lines ?? []).map((l, i) => resolveLine(l, refs, undefined, i));
  const needsPresales = input.needsPresales ?? defaultNeedsPresales(lines.map((l) => l.subBusinessUnitId), [...refs.subs.values()]);
  const id = await db.$transaction((tx) => createDealInTx(tx, actor.id, { ...input, ownerId, accountId: account.id, needsPresales, lines }, requestId));
  return getDeal(actor, id);
}

export type NewDealRecord = Omit<CreateDealInput, "lines" | "ownerId" | "needsPresales"> & { ownerId: string; needsPresales: boolean; lines: ResolvedLine[]; note?: string };

/** Writes a new deal, its lines, roll-ups, first stage-history row and audit row. Validation happens before. */
export async function createDealInTx(tx: Tx, actorId: string, input: NewDealRecord, requestId: string): Promise<string> {
  const code = await nextCode(tx, "OPP");
  const deal = await tx.deal.create({
    data: {
      code, name: input.name, accountId: input.accountId, primaryContactId: input.primaryContactId ?? null, ownerId: input.ownerId, expectedCloseDate: toDate(input.expectedCloseDate), forecastCategory: input.forecastCategory,
      needsPresales: input.needsPresales, leadSourceId: input.leadSourceId ?? null, description: input.description ?? null, nextStep: input.nextStep ?? null, nextStepDate: input.nextStepDate ? toDate(input.nextStepDate) : null, createdById: actorId,
    },
  });
  for (const [i, l] of input.lines.entries()) {
    const { ownIp: _o, ...data } = l;
    await tx.dealLine.create({ data: { ...data, dealId: deal.id, lineNo: i + 1, ...deriveLine(l), updatedById: actorId, costSetById: l.unitPurchaseCost ? actorId : null, costSetAt: l.unitPurchaseCost ? new Date() : null } });
  }
  await recomputeDeal(tx, deal.id, actorId, requestId);
  await tx.dealStageHistory.create({ data: { dealId: deal.id, fromStage: null, toStage: "QUALIFIED", changedById: actorId, dealValueAtChange: (await tx.deal.findUniqueOrThrow({ where: { id: deal.id } })).dealValue, note: input.note ?? "Created" } });
  await recordEvent(tx, { entityType: "deal", entityId: deal.id, dealId: deal.id, action: "CREATE", userId: actorId, requestId, newValue: `${code} ${input.name}` });
  return deal.id;
}

async function assertLeadSource(id: string | null | undefined) {
  if (id && !(await db.leadSource.findUnique({ where: { id } }))) throw new ValidationError("Pick a lead source.", { leadSourceId: "Pick a lead source." });
}

// ───────────── Header update ─────────────

export function assertVersion(deal: { version: number }, version: number) {
  if (deal.version !== version) throw new Conflict("Someone else changed this deal. Reload to see the latest and try again.", "STALE");
}

export async function updateDeal(actor: Actor, id: string, input: PatchDealInput, requestId: string) {
  const deal = await loadDeal(actor, id);
  await assertCanEditDeal(actor, deal);
  assertVersion(deal, input.version);
  if (!isOpen(deal.stage) && deal.stage !== "HOLD") throw new Conflict("This deal is closed. Reopen it to make changes.", "CLOSED");
  if (input.primaryContactId) {
    const c = await db.contact.findFirst({ where: { id: input.primaryContactId, accountId: deal.accountId, deletedAt: null } });
    if (!c) throw new ValidationError("The contact must belong to the account.", { primaryContactId: "Not at this account." });
  }
  await assertLeadSource(input.leadSourceId);
  const { version: _v, ...fields } = input;
  const data: Prisma.DealUncheckedUpdateInput = {
    ...fields,
    expectedCloseDate: fields.expectedCloseDate ? toDate(fields.expectedCloseDate) : undefined,
    nextStepDate: fields.nextStepDate === undefined ? undefined : fields.nextStepDate ? toDate(fields.nextStepDate) : null,
    version: { increment: 1 },
  };
  await db.$transaction(async (tx) => {
    const after = await tx.deal.update({ where: { id }, data });
    await recordChanges(tx, { entityType: "deal", entityId: id, dealId: id, userId: actor.id, requestId, before: deal, after, fields: Object.keys(fields) as (keyof typeof after)[] });
  });
  return getDeal(actor, id);
}

export async function reassignDeal(actor: Actor, id: string, input: { ownerId?: string; presalesOwnerId?: string | null }, requestId: string) {
  const deal = await loadDeal(actor, id);
  const data: Prisma.DealUncheckedUpdateInput = {};
  if (input.ownerId && input.ownerId !== deal.ownerId) {
    if (!isManager(actor)) throw new Forbidden("Only a manager can change the deal owner.");
    await assertOwnerInScope(actor, deal.ownerId);
    await assertOwnerInScope(actor, input.ownerId);
    const owner = await db.user.findUnique({ where: { id: input.ownerId } });
    if (!owner || !owner.isActive || owner.role === "PRESALES" || owner.role === "PURCHASE") throw new ValidationError("The owner must be a sales person.", { ownerId: "Pick a sales person." });
    data.ownerId = input.ownerId;
  }
  if (input.presalesOwnerId !== undefined && input.presalesOwnerId !== deal.presalesOwnerId) {
    await assertCanEditDeal(actor, deal);
    if (input.presalesOwnerId) {
      const p = await db.user.findUnique({ where: { id: input.presalesOwnerId } });
      if (!p || !p.isActive || p.role !== "PRESALES") throw new ValidationError("Pick a presales engineer.", { presalesOwnerId: "Pick a presales engineer." });
    }
    data.presalesOwnerId = input.presalesOwnerId;
  }
  if (Object.keys(data).length) {
    await db.$transaction(async (tx) => {
      const after = await tx.deal.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
      await recordChanges(tx, { entityType: "deal", entityId: id, dealId: id, userId: actor.id, requestId, before: deal, after, fields: ["ownerId", "presalesOwnerId"] });
    });
  }
  return getDeal(actor, id);
}

// ───────────── Lines editor ─────────────

export async function saveLines(actor: Actor, id: string, input: LinesPatchInput, requestId: string) {
  const deal = await loadDeal(actor, id);
  assertVersion(deal, input.version);
  const ctx = await editContext(actor, deal);
  if (!ctx.dealOpen) throw new Conflict(deal.stage === "HOLD" ? "The deal is on hold. Resume it to change the lines." : "This deal is closed.", "CLOSED");
  const refs = await lineRefs();
  const allowed = (ownIp: boolean) => whitelistFor(ctx, ownIp);
  const existing = new Map(deal.lines.map((l) => [l.id, l]));
  const frozen = ctx.openPresalesRequest && !ctx.isAssignedPresales && actor.role !== "ADMIN" ? " Presales is working on the BOQ." : ctx.openPricingRequest && actor.role !== "ADMIN" ? " Purchase is pricing the lines; cancel the request to change what is sold." : "";
  const need = (set: Set<LineField>, f: LineField, what: string) => {
    if (!set.has(f)) throw new Forbidden(`You can't ${what} on this deal.${f === "cost" ? "" : frozen}`);
  };

  await db.$transaction(async (tx) => {
    for (const delId of input.deleteIds) {
      const l = existing.get(delId);
      if (!l) continue;
      need(allowed(l.oem.isOwnIp), "delete", "remove lines");
      await tx.dealLine.delete({ where: { id: delId } });
      await recordEvent(tx, { entityType: "deal_line", entityId: delId, dealId: id, action: "DELETE", userId: actor.id, requestId, oldValue: `Line ${l.lineNo}: ${l.description}` });
    }
    let nextNo = deal.lines.length ? Math.max(...deal.lines.map((l) => l.lineNo)) + 1 : 1;
    for (const [i, u] of input.upserts.entries()) {
      const cur = u.id ? existing.get(u.id) : undefined;
      if (u.id && !cur) throw new NotFound("One of the lines no longer exists. Reload the deal.");
      if (cur) {
        const prev: ResolvedLine = { ...cur, quantity: cur.quantity.toString(), unitSalesPrice: cur.unitSalesPrice?.toString() ?? null, unitPurchaseCost: cur.unitPurchaseCost?.toString() ?? null, ownIp: cur.oem.isOwnIp };
        const next = resolveLine(u, refs, prev, i);
        const set = allowed(next.ownIp);
        const specChanged = (["productId", "description", "businessUnitId", "subBusinessUnitId", "oemId", "quantity", "unit", "revenueModel", "termMonths"] as const).some((k) => String(prev[k] ?? "") !== String(next[k] ?? ""));
        const priceChanged = prev.unitSalesPrice !== next.unitSalesPrice || prev.salesMethodId !== next.salesMethodId;
        const costChanged = prev.unitPurchaseCost !== next.unitPurchaseCost;
        if (specChanged) need(set, "spec", "change what is sold");
        if (priceChanged) need(set, "price", "set sales prices");
        if (costChanged) need(set, "cost", "set purchase costs");
        const { ownIp: _o, ...data } = next;
        const after = await tx.dealLine.update({ where: { id: cur.id }, data: { ...data, ...deriveLine(next), updatedById: actor.id, ...(costChanged ? { costSetById: actor.id, costSetAt: new Date() } : {}) } });
        await recordChanges(tx, { entityType: "deal_line", entityId: cur.id, dealId: id, userId: actor.id, requestId, before: { ...prev, lineNo: cur.lineNo }, after: { ...data, lineNo: cur.lineNo }, fields: ["productId", "description", "businessUnitId", "subBusinessUnitId", "oemId", "quantity", "unit", "revenueModel", "termMonths", "unitSalesPrice", "unitPurchaseCost", "salesMethodId"] });
        void after;
      } else {
        const next = resolveLine(u, refs, undefined, i);
        need(allowed(next.ownIp), "spec", "add lines");
        if (next.unitSalesPrice !== null) need(allowed(next.ownIp), "price", "set sales prices");
        const { ownIp: _o, ...data } = next;
        const created = await tx.dealLine.create({ data: { ...data, dealId: id, lineNo: nextNo++, ...deriveLine(next), updatedById: actor.id, costSetById: next.unitPurchaseCost ? actor.id : null, costSetAt: next.unitPurchaseCost ? new Date() : null } });
        await recordEvent(tx, { entityType: "deal_line", entityId: created.id, dealId: id, action: "CREATE", userId: actor.id, requestId, newValue: `Line ${created.lineNo}: ${created.description}` });
      }
    }
    // Keep line numbers dense, in their current order
    const remaining = await tx.dealLine.findMany({ where: { dealId: id }, orderBy: { lineNo: "asc" }, select: { id: true, lineNo: true } });
    for (const [i, l] of remaining.entries()) if (l.lineNo !== i + 1) await tx.dealLine.update({ where: { id: l.id }, data: { lineNo: -(i + 1) } });
    for (const [i, l] of remaining.entries()) if (l.lineNo !== i + 1) await tx.dealLine.update({ where: { id: l.id }, data: { lineNo: i + 1 } });
    await recomputeDeal(tx, id, actor.id, requestId);
    await tx.deal.update({ where: { id }, data: { version: { increment: 1 } } });
  });
  return getDeal(actor, id);
}

// ───────────── Delete / restore ─────────────

export async function deleteDeal(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "deals.delete");
  const deal = await loadDeal(actor, id);
  await assertOwnerInScope(actor, deal.ownerId);
  await db.$transaction(async (tx) => {
    await tx.deal.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
    await recordEvent(tx, { entityType: "deal", entityId: id, dealId: id, action: "DELETE", userId: actor.id, requestId, oldValue: `${deal.code} ${deal.name}` });
  });
}

export async function restoreDeal(actor: Actor, id: string, requestId: string) {
  assertPermission(actor, "records.restore");
  const deal = await db.deal.findUnique({ where: { id } });
  if (!deal || !deal.deletedAt) throw new NotFound();
  await db.$transaction(async (tx) => {
    await tx.deal.update({ where: { id }, data: { deletedAt: null, deletedById: null } });
    await recordEvent(tx, { entityType: "deal", entityId: id, dealId: id, action: "RESTORE", userId: actor.id, requestId, newValue: `${deal.code} ${deal.name}` });
  });
}

// ───────────── History ─────────────

export async function dealHistory(actor: Actor, id: string) {
  const deal = await loadDeal(actor, id, { includeDeleted: true });
  const salesSide = actor.role !== "PRESALES" && actor.role !== "PURCHASE";
  const [stages, audit] = await Promise.all([
    db.dealStageHistory.findMany({ where: { dealId: deal.id }, orderBy: { changedAt: "desc" }, include: { changedBy: { select: { id: true, fullName: true } } } }),
    db.auditLog.findMany({ where: { dealId: deal.id }, orderBy: { changedAt: "desc" }, take: 500, include: { changedBy: { select: { id: true, fullName: true } } } }),
  ]);
  const hidden = new Set(["dealValue", "oneTimeValue", "annualRecurringValue", "expectedGmPct", "forecastCategory", "unitSalesPrice", "lineValue", "annualValue", "salesMethodId", "totalCost", "approval"]);
  return {
    stages: stages.map((s) => ({ ...s, fromLabel: s.fromStage ? STAGE_META[s.fromStage].label : null, toLabel: STAGE_META[s.toStage].label, daysInPreviousStage: s.daysInPreviousStage?.toString() ?? null, dealValueAtChange: salesSide ? s.dealValueAtChange.toString() : null })),
    audit: audit.filter((a) => salesSide || !(a.field && hidden.has(a.field))).map((a) => ({ ...a, id: a.id.toString() })),
  };
}

/** For pickers: sales people the actor may assign to. */
export async function assignableOwners(actor: Actor) {
  const ids = await visibleOwnerIds(actor);
  const users = await usersLite();
  return users.filter((u) => u.isActive && (ids === null || ids.includes(u.id)) && (u.role === "SALES" || u.role === "SALES_HEAD" || u.role === "ADMIN")).map((u) => u.id);
}

export type { Stage };
