import { handle } from "@/server/http";
import { dealListQuery } from "@/contracts/deals";
import { homeMetrics } from "@/server/services/metrics";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], query: dealListQuery, fn: ({ actor, query }) => homeMetrics(actor, query) });
