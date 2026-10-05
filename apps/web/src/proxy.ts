import { NextResponse, type NextRequest } from "next/server";
import { DEFAULT_LOCALE, isLocale } from "./lib/locale";

export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  const path = url.pathname;
  // Backend rewrites must not receive page-only locale redirects or cookies.
  const backendRoute = ["/api", "/auth", "/me", "/orders", "/media", "/telegram/webhook"].some(prefix => path === prefix || path.startsWith(`${prefix}/`));
  if (backendRoute || path.startsWith("/_next/") || /\/[^/]+\.[^/]+$/.test(path)) {
    return NextResponse.next();
  }
  const requested = url.searchParams.get("lang");
  const cookie = request.cookies.get("ticket-locale")?.value;
  const locale = isLocale(requested) ? requested : isLocale(cookie) ? cookie : DEFAULT_LOCALE;
  if (requested !== locale) {
    url.searchParams.set("lang", locale);
    return NextResponse.redirect(url);
  }
  const headers = new Headers(request.headers);
  headers.set("x-ticket-locale", locale);
  headers.set("x-ticket-path", `${path}${url.search}`);
  const response = NextResponse.next({ request: { headers } });
  if (cookie !== locale) response.cookies.set("ticket-locale", locale, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  return response;
}

// Exclude streaming draft uploads: Next Proxy otherwise buffers/clones bodies.
export const config = { matcher: ["/((?!api/creation-drafts(?:/|$)).*)"] };
