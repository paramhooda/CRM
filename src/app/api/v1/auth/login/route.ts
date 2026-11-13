import { NextResponse } from "next/server";
import { handle } from "@/server/http";
import { loginSchema } from "@/contracts/auth";
import { login } from "@/server/services/auth";
import { cookieOptions, SESSION_COOKIE } from "@/server/auth/session";

export const POST = handle({
  public: true,
  body: loginSchema,
  fn: async ({ req, body }) => {
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const { token, mustChangePassword } = await login(body, { ip, userAgent: req.headers.get("user-agent") });
    const res = NextResponse.json({ data: { ok: true, mustChangePassword } });
    res.cookies.set(SESSION_COOKIE, token, cookieOptions());
    return res;
  },
});
