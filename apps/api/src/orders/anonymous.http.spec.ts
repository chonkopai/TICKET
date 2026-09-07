import "reflect-metadata";
import { prisma } from "@event-platform/database";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BookingModule } from "../booking/booking.module.js";
import { secretHash } from "./anonymous.service.js";

let app: INestApplication, origin: string;
const hashes: string[] = [];
beforeAll(async () => { app = await NestFactory.create(BookingModule, { logger: false }); await app.listen(0, "127.0.0.1"); origin = await app.getUrl(); });
afterAll(async () => { await app?.close(); await prisma.anonymousCheckoutSession.deleteMany({ where: { sessionHash: { in: hashes } } }); });
describe("anonymous HTTP boundary", () => {
  it("creates a no-store anonymous session without login and rejects extra fields", async () => {
    const response = await fetch(`${origin}/quick/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "HTTP fixture" }) });
    expect(response.status).toBe(201); expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as { sessionToken: string; accessToken: string };
    hashes.push(secretHash(body.sessionToken));
    expect(body.sessionToken).toHaveLength(43); expect(body.accessToken).not.toBe(body.sessionToken);
    const read = await fetch(`${origin}/quick/session`, { headers: { authorization: `Bearer ${body.sessionToken}` } });
    expect(await read.json()).toEqual({ verified: false, orderId: null });
    const tampered = await fetch(`${origin}/quick/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Guest", telegramId: "123", price: 1 }) });
    expect(tampered.status).toBe(400);
  });
  it("rejects unauthenticated verification, account claims and organizer views", async () => {
    expect((await fetch(`${origin}/quick/verify`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await fetch(`${origin}/quick/claim`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await fetch(`${origin}/organizer/events/00000000-0000-0000-0000-000000000000/purchases`)).status).toBe(401);
    const absent = await fetch(`${origin}/quick/order`, { headers: { authorization: `Bearer ${"x".repeat(43)}` } });
    expect(absent.status).toBe(404);
  });
  it("bounds anonymous write attempts", async () => {
    const results = await Promise.all(Array.from({ length: 35 }, () => fetch(`${origin}/quick/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })));
    expect(results.some(r => r.status === 429)).toBe(true);
  });
});
