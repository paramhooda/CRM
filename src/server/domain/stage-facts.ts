import "server-only";
// Loads what the stage rules (src/lib/stage-rules.ts) need to know about deals.
import type { Tx } from "@/lib/db";
import { FUNNEL, type StageFacts } from "@/lib/stage-rules";
import type { StageKey } from "@/lib/constants";

const OPEN_PRESALES = ["REQUESTED", "IN_PROGRESS", "NEEDS_INFO"] as ("REQUESTED" | "IN_PROGRESS" | "NEEDS_INFO")[];
const OPEN_PRICING = ["REQUESTED", "IN_PROGRESS"] as ("REQUESTED" | "IN_PROGRESS")[];

export async function loadStageFacts(tx: Tx, ids: string[], now = new Date()): Promise<Map<string, StageFacts>> {
  if (!ids.length) return new Map();
  const rows = await tx.opportunity.findMany({
    where: { id: { in: ids } },
    select: {
      id: true, stage: true, heldFromStage: true, expectedCloseDate: true, primaryContactId: true,
      _count: {
        select: {
          contacts: true,
          lineItems: { where: { isEstimate: false } },
          presalesRequests: { where: { status: { in: OPEN_PRESALES } } },
          pricingRequests: { where: { status: { in: OPEN_PRICING } } },
        },
      },
      quotes: { orderBy: { version: "desc" }, take: 1, select: { status: true } },
      stageHistory: { orderBy: { changedAt: "desc" }, take: 12, select: { toStage: true } },
    },
  });
  return new Map(
    rows.map((o) => [
      o.id,
      {
        stage: o.stage as StageKey,
        heldFromStage: (o.heldFromStage as StageKey | null) ?? null,
        lastOpenStage: (o.stageHistory.find((h) => FUNNEL.includes(h.toStage as StageKey))?.toStage as StageKey | undefined) ?? null,
        hasContact: !!o.primaryContactId || o._count.contacts > 0,
        closeDatePast: o.expectedCloseDate.getTime() < new Date(now.toDateString()).getTime(),
        realLines: o._count.lineItems,
        openPresales: o._count.presalesRequests > 0,
        openPricing: o._count.pricingRequests > 0,
        quoteStatus: o.quotes[0]?.status ?? null,
      },
    ]),
  );
}
