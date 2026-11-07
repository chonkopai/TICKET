import assert from "node:assert/strict";
import test from "node:test";
import nextConfig from "./next.config";

test("ticket email access and QR endpoints are forwarded to the API", async () => {
  const rewrites = await nextConfig.rewrites!();
  assert.ok(Array.isArray(rewrites));
  const rule = rewrites.find(rule => rule.source === "/ticket-email/:path*");
  assert.ok(rule, "public delivery requests need an API rewrite");
  for (const path of ["access", "tickets/ticket-id/qr", "group-passes/pass-id/qr"]) {
    assert.equal(rule.destination.replace(":path*", path), `${process.env.API_INTERNAL_URL ?? "http://localhost:3001"}/ticket-email/${path}`);
  }
});
