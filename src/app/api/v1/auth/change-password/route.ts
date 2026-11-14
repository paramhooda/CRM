import { handle } from "@/server/http";
import { changePasswordSchema } from "@/contracts/auth";
import { changePassword } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/server/auth/session";

export const POST = handle({
  body: changePasswordSchema,
  fn: async ({ req, actor, body }) => {
    await changePassword(actor.id, actor.email, body, req.cookies.get(SESSION_COOKIE)?.value);
    return { ok: true };
  },
});
