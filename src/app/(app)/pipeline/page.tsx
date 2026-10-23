import { Suspense } from "react";
import Link from "next/link";
import { Plus, List } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
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

export const metadata = { title: "Pipeline" };

export default async function PipelinePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  await ensureRulesFresh(db);
  const f = parseOppFilters(sp);
  const [rows, options] = await Promise.all([
    db.opportunity.findMany({
      where: { AND: [opportunityScope(user), oppWhere(f, { ignore: ["stage"] }), { stage: { in: ["IDENTIFIED", "QUALIFIED", "BOQ", "PROPOSAL", "NEGOTIATION", "HOLD"] } }] },
      select: {
        id: true, name: true, code: true, amount: true, stage: true, probability: true, healthLabel: true, healthScore: true, flags: true,
        expectedCloseDate: true, salesOwnerId: true, presalesOwnerId: true, forecastCategory: true,
        account: { select: { name: true } }, salesOwner: { select: { name: true } },
      },
    }),
    getOptions(),
  ]);
  const cards = rows.map((r) => ({
    id: r.id, name: r.name, code: r.code, account: r.account.name, amount: toNumber(r.amount), stage: r.stage, probability: r.probability,
    healthLabel: r.healthLabel, healthScore: r.healthScore, flags: r.flags, expectedCloseDate: r.expectedCloseDate.toISOString(),
    owner: r.salesOwner.name, salesOwnerId: r.salesOwnerId, forecastCategory: r.forecastCategory,
  }));
  const editableIds = rows.filter((r) => can.editOpportunity(user, r)).map((r) => r.id);
  const active = cards.filter((c) => c.stage !== "HOLD");
  return (
    <>
      <PageHeader
        title="Pipeline"
        description={<span className="tabular">{active.length} active deals · {inr(active.reduce((a, c) => a + c.amount, 0))} · weighted {inr(active.reduce((a, c) => a + (c.amount * c.probability) / 100, 0))}. Drag a card to change its stage.</span>}
        actions={
          <>
            <Button asChild><Link href="/opportunities"><List /> Table view</Link></Button>
            {can.createOpportunity(user) && <Button asChild variant="primary"><Link href="/opportunities/new"><Plus /> New opportunity</Link></Button>}
          </>
        }
      >
        <div className="mt-6">
          <Suspense>
            <FilterBar options={options} periods={periodOptions()} dims={["bu", "cat", "sales", "presales", "oem", "fc", "health", "flag", "atype", "rev"]} hideSales={user.role === "SALES"} />
          </Suspense>
        </div>
      </PageHeader>
      <PageBody className="max-w-none">
        <Kanban cards={cards} editableIds={editableIds} />
      </PageBody>
    </>
  );
}
