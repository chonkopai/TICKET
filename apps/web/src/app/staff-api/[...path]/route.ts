import { type NextRequest } from "next/server";
import { isAdminHost } from "../../../lib/admin-host";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function forward(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const origin = process.env.ADMIN_ORIGIN ?? "http://admin.localhost:3000";
  if (!isAdminHost(req.headers.get("host"), origin))
    return new Response(null, { status: 404 });
  const secret = process.env.STAFF_GATEWAY_SECRET;
  if (process.env.STAFF_ENABLED !== "true" || !secret || secret.length < 32)
    return Response.json({ code: "STAFF_UNAVAILABLE" }, { status: 503 });
  if (
    !["GET", "HEAD"].includes(req.method) &&
    req.headers.get("origin") !== origin
  )
    return Response.json({ code: "CSRF_INVALID" }, { status: 403 });
  const { path } = await context.params;
  if (
    !path.length ||
    path.some(
      (part) =>
        !part || part === "." || part === ".." || !/^[-a-zA-Z0-9]+$/.test(part),
    )
  )
    return new Response(null, { status: 404 });
  const cookieName = origin.startsWith("https:")
      ? "__Host-ticket-staff"
      : "ticket-staff-local",
    cookie = req.cookies.get(cookieName)?.value;
  const headers = new Headers({
    "x-staff-gateway": secret,
    "x-staff-origin": origin,
  });
  if (cookie)
    headers.set("cookie", `${cookieName}=${encodeURIComponent(cookie)}`);
  const csrf = req.headers.get("x-staff-csrf");
  if (csrf) headers.set("x-staff-csrf", csrf);
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  let body: Uint8Array | undefined;
  if (req.body && !["GET", "HEAD"].includes(req.method)) {
    const reader = req.body.getReader(),
      chunks: Uint8Array[] = [];
    let length = 0;
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > 12 * 1024 * 1024) {
        await reader.cancel();
        return Response.json({ code: "FILE_SIZE_INVALID" }, { status: 413 });
      }
      chunks.push(result.value);
    }
    body = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
  }
  const destination = new URL(
    `/staff/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`,
    process.env.API_INTERNAL_URL ?? "http://localhost:3001",
  );
  try {
    const response = await fetch(destination, {
      method: req.method,
      headers,
      ...(body ? { body: body as BodyInit } : {}),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    const outgoing = new Headers({
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
    });
    for (const name of ["content-type", "content-disposition", "set-cookie"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return Response.json(
      { code: "STAFF_BACKEND_UNAVAILABLE" },
      { status: 503 },
    );
  }
}
export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
