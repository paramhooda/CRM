import { handle } from "@/server/http";
import { resetPasswordSchema } from "@/contracts/users";
import { resetPassword } from "@/server/services/users";

export const POST = handle({
  roles: ["ADMIN"], body: resetPasswordSchema,
  fn: async ({ actor, body, params, requestId }) => { await resetPassword(actor, params.id!, body.temporaryPassword, requestId); return { ok: true }; },
});
