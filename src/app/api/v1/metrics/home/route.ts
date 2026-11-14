import { z } from "zod";
import { handle } from "@/server/http";
import { dealListQuery } from "@/contracts/deals";
import { homeMetrics } from "@/server/services/metrics";

export const homeQuery = dealListQuery.extend({ days: z.enum(["30", "90", "fy"]).optional() });

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], query: homeQuery, fn: ({ actor, query }) => homeMetrics(actor, query, query.days ?? "30") });
