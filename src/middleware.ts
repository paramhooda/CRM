import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isSecureRequest, verifySession } from "@/lib/session";

const PUBLIC = ["/login", "/forgot-password", "/reset-password", "/api/health"];

/** Over HTTPS, tell browsers to stay on HTTPS. Never on plain http, so an IP-only install keeps working. */
function finish(req: NextRequest, res: NextResponse) {
  if (isSecureRequest(req.headers)) res.headers.set("Strict-Transport-Security", "max-age=15552000");
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return finish(req, NextResponse.next());
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!session) {
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return finish(req, NextResponse.redirect(url));
  }
  return finish(req, NextResponse.next());
}

export const config = {
  // Static brand assets and icons stay public so the login page and favicon render before sign-in
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|brand/|robots.txt).*)"],
};
