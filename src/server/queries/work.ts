import "server-only";
// "My work" read models for Presales and Purchase: what is waiting on me, what I am waiting on, what I did.
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";
import { toNumber } from "@/lib/format";

const DAY = 86_400_000;
const OPEN = ["REQUESTED", "IN_PROGRESS"] as const;
const OPEN_PRESALES = ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as const;
const KIND_TAG: Record<string, string | undefined> = { REPRICE: "Re-pricing", REVALIDATE: "Re-validation" };
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, NORMAL: 2 };

export type QueueItem = {
  id: string;
  status: string;
  priority: string;
  dueDate: Date;
  createdAt: Date;
  note: string | null;
  requestedBy: string;
  opp: { id: string; name: string; code: string; account: string; amount: number; salesOwner: string };
  lines: number;
  costed?: number;
  oems?: string[];
  /** Revision / re-pricing marker shown next to the deal name */
  tag?: string;
  overdue: boolean;
  dueThisWeek: boolean;
  notStarted: boolean;
};

function classify(dueDate: Date, status: string, now: Date) {
  // A request waiting on sales is paused: its due date moves out when sales answers
  if (status === "NEEDS_INFO") return { overdue: false, dueThisWeek: false, notStarted: false };
  return {
    overdue: dueDate < now,
    dueThisWeek: dueDate >= now && dueDate.getTime() - now.getTime() <= 7 * DAY,
    notStarted: status === "REQUESTED",
  };
}

function sortQueue(a: QueueItem, b: QueueItem) {
  if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
  const d = a.dueDate.getTime() - b.dueDate.getTime();
  if (d) return d;
  return (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2);
}

const oppSelect = {
  id: true, name: true, code: true, amount: true,
  account: { select: { name: true } }, salesOwner: { select: { name: true } },
} as const;

async function common(user: CurrentUser) {
  const [notifications, tasks] = await Promise.all([
    db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.activity.findMany({
      where: { ownerId: user.id, type: "TASK", completedAt: null },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }],
      take: 6,
      include: { opportunity: { select: { id: true, name: true } } },
    }),
  ]);
  return { notifications, tasks };
}

export async function getPresalesWork(user: CurrentUser) {
  const now = new Date();
  const [open, waiting, delivered, base] = await Promise.all([
    db.presalesRequest.findMany({
      where: { assignedToId: user.id, status: { in: [...OPEN_PRESALES] } },
      include: { opportunity: { select: { ...oppSelect, lineItems: { select: { oem: { select: { name: true } } } } } }, requestedBy: { select: { name: true } } },
    }),
    db.pricingRequest.findMany({
      where: { status: { in: [...OPEN] }, OR: [{ requestedById: user.id }, { presalesRequest: { assignedToId: user.id } }] },
      orderBy: { dueDate: "asc" },
      include: { opportunity: { select: oppSelect }, assignedTo: { select: { name: true } } },
    }),
    db.presalesRequest.findMany({
      where: { assignedToId: user.id, status: "BOQ_SUBMITTED", submittedAt: { gte: new Date(now.getTime() - 14 * DAY) } },
      orderBy: { submittedAt: "desc" },
      take: 6,
      include: { opportunity: { select: oppSelect } },
    }),
    common(user),
  ]);
  const queue: QueueItem[] = open
    .map((r) => ({
      id: r.id, status: r.status, priority: r.priority, dueDate: r.dueDate, createdAt: r.createdAt,
      note: r.status === "NEEDS_INFO" ? `Waiting on sales: ${r.infoQuestion}` : r.revision > 1 && r.reason ? r.reason : r.scope,
      tag: r.revision > 1 ? `Revision ${r.revision}` : undefined,
      requestedBy: r.requestedBy.name, lines: r.opportunity.lineItems.length,
      oems: [...new Set(r.opportunity.lineItems.map((l) => l.oem.name))],
      opp: { id: r.opportunity.id, name: r.opportunity.name, code: r.opportunity.code, account: r.opportunity.account.name, amount: toNumber(r.opportunity.amount), salesOwner: r.opportunity.salesOwner.name },
      ...classify(r.dueDate, r.status, now),
    }))
    .sort(sortQueue);
  return {
    queue,
    waiting: waiting.map((w) => ({ id: w.id, opp: { id: w.opportunity.id, name: w.opportunity.name, account: w.opportunity.account.name }, buyer: w.assignedTo.name, dueDate: w.dueDate, overdue: w.dueDate < now })),
    delivered: delivered.map((d) => ({ id: d.id, opp: { id: d.opportunity.id, name: d.opportunity.name, account: d.opportunity.account.name }, at: d.submittedAt! })),
    ...base,
  };
}

