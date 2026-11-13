import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "crm_session";
const PUBLIC_PATHS = ["/login", "/api/v1/health", "/api/v1/auth/login"];

/**
 * Runs before every request: without a session cookie, API calls get 401 and pages go to the sign-in page.
 * The cookie is only checked for presence here; every route handler and page validates the session itself.
 */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  const hasCookie = !!req.cookies.get(SESSION_COOKIE)?.value;
  if (hasCookie) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Please sign in." } }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname !== "/" ? `?next=${encodeURIComponent(pathname + req.nextUrl.search)}` : "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/|brand/|icon\\.svg|favicon\\.ico|apple-icon\\.png).*)"],
};
