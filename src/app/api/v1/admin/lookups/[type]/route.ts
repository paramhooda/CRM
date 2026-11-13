import { z } from "zod";
import { handle } from "@/server/http";
import { assertLookupType, createLookup, listLookup } from "@/server/services/lookups";
import { createLookupSchema } from "@/contracts/lookups";
import { boolish } from "@/contracts/common";
import { ValidationError } from "@/server/errors";
import { fieldErrors } from "@/server/http";

export const GET = handle({
  roles: ["ADMIN"], query: z.object({ includeInactive: boolish.optional() }),
  fn: ({ actor, params, query }) => listLookup(actor, assertLookupType(params.type!), !!query.includeInactive),
});

export const POST = handle({
  roles: ["ADMIN"], body: z.record(z.string(), z.unknown()),
  fn: ({ actor, params, body, requestId }) => {
    const type = assertLookupType(params.type!);
    const parsed = createLookupSchema(type).safeParse(body);
    if (!parsed.success) throw new ValidationError(undefined, fieldErrors(parsed.error));
    return createLookup(actor, type, parsed.data, requestId);
  },
});