const expiringLine = (now: Date) => ({
  isEstimate: false,
  costSource: "PURCHASE" as const,
  costValidTill: { gte: new Date(now.getTime() - 30 * DAY), lte: new Date(now.getTime() + 10 * DAY) },
});

export async function getPurchaseWork(user: CurrentUser) {
  const now = new Date();
  const [open, expiring, priced, base] = await Promise.all([
    db.pricingRequest.findMany({
      where: { assignedToId: user.id, status: { in: [...OPEN] } },
      include: {
        opportunity: { select: { ...oppSelect, lineItems: { where: { isEstimate: false, costSource: "PURCHASE" }, select: { unitCost: true, pricingStatus: true, oem: { select: { name: true } } } } } },
        requestedBy: { select: { name: true } },
      },
    }),
    // Supplier prices lapsing on open deals I price: each line carries its own supplier's validity
    db.opportunity.findMany({
      where: {
        purchaseOwnerId: user.id,
        stage: { in: ["BOQ", "PRICING", "PROPOSAL", "NEGOTIATION", "HOLD"] },
        deletedAt: null,
        lineItems: { some: expiringLine(now) },
      },
      select: { ...oppSelect, lineItems: { where: expiringLine(now), orderBy: { costValidTill: "asc" }, select: { costValidTill: true } } },
    }),
    db.pricingRequest.findMany({
      where: { assignedToId: user.id, status: "QUOTED", quotedAt: { gte: new Date(now.getTime() - 14 * DAY) } },
      orderBy: { quotedAt: "desc" },
      take: 6,
      include: { opportunity: { select: oppSelect } },
    }),
    common(user),
  ]);
  const queue: QueueItem[] = open
    .map((r) => {
      const lines = r.opportunity.lineItems;
      return {
        id: r.id, status: r.status, priority: "NORMAL", dueDate: r.dueDate, createdAt: r.createdAt, note: r.reason ?? r.notes,
        tag: KIND_TAG[r.kind],
        requestedBy: r.requestedBy.name, lines: lines.length, costed: lines.filter((l) => l.unitCost !== null && l.pricingStatus === "QUOTED").length,
        oems: [...new Set(lines.map((l) => l.oem.name))],
        opp: { id: r.opportunity.id, name: r.opportunity.name, code: r.opportunity.code, account: r.opportunity.account.name, amount: toNumber(r.opportunity.amount), salesOwner: r.opportunity.salesOwner.name },
        ...classify(r.dueDate, r.status, now),
      };
    })
    .sort(sortQueue);
  // Uncosted lines across my queue grouped by OEM, so RFQs to distributors can be batched
  const byOem = new Map<string, { oem: string; lines: number; deals: Set<string> }>();
  for (const r of open) {
    for (const l of r.opportunity.lineItems) {
      if (l.unitCost !== null && l.pricingStatus === "QUOTED") continue;
      const x = byOem.get(l.oem.name) ?? { oem: l.oem.name, lines: 0, deals: new Set<string>() };
      x.lines++;
      x.deals.add(r.opportunity.id);
      byOem.set(l.oem.name, x);
    }
  }
  return {
    queue,
    rfqByOem: [...byOem.values()].map((x) => ({ oem: x.oem, lines: x.lines, deals: x.deals.size })).sort((a, b) => b.lines - a.lines),
    expiring: expiring
      .map((o) => ({ id: o.id, opp: { id: o.id, name: o.name, account: o.account.name }, validTill: o.lineItems[0].costValidTill!, lines: o.lineItems.length }))
      .map((e) => ({ ...e, expired: e.validTill < now }))
      .sort((a, b) => a.validTill.getTime() - b.validTill.getTime())
      .slice(0, 6),
    priced: priced.map((p) => ({ id: p.id, opp: { id: p.opportunity.id, name: p.opportunity.name, account: p.opportunity.account.name }, at: p.quotedAt! })),
    ...base,
  };
}
