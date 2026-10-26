// Workflow automation: due-date reminders, overdue escalations, unanswered presales questions and
// expiring quotes. Runs with the periodic rules refresh; every nudge is sent once and recorded on the request.
import type { Tx } from "./db";
import { notify } from "./notify";
import { fmtDate } from "./format";
import { requestNudge, quoteExpiring } from "./workflow";

const OPEN = { in: ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as ("REQUESTED" | "IN_PROGRESS" | "NEEDS_INFO")[] };
const LIVE_DEAL = { deletedAt: null, stage: { notIn: ["WON", "LOST", "DROPPED"] as ("WON" | "LOST" | "DROPPED")[] } };
const oppSelect = { id: true, name: true, salesOwnerId: true, salesOwner: { select: { managerId: true } } } as const;

export async function runWorkflowAutomation(tx: Tx, now = new Date()) {
  const heads = (await tx.user.findMany({ where: { role: "SALES_HEAD", active: true }, select: { id: true } })).map((u) => u.id);
  const managersOf = (o: { salesOwner: { managerId: string | null } }) => (o.salesOwner.managerId ? [o.salesOwner.managerId] : heads);
  let sent = 0;

  const presales = await tx.presalesRequest.findMany({
    where: { status: OPEN, opportunity: LIVE_DEAL },
    include: { opportunity: { select: oppSelect }, assignedTo: { select: { name: true } } },
  });
  const pricing = await tx.pricingRequest.findMany({
    where: { status: { in: ["REQUESTED", "IN_PROGRESS"] }, opportunity: LIVE_DEAL },
    include: { opportunity: { select: oppSelect }, assignedTo: { select: { name: true } } },
  });
  const items = [
    ...presales.map((r) => ({ r, kind: "presales" as const, what: "BOQ" })),
    ...pricing.map((r) => ({ r, kind: "pricing" as const, what: "Pricing" })),
  ];
  for (const { r, kind, what } of items) {
    const n = requestNudge(r, now);
    if (!n) continue;
    const o = r.opportunity;
    const link = `/opportunities/${o.id}?tab=boq`;
    const mark = (data: { remindedAt?: Date; escalatedAt?: Date }) =>
      kind === "presales" ? tx.presalesRequest.update({ where: { id: r.id }, data }) : tx.pricingRequest.update({ where: { id: r.id }, data });
    if (n === "REMIND_DUE") {
      await notify(tx, [r.assignedToId], { type: "REMINDER", title: `${what} due ${fmtDate(r.dueDate, "short")}: ${o.name}`, body: "Due within a day. Submit it, or ask for more time.", link });
      await mark({ remindedAt: now });
    } else if (n === "ESCALATE") {
      await notify(tx, [r.assignedToId, o.salesOwnerId, ...managersOf(o)], {
        type: "ESCALATION",
        title: `Overdue ${what.toLowerCase()} request: ${o.name}`,
        body: `${r.assignedTo.name} was due ${fmtDate(r.dueDate)}. Agree a new date or reassign it.`,
        link,
      });
      await mark({ escalatedAt: now });
    } else if (n === "REMIND_SALES") {
      const q = "infoQuestion" in r ? r.infoQuestion : null;
      await notify(tx, [o.salesOwnerId], { type: "REMINDER", title: `Presales is waiting on your answer: ${o.name}`, body: q ?? "Answer the question so the BOQ can continue.", link });
      await mark({ remindedAt: now });
    }
    sent++;
  }

  const quotes = await tx.quote.findMany({
    where: { status: "SUBMITTED", remindedAt: null, validTill: { gte: now }, opportunity: LIVE_DEAL },
    include: { opportunity: { select: oppSelect } },
  });
  for (const q of quotes) {
    if (!quoteExpiring(q, now)) continue;
    await notify(tx, [q.opportunity.salesOwnerId], {
      type: "REMINDER",
      title: `Quote v${q.version} expires ${fmtDate(q.validTill, "short")}: ${q.opportunity.name}`,
      body: "Follow up with the customer, or re-issue it with a new validity.",
      link: `/opportunities/${q.opportunityId}?tab=quotes`,
    });
    await tx.quote.update({ where: { id: q.id }, data: { remindedAt: now } });
    sent++;
  }
  return sent;
}
