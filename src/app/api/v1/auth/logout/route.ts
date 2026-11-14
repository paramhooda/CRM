import { NextResponse } from "next/server";
import { handle } from "@/server/http";
import { logout } from "@/server/services/auth";
import { cookieOptions, SESSION_COOKIE } from "@/server/auth/session";

export const POST = handle({
  fn: async ({ req, actor }) => {
    await logout(req.cookies.get(SESSION_COOKIE)?.value, actor.id);
    const res = NextResponse.json({ data: { ok: true } });
    res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
    return res;
  },
});
