import { withParams, type SearchParams } from "@/lib/filters";

export function dashboardTabs(sp: SearchParams, active: "overview" | "insights") {
  return [
    { href: withParams(sp, {}, "/dashboard"), label: "Overview", active: active === "overview" },
    { href: withParams(sp, {}, "/dashboard/insights"), label: "Insights", active: active === "insights" },
  ];
}
