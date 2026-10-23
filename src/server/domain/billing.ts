// Billing-ready domain. Closed-won line items are the billable record for finance.
// Nothing here talks to finance yet: a future API route or a worker draining IntegrationEvent
// (the transactional outbox) can be a thin wrapper over toBillableLines() and the events below.
import { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/db";
import { billingPeriods, lineMultiplier } from "@/lib/boq";
import { toNumber } from "@/lib/format";

export const BILLABLE_LINE_SCHEMA_VERSION = 1;

/** Stable contract for finance. Add fields; never rename or remove without bumping the version. */
export type BillableLine = {
  schemaVersion: typeof BILLABLE_LINE_SCHEMA_VERSION;
  lineId: string;
  lineNo: number;
  opportunityId: string;
  opportunityCode: string;
  opportunityName: string;
  customer: {
    accountId: string;
    accountCode: string;
    name: string;
    gstin: string | null;
    pan: string | null;
    billingAddress: { line: string | null; city: string | null; state: string | null; pincode: string | null };
  };
  purchaseOrder: { number: string | null; date: string | null };
  salesOwner: { id: string; name: string; email: string };
  businessUnit: string;
  category: string;
  oem: string;
  product: { id: string | null; code: string | null; name: string | null; partNumber: string | null };
  description: string;
  hsnSac: string | null;
  gstRatePct: number | null;
  quantity: number;
  unit: string;
  billing: {
    frequency: "ONE_TIME" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
    termMonths: number | null;
    periods: number;
    startDate: string | null;
    /** Taxable amount per billing period (quantity × unit price) */
    amountPerPeriod: number;
  };
  unitPrice: number;
  /** Total taxable value over the term, excluding GST */
  taxableValue: number;
  currency: "INR";
  billingStatus: "NOT_READY" | "READY" | "SENT" | "INVOICED";
  externalRef: string | null;
};

const lineInclude = {
  businessUnit: { select: { name: true } },
  category: { select: { name: true } },
  oem: { select: { name: true } },
  product: { select: { id: true, code: true, name: true, hsnSac: true, gstRatePct: true } },
} as const;

export async function toBillableLines(tx: Tx, opportunityId: string): Promise<BillableLine[]> {
  const o = await tx.opportunity.findUniqueOrThrow({
    where: { id: opportunityId },
    include: {
      account: true,
      salesOwner: { select: { id: true, name: true, email: true } },
      lineItems: { orderBy: { lineNo: "asc" }, include: lineInclude },
    },
  });
  return o.lineItems.map((l) => {
    const unitPrice = toNumber(l.unitPrice);
    return {
      schemaVersion: BILLABLE_LINE_SCHEMA_VERSION,
      lineId: l.id,
      lineNo: l.lineNo,
      opportunityId: o.id,
      opportunityCode: o.code,
      opportunityName: o.name,
      customer: {
        accountId: o.account.id,
        accountCode: o.account.code,
        name: o.account.name,
        gstin: o.account.gstin,
        pan: o.account.pan,
        billingAddress: { line: o.account.addressLine, city: o.account.city, state: o.account.state, pincode: o.account.pincode },
      },
      purchaseOrder: { number: o.poNumber, date: o.poDate?.toISOString() ?? null },
      salesOwner: o.salesOwner,
      businessUnit: l.businessUnit.name,
      category: l.category.name,
      oem: l.oem.name,
      product: { id: l.productId, code: l.productCode ?? l.product?.code ?? null, name: l.productName ?? l.product?.name ?? null, partNumber: l.partNumber },
      description: l.description,
      hsnSac: l.hsnSac ?? l.product?.hsnSac ?? null,
      gstRatePct: l.gstRatePct !== null ? toNumber(l.gstRatePct) : l.product ? toNumber(l.product.gstRatePct) : null,
      quantity: toNumber(l.quantity),
      unit: l.unit,
      billing: {
        frequency: l.billingFrequency,
        termMonths: l.termMonths,
        periods: billingPeriods(l),
        startDate: l.billingStartDate?.toISOString() ?? null,
        amountPerPeriod: toNumber(l.quantity) * unitPrice,
      },
      unitPrice,
      taxableValue: lineMultiplier(l) * unitPrice,
      currency: "INR",
      billingStatus: l.billingStatus,
      externalRef: l.externalRef,
    };
  });
}

export async function emitEvent(tx: Tx, type: string, aggregateType: string, aggregateId: string, payload: unknown) {
  await tx.integrationEvent.create({
    data: { type, aggregateType, aggregateId, payload: payload as Prisma.InputJsonValue },
  });
}

/** Problems that block closing a deal as won. Every line must be classified, priced and carry HSN/SAC. */
export async function billingReadinessIssues(tx: Tx, opportunityId: string): Promise<string[]> {
  const lines = await tx.opportunityLineItem.findMany({
    where: { opportunityId },
    select: { lineNo: true, unitPrice: true, hsnSac: true, isEstimate: true, product: { select: { hsnSac: true } } },
    orderBy: { lineNo: "asc" },
  });
  if (!lines.length) return ["Add at least one line item. Won deals are billed line by line."];
  const issues: string[] = [];
  const estimates = lines.filter((l) => l.isEstimate).map((l) => l.lineNo);
  if (estimates.length) return [`Replace estimate line ${estimates.join(", ")} with catalogue products.`];
  const unpriced = lines.filter((l) => l.unitPrice === null).map((l) => l.lineNo);
  const noHsn = lines.filter((l) => !(l.hsnSac || l.product?.hsnSac)).map((l) => l.lineNo);
  if (unpriced.length) issues.push(`Set a sell price on line ${unpriced.join(", ")}.`);
  if (noHsn.length) issues.push(`Add HSN/SAC on line ${noHsn.join(", ")} (pick a catalogue product or enter it).`);
  return issues;
}

/** Freeze lines as the billable record and publish opportunity.won to the outbox. */
export async function lockForBilling(
  tx: Tx,
  opportunityId: string,
  opts: { poDate: Date | null; contractStart: Date | null; now: Date; userId: string },
) {
  const lines = await tx.opportunityLineItem.findMany({ where: { opportunityId }, include: { product: true } });
  for (const l of lines) {
    await tx.opportunityLineItem.update({
      where: { id: l.id },
      data: {
        productCode: l.productCode ?? l.product?.code ?? null,
        productName: l.productName ?? l.product?.name ?? null,
        hsnSac: l.hsnSac ?? l.product?.hsnSac ?? null,
        gstRatePct: l.gstRatePct ?? l.product?.gstRatePct ?? null,
        billingStartDate: l.billingStartDate ?? (l.billingFrequency === "ONE_TIME" ? opts.poDate : opts.contractStart ?? opts.poDate) ?? opts.now,
        billingStatus: "READY",
        lockedAt: opts.now,
      },
    });
  }
  const billable = await toBillableLines(tx, opportunityId);
  await emitEvent(tx, "opportunity.won", "Opportunity", opportunityId, {
    schemaVersion: BILLABLE_LINE_SCHEMA_VERSION,
    occurredAt: opts.now.toISOString(),
    actorId: opts.userId,
    lines: billable,
  });
}

/** Reopening a won deal releases the lines unless finance already holds them. */
export async function unlockForBilling(tx: Tx, opportunityId: string, opts: { now: Date; userId: string }) {
  const held = await tx.opportunityLineItem.count({ where: { opportunityId, billingStatus: { in: ["SENT", "INVOICED"] } } });
  if (held) throw new BillingLockedError("Lines on this deal are already with finance. Raise a change with finance before reopening.");
  await tx.opportunityLineItem.updateMany({ where: { opportunityId }, data: { billingStatus: "NOT_READY", lockedAt: null } });
  await emitEvent(tx, "opportunity.reopened", "Opportunity", opportunityId, { occurredAt: opts.now.toISOString(), actorId: opts.userId });
}

export class BillingLockedError extends Error {}
