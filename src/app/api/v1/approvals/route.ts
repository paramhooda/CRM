import { z } from "zod";
import { handle } from "@/server/http";
import { myApprovals } from "@/server/services/approvals";

export const GET = handle({ roles: ["ADMIN", "SALES_HEAD", "SALES"], query: z.object({ status: z.enum(["PENDING", "DECIDED"]).default("PENDING") }), fn: ({ actor, query }) => myApprovals(actor, query.status) });
