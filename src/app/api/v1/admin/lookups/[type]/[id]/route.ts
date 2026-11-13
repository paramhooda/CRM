import { z } from "zod";
import { handle } from "@/server/http";
import { assertLookupType, updateLookup } from "@/server/services/lookups";
import { updateLookupSchema } from "@/contracts/lookups";
import { ValidationError } from "@/server/errors";
import { fieldErrors } from "@/server/http";

export const PATCH = handle({
  roles: ["ADMIN"], body: z.record(z.string(), z.unknown()),
  fn: ({ actor, params, body, requestId }) => {
    const type = assertLookupType(params.type!);
    const parsed = updateLookupSchema(type).safeParse(body);
    if (!parsed.success) throw new ValidationError(undefined, fieldErrors(parsed.error));
    return updateLookup(actor, type, params.id!, parsed.data, requestId);
  },
});
