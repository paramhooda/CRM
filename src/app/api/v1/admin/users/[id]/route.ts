import { handle } from "@/server/http";
import { updateUserSchema } from "@/contracts/users";
import { updateUser } from "@/server/services/users";

export const PATCH = handle({ roles: ["ADMIN"], body: updateUserSchema, fn: ({ actor, body, params, requestId }) => updateUser(actor, params.id!, body, requestId) });
