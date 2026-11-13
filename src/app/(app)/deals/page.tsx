import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { requireActor } from "@/server/auth/actor";
import { allDeals, listDeals, type DealListRow } from "@/server/services/deals";
import { salesPeopleFor } from "@/server/services/people";
import { pagination } from "@/server/http";
import { dealListQuery } from "@/contracts/deals";
import { can } from "@/domain/permissions";
import { isSupportRole } from "@/domain/scope";
import { PageHeader } from "@/components/crm/page-header";
import { DataTable, type Column } from "@/components/crm/data-table";
import { ExportButton } from "@/components/crm/export-button";
import { DealFilters } from "@/components/crm/deal-filters";
import { StagePill, ForecastPill, BuTag } from "@/components/crm/pills";
import { Money, Pct } from "@/components/crm/money";
import { Button } from "@/components/ui/button";
import { ViewToggle } from "./view-toggle";
import { Kanban } from "./kanban";
import { fmtDate, inr } from "@/lib/format";
import { parseListQuery, type Query } from "@/lib/url-state";

export const metadata: Metadata = { title: "Deals" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const actor = await requireActor();
  const q = await searchParams;
  const query = parseListQuery(dealListQuery.extend(pagination.shape).extend({ view: dealListQuery.shape.q }), q);
  const kanban = q.view === "kanban";
  const sales = !isSupportRole(actor.role);
  const owners = await salesPeopleFor(actor);
  const actions = (
    <>
      <ViewToggle />
      {sales && <ExportButton entity="deals" />}
      {can(actor.role, "deals.create") && <Button asChild size="sm"><Link href="/deals/new"><Plus /> New deal</Link></Button>}
    </>
  );
  if (kanban) {
    const rows = await allDeals(actor, { ...query, stage: undefined, open: true }, "expectedCloseDate:asc");
    return (
      <>
        <PageHeader title="Deals" description="Open deals by stage. Open a deal to move it." actions={actions} />
        <DealFilters owners={owners} forecast={sales} />
        <Kanban rows={rows} sales={sales} />
      </>
    );
  }
  const result = await listDeals(actor, query, query);
  const columns: Column<DealListRow>[] = [
    { key: "name", header: "Deal", sort: "name", className: "min-w-52 max-w-72", cell: (r) => <span className="line-clamp-2">{r.name}<span className="block font-mono text-[11px] font-normal text-muted-foreground">{r.code}{r.deletedAt ? " · deleted" : ""}</span></span> },
    { key: "account", header: "Account", sort: "account", className: "max-w-48", cell: (r) => <span className="line-clamp-2">{r.account.name}</span>, hideBelow: "md" },
    { key: "stage", header: "Stage", sort: "stage", cell: (r) => <span className="flex flex-col items-start gap-1"><StagePill stage={r.stage} /><span className="text-[11px] text-muted-foreground">{r.daysInStage}d in stage</span></span> },
    { key: "bu", header: "BU", cell: (r) => <span className="flex flex-wrap gap-1">{r.businessUnits.map((b) => <BuTag key={b.id} name={b.name} colourToken={b.colourToken} />)}</span>, hideBelow: "lg" },
    { key: "oem", header: "OEM", cell: (r) => r.primaryOem?.name ?? "—", hideBelow: "lg" },
    ...(sales
      ? ([
          { key: "forecast", header: "Forecast", cell: (r) => (r.forecastCategory ? <ForecastPill forecast={r.forecastCategory} /> : "—"), hideBelow: "md" },
          { key: "value", header: "Value", sort: "dealValue", align: "right", cell: (r) => <Money value={r.dealValue} /> },
          { key: "gm", header: "GM", sort: "expectedGmPct", align: "right", cell: (r) => <Pct value={r.expectedGmPct} />, hideBelow: "sm" },
        ] as Column<DealListRow>[])
      : ([{ key: "lines", header: "Lines", align: "right", cell: (r) => r.lineCount }] as Column<DealListRow>[])),
    { key: "close", header: "Close", sort: "expectedCloseDate", cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.expectedCloseDate)}</span> },
    { key: "owner", header: "Owner", sort: "owner", cell: (r) => <span className="whitespace-nowrap">{r.owner.fullName}</span>, hideBelow: "lg" },
  ];
  return (
    <>
      <PageHeader title="Deals" description={sales ? "Every opportunity in your scope." : "Deals assigned to you."} actions={actions} />
      <DealFilters owners={owners} stages forecast={sales} />
      <DataTable
        columns={columns}
        rows={result.rows}
        query={q}
        pathname="/deals"
        total={result.total}
        page={result.page}
        pages={result.pages}
        rowHref={(r) => `/deals/${r.id}`}
        footer={result.totals ? <span>{result.total.toLocaleString("en-IN")} deals · {inr(result.totals.dealValue)} total{Number(result.totals.annualRecurringValue) > 0 ? ` · ${inr(result.totals.annualRecurringValue)} ARR` : ""}</span> : undefined}
        empty={{ title: "No deals match", description: sales ? "Try different filters, or start a new deal." : "Deals show here once a request is assigned to you.", action: can(actor.role, "deals.create") ? <Button asChild size="sm"><Link href="/deals/new"><Plus /> New deal</Link></Button> : undefined }}
      />
    </>
  );
}
