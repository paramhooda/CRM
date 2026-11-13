import "server-only";
// Loads what the stage rules (src/lib/stage-rules.ts) need to know about deals.
import type { Tx } from "@/lib/db";
import { FUNNEL, type StageFacts } from "@/lib/stage-rules";
import type { StageKey } from "@/lib/constants";
import { quoteMatchesLines, quotedLine } from "@/lib/quote";
import { readinessIssues } from "./billing";

const OPEN_PRESALES = ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as ("REQUESTED" | "IN_PROGRESS" | "NEEDS_INFO")[];
const OPEN_PRICING = ["REQUESTED", "IN_PROGRESS"] as ("REQUESTED" | "IN_PROGRESS")[];
/** Stages where closing as won is possible, so its quote and billing checks are worth loading */
const WINNABLE = ["PROPOSAL", "NEGOTIATION"];

export async function loadStageFacts(tx: Tx, ids: string[], now = new Date()): Promise<Map<string, StageFacts>> {
  if (!ids.length) return new Map();
  const rows = await tx.opportunity.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, stage: true, heldFromStage: true, presalesRequired: true, expectedCloseDate: true, primaryContactId: true,
      primaryContact: { select: { deletedAt: true } },
      _count: {
        select: {
          contacts: { where: { contact: { deletedAt: null } } },
          lineItems: { where: { isEstimate: false } },
          presalesRequests: { where: { status: { in: OPEN_PRESALES } } },
          pricingRequests: { where: { status: { in: OPEN_PRICING } } },
        },
      },
      quotes: { orderBy: { version: "desc" }, take: 1, select: { status: true, version: true, validTill: true, snapshot: true } },
      stageHistory: { orderBy: { changedAt: "desc" }, take: 12, select: { toStage: true } },
    },
  });
  // Lines only for deals that could be closed as won now
  const winnable = rows.filter((o) => WINNABLE.includes(o.stage)).map((o) => o.id);
  const lines = winnable.length
    ? await tx.opportunityLineItem.findMany({
        where: { opportunityId: { in: winnable } },
        orderBy: { lineNo: "asc" },
        select: {
          opportunityId: true, lineNo: true, partNumber: true, description: true, quantity: true, unit: true, billingFrequency: true,
          termMonths: true, unitPrice: true, gstRatePct: true, hsnSac: true, isEstimate: true, product: { select: { hsnSac: true, gstRatePct: true } },
        },
      })
    : [];
  const byDeal = new Map<string, typeof lines>();
  for (const l of lines) byDeal.set(l.opportunityId, [...(byDeal.get(l.opportunityId) ?? []), l]);

  return new Map(
    rows.map((o) => {
      const q = o.quotes[0];
      const dealLines = byDeal.get(o.id);
      const facts: StageFacts = {
        stage: o.stage as StageKey,
        heldFromStage: (o.heldFromStage as StageKey | null) ?? null,
        lastOpenStage: (o.stageHistory.find((h) => FUNNEL.includes(h.toStage as StageKey))?.toStage as StageKey | undefined) ?? null,
        // A deleted contact no longer counts as the customer contact
        hasContact: (!!o.primaryContactId && !o.primaryContact?.deletedAt) || o._count.contacts > 0,
        closeDatePast: o.expectedCloseDate.getTime() < new Date(now.toDateString()).getTime(),
        realLines: o._count.lineItems,
        openPresales: o._count.presalesRequests > 0,
        openPricing: o._count.pricingRequests > 0,
        quoteStatus: q?.status ?? null,
        quoteVersion: q?.version ?? null,
        presalesRequired: o.presalesRequired,
        ...(dealLines && q
          ? {
              quoteCurrent: quoteMatchesLines(q.snapshot, dealLines.map(quotedLine)) ?? undefined,
              quoteExpired: q.validTill < now,
              billingIssues: readinessIssues(dealLines),
            }
          : {}),
      };
      return [o.id, facts];
    }),
  );
}
