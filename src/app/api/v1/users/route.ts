import { z } from "zod";
import { handle } from "@/server/http";
import { listUsers } from "@/server/services/users";
import { boolish } from "@/contracts/common";

export const GET = handle({
  query: z.object({ includeInactive: boolish.optional() }),
  fn: ({ actor, query }) => listUsers(actor, !!query.includeInactive),
});
