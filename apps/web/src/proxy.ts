import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "./lib/locale";
import { isAdminHost } from "./lib/admin-host";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = url.pathname;
  const admin = isAdminHost(request.headers.get("host"));
  if (admin && path === "/") { url.pathname = "/admin"; return NextResponse.redirect(url); }
  if ((path.startsWith("/admin") || path.startsWith("/staff-api")) && !admin) return new NextResponse("Not found", { status: 404 });
  if (admin && !["/admin", "/staff-api", "/_next"].some(prefix => path === prefix || path.startsWith(`${prefix}/`)) && !/^\/[^/]+\.[^/]+$/.test(path)) return new NextResponse("Not found", { status: 404 });
  if (path.startsWith("/staff-api")) return NextResponse.next();
  // Backend rewrites must not receive page-only locale redirects or cookies.
  const backendRoute = ["/api", "/auth", "/me", "/orders", "/media", "/platform-support", "/telegram/webhook"].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  if (backendRoute || path.startsWith("/_next/") || /\/[^/]+\.[^/]+$/.test(path)) {
    return NextResponse.next();
  }
  const requested = url.searchParams.get("lang");
  const cookie = request.cookies.get("ticket-locale")?.value;
  const locale = isLocale(requested) ? requested : isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  if (path === "/login/telegram/callback") {
    // OAuth queries must not be redirected or reflected into root-layout alternate URLs.
    const headers = new Headers(request.headers);
    headers.set("x-ticket-locale", locale);
    headers.set("x-ticket-path", path);
    return NextResponse.next({ request: { headers } });
  }
  if (requested !== locale) {
    url.searchParams.set("lang", locale);
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set("x-ticket-locale", locale);
  headers.set("x-ticket-admin", admin ? "true" : "false");
  headers.set("x-ticket-path", `${path}${url.search}`);
  const response = NextResponse.next({ request: { headers } });
  if (cookie !== locale) response.cookies.set("ticket-locale", locale, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

// Exclude streaming draft uploads: Next Proxy otherwise buffers/clones bodies.
export const config = { matcher: ["/((?!api/creation-drafts(?:/|$)).*)"] };
