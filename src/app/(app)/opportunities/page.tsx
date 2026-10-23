import { Suspense } from "react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/authz";
import { listOpportunities } from "@/server/queries/opportunities";
import { getOptions } from "@/server/queries/options";
import { PageHeader, PageBody } from "@/components/crm/page";
import { FilterBar } from "@/components/filters/filter-bar";
import { OppTable } from "@/components/opportunities/opp-table";
import { ListToolbar } from "@/components/opportunities/list-toolbar";
import { periodOptions } from "@/lib/fiscal";
import { inr } from "@/lib/format";
import { lineScopeLabel, parseOppFilters, type SearchParams } from "@/lib/filters";

export const metadata = { title: "Opportunities" };

export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const [data, options] = await Promise.all([listOpportunities(user, sp), getOptions()]);
  const scopeLabel = data.lineScoped ? lineScopeLabel(parseOppFilters(sp), options) : null;
  return (
    <>
      <PageHeader
        title="Opportunities"
        description={
          <span className="tabular">
            {data.total} {data.showClosed ? "" : "open "}deals ·{" "}
            {scopeLabel ? (
              <>
                {inr(data.totalAmount)} {scopeLabel} value <span className="text-ink-3">of {inr(data.dealTotalAmount)} total deal value</span>
              </>
            ) : (
              <>{inr(data.totalAmount)} total value</>
            )}
          </span>
        }
        actions={
          <Suspense>
            <ListToolbar canCreate={can.createOpportunity(user)} />
          </Suspense>
        }
      >
        <div className="mt-6">
          <Suspense>
            <FilterBar me={user.id}
              options={options}
              periods={periodOptions()}
              dims={["bu", "cat", "sales", "presales", "oem", "stage", "fc", "health", "flag", "atype", "rev"]}
              hideSales={user.role === "SALES"}
            />
          </Suspense>
        </div>
      </PageHeader>
      <PageBody>
        <Suspense>
          <OppTable
            rows={data.rows}
            total={data.total}
            page={data.page}
            pageSize={data.pageSize}
            sortKey={data.sortKey}
            dir={data.dir}
            hideCost={!can.viewCost(user)}
            scopeLabel={scopeLabel}
          />
        </Suspense>
      </PageBody>
    </>
  );
}
