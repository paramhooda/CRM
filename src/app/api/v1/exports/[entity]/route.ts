import { z } from "zod";
import { handle } from "@/server/http";
import { runExport } from "@/server/services/exports";
import { recordEvent } from "@/server/audit";
import { db } from "@/server/db";
// Registers the exports that live in other modules
import "@/server/services/export-registry";

export const GET = handle({
  query: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  fn: async ({ actor, params, query, requestId }) => {
    const res = await runExport(actor, params.entity!, query);
    await recordEvent(db, { entityType: "export", entityId: actor.id, action: "CREATE", userId: actor.id, requestId, field: params.entity, newValue: JSON.stringify(query).slice(0, 500) });
    return res;
  },
});
