import { handle } from "@/server/http";
import { createUserSchema } from "@/contracts/users";
import { createUser } from "@/server/services/users";

export const POST = handle({ roles: ["ADMIN"], body: createUserSchema, fn: ({ actor, body, requestId }) => createUser(actor, body, requestId) });
