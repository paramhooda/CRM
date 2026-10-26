import { Suspense } from "react";
import Link from "next/link";
import { Plus, List } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, isManager, opportunityScope } from "@/lib/authz";
import { checkMove } from "@/lib/stage-rules";
import { loadStageFacts } from "@/server/domain/stage-facts";
import type { StageKey } from "@/lib/constants";
import { db } from "@/lib/db";
import { oppWhere, parseOppFilters, type SearchParams } from "@/lib/filters";
import { ensureRulesFresh } from "@/lib/opportunity-service";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody } from "@/components/crm/page";
import { FilterBar } from "@/components/filters/filter-bar";
import { Kanban } from "@/components/opportunities/kanban";
import { Button } from "@/components/ui/button";
import { periodOptions } from "@/lib/fiscal";
import { inr, toNumber } from "@/lib/format";
import { hasLineFilter } from "@/lib/attribution";
import { attributeDeal, attributionLineSelect } from "@/server/queries/attributed";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  await ensureRulesFresh(db);
  const f = parseOppFilters(sp);
  const [rows, options] = await Promise.all([
    db.opportunity.findMany({
      where: { AND: [opportunityScope(user), oppWhere(f, { ignore: ["stage"] }), { stage: { in: ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING", "PROPOSAL", "NEGOTIATION", "HOLD"] } }] },
      select: {
        id: true, name: true, code: true, amount: true, stage: true, probability: true, healthLabel: true, healthScore: true, flags: true,
        expectedCloseDate: true, salesOwnerId: true, presalesOwnerId: true, forecastCategory: true,
        account: { select: { name: true } }, salesOwner: { select: { name: true } },
        businessUnit: { select: { name: true } }, category: { select: { name: true } }, oem: { select: { name: true } },
        lineItems: attributionLineSelect,
      },
    }),
    getOptions(),
  ]);
  const lineScoped = hasLineFilter(f);
  const cards = rows.map((r) => ({
    id: r.id, name: r.name, code: r.code, account: r.account.name,
    // With a BU / category / OEM filter the board sums each deal's matching share
    amount: attributeDeal(r, f).amount, dealAmount: lineScoped ? toNumber(r.amount) : undefined, stage: r.stage, probability: r.probability,
    healthLabel: r.healthLabel, healthScore: r.healthScore, flags: r.flags, expectedCloseDate: r.expectedCloseDate.toISOString(),
    owner: r.salesOwner.name, salesOwnerId: r.salesOwnerId, forecastCategory: r.forecastCategory,
  }));
  const editableIds = rows.filter((r) => can.editOpportunity(user, r)).map((r) => r.id);
  // Where each card may be dropped. Moves that need input (hold reason, PO, loss reason) are made on the deal itself.
  const facts = await loadStageFacts(db, editableIds);
  const BOARD: StageKey[] = ["IDENTIFIED", "QUALIFIED", "BOQ", "PRICING", "PROPOSAL", "NEGOTIATION", "HOLD"];
  const drops: Record<string, Partial<Record<StageKey, string | null>>> = {};
  for (const [id, f] of facts) {
    drops[id] = Object.fromEntries(
      BOARD.filter((s) => s !== f.stage).map((s) => {
        const m = checkMove(f, { canEdit: true, isManager: isManager(user) }, s);
        return [s, !m.allowed ? m.reason ?? "Not allowed" : m.needs ? "Open the deal to make this change: it needs a reason." : null];
      }),
    );
  }
  const active = cards.filter((c) => c.stage !== "HOLD");
  return (
    <>
      <PageHeader
        title="Pipeline"
        description={<span className="tabular">{active.length} active deals · {inr(active.reduce((a, c) => a + c.amount, 0))} · weighted {inr(active.reduce((a, c) => a + (c.amount * c.probability) / 100, 0))}. Drag a card to its next stage; stages it cannot move to fade out.</span>}
        actions={
          <>
            <Button asChild><Link href="/opportunities"><List /> Table view</Link></Button>
            {can.createOpportunity(user) && <Button asChild variant="primary"><Link href="/opportunities/new"><Plus /> New opportunity</Link></Button>}
          </>
        }
      >
        <div className="mt-6">
          <Suspense>
            <FilterBar me={user.id} options={options} periods={periodOptions()} dims={["bu", "cat", "sales", "presales", "oem", "fc", "health", "flag", "atype", "rev"]} hideSales={user.role === "SALES"} />
          </Suspense>
        </div>
      </PageHeader>
      <PageBody className="max-w-none">
        <Kanban cards={cards} editableIds={editableIds} drops={drops} />
      </PageBody>
    </>
  );
}
