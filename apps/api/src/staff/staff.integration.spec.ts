import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "@event-platform/database";
import { NestFactory } from "@nestjs/core";
import type { INestApplication } from "@nestjs/common";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { generate } from "otplib";
import { AppModule } from "../app.module.js";
import { hashPassword } from "../auth/password.js";
import { BookingService } from "../booking/booking.service.js";
import { TokenService } from "../auth/token.service.js";
import { AuthService } from "../auth/auth.service.js";
import { StaffAuthService, staffCookie } from "./staff-auth.service.js";
import { PlatformSupportService } from "./platform-support.service.js";
import { StaffManagementService, csvCell } from "./staff-management.service.js";
import { StaffRefundsService } from "./staff-refunds.service.js";
import { digest, type StaffPrincipal } from "./staff.config.js";
import { bootstrapModerator } from "./bootstrap.js";
import { AnonymousService, secretHash } from "../orders/anonymous.service.js";
import { EventNotificationsService } from "../events/event-notifications.service.js";
import { TicketEmailDeliveryService } from "../orders/ticket-email-delivery.service.js";
import {
  DevelopmentPaymentProvider,
  type PaymentProvider,
} from "../booking/payment-provider.js";
const enabled = process.env.STAFF_DATABASE_TEST === "true";
if (enabled) {
  const url = new URL(process.env.DATABASE_URL ?? "http://invalid");
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/ticket_admin_test")
  )
    throw new Error(
      "Admin tests require the disposable ticket_admin_test database",
    );
}
const suite = enabled ? describe : describe.skip;
suite("isolated staff / platform integration", () => {
  let app: INestApplication,
    base: string,
    auth: StaffAuthService,
    support: PlatformSupportService,
    management: StaffManagementService,
    refunds: StaffRefundsService,
    privateDir: string;
  const namespace = randomUUID().slice(0, 8),
    password = "test-only-staff-password-123",
    reason = "Customer requested eligible cancellation",
    customer = randomUUID(),
    other = randomUUID(),
    organizer = randomUUID(),
    legacy = randomUUID(),
    event = randomUUID(),
    type = randomUUID();
  let admin: StaffPrincipal,
    agent: StaffPrincipal,
    adminToken: string,
    adminCsrf: string,
    agentToken: string,
    agentCsrf: string,
    customerToken: string,
    legacyToken: string,
    agentEmail: string,
    recoveryCodes: string[] = [];
  const mails: { to: string; url: string }[] = [];
  async function request(
    path: string,
    method = "GET",
    body?: unknown,
    who: "admin" | "support" | "public" | "none" = "admin",
    extra: Record<string, string> = {},
  ) {
    const staff = who === "admin" || who === "support";
    return fetch(base + path, {
      method,
      headers: {
        ...(staff
          ? {
              "x-staff-gateway": auth.config.gatewaySecret,
              "x-staff-origin": auth.config.origin,
              cookie: `${staffCookie(auth.config)}=${who === "admin" ? adminToken : agentToken}`,
              "x-staff-csrf": who === "admin" ? adminCsrf : agentCsrf,
            }
          : who === "public"
            ? { authorization: `Bearer ${customerToken}` }
            : {}),
        ...(body ? { "content-type": "application/json" } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function enroll(email: string) {
    const login = await auth.login(email, password),
      actor = await auth.authenticate(
        login.token,
        login.session.csrf,
        true,
        true,
      ),
      enrollment = await auth.enrollment(actor),
      result = await auth.otp(
        actor,
        await generate({ secret: enrollment.secret }),
      );
    return { ...result, actor: await auth.authenticate(result.token) };
  }
  async function purchase(
    options: {
      anonymous?: boolean;
      currency?: string;
      used?: boolean;
      legacy?: boolean;
    } = {},
  ) {
    const id = randomUUID(),
      currency = options.currency ?? "KZT",
      now = new Date();
    const snapshot = options.legacy
      ? {
          eventId: event,
          eventTitle: "Historical purchase",
          itemId: type,
          itemKind: "ticket",
          itemName: "Entry",
          quantity: 2,
          amountDue: 2000,
          paymentMode: "full_payment",
        }
      : {
          version: 2,
          eventId: event,
          sourceLocale: "ru",
          contentLocale: "ru",
          title: "Integration concert",
          address: "Test street",
          startsAt: "2031-10-22T10:00:00.000Z",
          endsAt: null,
          timezone: "UTC",
          saleMode: "paid_general",
          amount: 2000,
          currency,
          acceptedAt: now.toISOString(),
          refund: {
            available: true,
            conditions: "Before entry",
            revision: 1,
            locale: "ru",
            freeCancellation: false,
          },
          items: [
            {
              resourceId: type,
              kind: "ticket",
              name: "Entry",
              quantity: 2,
              unitAmount: 1000,
            },
          ],
        };
    await prisma.order.create({
      data: {
        id,
        type: "ticket",
        buyerUserId: options.anonymous ? null : customer,
        amount: 2000,
        currency,
        paymentStatus: "paid",
        checkoutSnapshot: snapshot,
      },
    });
    await prisma.payment.create({
      data: {
        orderId: id,
        provider: "mock",
        providerRequestKey: randomUUID(),
        providerPaymentId: `dev-${id}`,
        amount: 2000,
        currency,
        status: "paid",
        webhookReceivedAt: now,
      },
    });
    await prisma.ticketType.update({
      where: { id: type },
      data: { quantitySold: { increment: 2 } },
    });
    const tickets = await Promise.all(
      [0, 1].map((_, index) =>
        prisma.ticket.create({
          data: {
            orderId: id,
            ticketTypeId: type,
            ownerUserId: options.anonymous ? null : customer,
            qrToken: randomUUID(),
            status: options.used && index === 0 ? "used" : "active",
            ...(options.used && index === 0 ? { usedAt: now } : {}),
          },
        }),
      ),
    );
    return { id, tickets };
  }
  beforeAll(async () => {
    privateDir = await mkdtemp(join(tmpdir(), "ticket-staff-integration-"));
    app = await NestFactory.create(AppModule, { logger: false });
    await app.listen(0, "127.0.0.1");
    base = await app.getUrl();
    auth = app.get(StaffAuthService);
    support = app.get(PlatformSupportService);
    management = app.get(StaffManagementService);
    refunds = app.get(StaffRefundsService);
    auth.config.storageDir = privateDir;
    // Only this service instance gets a fake mail adapter. No external email is sent.
    auth.config.emailKey = "test-only";
    auth.config.emailFrom = "test@mail.ticketron.live";
    vi.spyOn(
      auth as unknown as {
        sendEmail: (to: string, subject: string, url: string) => Promise<void>;
      },
      "sendEmail",
    ).mockImplementation(async (to, _subject, url) => {
      mails.push({ to, url });
    });
    const staff = await prisma.staffAccount.create({
      data: {
        email: `moderator-${namespace}@example.test`,
        name: "Тестовый модератор",
        role: "moderator",
        passwordHash: await hashPassword(password),
      },
    });
    const session = await enroll(staff.email);
    admin = session.actor;
    adminToken = session.token;
    adminCsrf = session.session.csrf;
    for (const old of await prisma.staffAccount.findMany({
      where: { id: { not: staff.id }, disabledAt: null },
    }))
      await auth.change(admin, old.id, {
        disabled: true,
        reason: "Retire previous disposable test fixture",
      });
    await prisma.user.createMany({
      data: [
        {
          id: customer,
          role: "guest",
          name: `Покупатель ${namespace}`,
          email: `buyer-${namespace}@example.test`,
        },
        { id: other, role: "guest", name: "Другой покупатель" },
        { id: organizer, role: "organizer", name: "Тестовый организатор" },
        { id: legacy, role: "admin", name: "Legacy public admin" },
      ],
    });
    await prisma.event.create({
      data: {
        id: event,
        organizerId: organizer,
        title: "Integration concert",
        description: "Test",
        date: new Date("2031-10-22"),
        time: new Date("1970-01-01T10:00Z"),
        timezone: "UTC",
        address: "Test street",
        status: "published",
        category: "music",
        countryCode: "KZ",
        city: "Almaty",
      },
    });
    await prisma.ticketType.create({
      data: {
        id: type,
        eventId: event,
        name: "Entry",
        price: 1000,
        currency: "KZT",
        quantityTotal: 1000,
        status: "active",
      },
    });
    await management.commission(admin, {
      basisPoints: 500,
      reason: "Explicit commission for disposable test purchases",
    });
    customerToken = (
      await app
        .get(TokenService)
        .issuePair(
          await prisma.user.findUniqueOrThrow({ where: { id: customer } }),
        )
    ).accessToken;
    legacyToken = (
      await app
        .get(TokenService)
        .issuePair(
          await prisma.user.findUniqueOrThrow({ where: { id: legacy } }),
        )
    ).accessToken;
  }, 30000);
  afterAll(async () => {
    vi.restoreAllMocks();
    if (app) await app.close();
    if (privateDir) await rm(privateDir, { recursive: true, force: true });
    await prisma.$disconnect();
  });
  it("separates staff APIs from public and legacy admin tokens, requires gateway and CSRF", async () => {
    expect(
      (
        await request("/staff/users", "GET", undefined, "none", {
          authorization: `Bearer ${legacyToken}`,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/staff/users", "GET", undefined, "admin", {
          cookie: "",
          authorization: `Bearer ${legacyToken}`,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          `/staff/users/${other}/block`,
          "POST",
          { reason },
          "admin",
          { "x-staff-csrf": "wrong" },
        )
      ).status,
    ).toBe(403);
    expect((await request("/staff/users")).status).toBe(200);
  });
  it("prevents the last enrolled Moderator from being disabled or demoted", async () => {
    await expect(
      auth.change(admin, admin.id, { disabled: true, reason }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      bootstrapModerator(prisma, "another@example.test", "Another", password),
    ).rejects.toThrow("Staff already exists");
  });
  it("invites Support with hashed single-use tokens; MFA is mandatory and encrypted", async () => {
    agentEmail = `support-${namespace}@example.test`;
    await auth.invite(admin, {
      email: agentEmail,
      name: "Тестовая поддержка",
      role: "support",
    });
    const raw = new URL(mails.at(-1)!.url).hash.slice("#invite=".length);
    expect(mails.at(-1)!.url).toContain("/admin/login#invite=");
    const token = await prisma.staffToken.findUniqueOrThrow({
      where: { tokenHash: digest(raw) },
    });
    expect(token.tokenHash).not.toBe(raw);
    await auth.accept(raw, password, "invite");
    await expect(auth.accept(raw, password, "invite")).rejects.toMatchObject({
      status: 401,
    });
    const pending = await auth.login(agentEmail, password);
    await expect(auth.authenticate(pending.token)).rejects.toMatchObject({
      status: 401,
    });
    const session = await enroll(agentEmail);
    agent = session.actor;
    agentToken = session.token;
    agentCsrf = session.session.csrf;
    recoveryCodes = session.recoveryCodes;
    const stored = await prisma.staffAccount.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(stored.mfaSecret).not.toMatch(/^[A-Z2-7]+$/);
    expect(stored.recoveryHashes).not.toContain(recoveryCodes[0]);
    expect(
      (await request("/staff/finance", "GET", undefined, "support")).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/staff/users/${other}/block`,
          "POST",
          { reason },
          "support",
        )
      ).status,
    ).toBe(403);
  });
  it("expires invitations and provides a truthful mail-unavailable recovery state", async () => {
    const email = `expired-${namespace}@example.test`;
    await auth.invite(admin, { email, name: "Expired", role: "support" });
    const raw = new URL(mails.at(-1)!.url).hash.slice("#invite=".length);
    await prisma.staffToken.update({
      where: { tokenHash: digest(raw) },
      data: { expiresAt: new Date(0) },
    });
    await expect(auth.accept(raw, password, "invite")).rejects.toMatchObject({
      status: 401,
    });
    const old = auth.config.emailKey;
    auth.config.emailKey = undefined;
    await expect(auth.recover(agentEmail)).rejects.toMatchObject({
      status: 503,
    });
    auth.config.emailKey = old;
  });
  it("recovers a staff password, consumes recovery codes once, and immediately revokes sessions", async () => {
    await auth.recover(agentEmail);
    const raw = new URL(mails.at(-1)!.url).hash.slice(7);
    await auth.accept(raw, password, "reset");
    await expect(auth.authenticate(agentToken)).rejects.toMatchObject({
      status: 401,
    });
    const login = await auth.login(agentEmail, password),
      pending = await auth.authenticate(login.token, undefined, false, true),
      result = await auth.otp(pending, recoveryCodes[0]!);
    agentToken = result.token;
    agentCsrf = result.session.csrf;
    agent = await auth.authenticate(agentToken);
    const again = await auth.login(agentEmail, password);
    await expect(
      auth.otp(
        await auth.authenticate(again.token, undefined, false, true),
        recoveryCodes[0]!,
      ),
    ).rejects.toMatchObject({ status: 401 });
  });
  it("keeps customer/organizer cases independent and excludes internal notes and impersonation", async () => {
    const input = {
      subject: "Помогите с заказом",
      text: "Первый вопрос",
      clientKey: randomUUID(),
    };
    const row = await support.create(
      { userId: customer, role: "guest" },
      input,
    );
    await support.create(
      { userId: organizer, role: "organizer" },
      { ...input, subject: "Вопрос организатора", clientKey: randomUUID() },
    );
    await expect(
      support.messages(row.id, { userId: other }, {}),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      support.message(
        row.id,
        { userId: customer },
        { text: "Fake", clientKey: randomUUID(), internal: true },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      support.message(
        row.id,
        { userId: customer },
        { text: "Fake", clientKey: randomUUID(), authorKind: "moderator" },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await support.message(row.id, agent, {
      text: "Секретная заметка",
      clientKey: randomUUID(),
      internal: true,
    });
    await support.message(row.id, agent, {
      text: "Ответ поддержки",
      clientKey: randomUUID(),
    });
    const publicMessages = await support.messages(
      row.id,
      { userId: customer },
      {},
    );
    expect(publicMessages.items.map((v) => v.text)).not.toContain(
      "Секретная заметка",
    );
    expect(publicMessages.items.map((v) => v.authorKind)).toContain("support");
    await support.update(row.id, agent, { status: "closed", reason });
    await support.message(
      row.id,
      { userId: customer },
      { text: "Ещё вопрос", clientKey: randomUUID() },
    );
    expect((await support.access(row.id, agent)).status).toBe("in_progress");
  });
  it("paginates linked order chat inspection and records each staff access", async () => {
    const order = await purchase();
    const row = await support.create(
      { userId: customer },
      {
        subject: "Order conversation investigation",
        text: "Please inspect the discussion",
        orderId: order.id,
        clientKey: randomUUID(),
      },
    );
    await prisma.chatMessage.createMany({
      data: ["First", "Second", "Third"].map((text, index) => ({
        eventId: event,
        orderId: order.id,
        organizerId: organizer,
        guestUserId: customer,
        sender: "guest" as const,
        text,
        createdAt: new Date(1800000000000 + index),
      })),
    });
    const first = await request(
      `/staff/cases/${row.id}/order-chat?limit=2`,
      "GET",
      undefined,
      "support",
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({
      page: 1,
      limit: 2,
      total: 3,
      items: [{ text: "First" }, { text: "Second" }],
    });
    const next = await support.orderChat(row.id, agent, {
      page: "2",
      limit: "2",
    });
    expect(next.items.map((item) => item.text)).toEqual(["Third"]);
    expect(
      await prisma.staffAudit.count({
        where: {
          action: "support.order_chat_viewed",
          caseId: row.id,
          staffId: agent.id,
        },
      }),
    ).toBe(2);
  });
  it("requires a validated anonymous order capability, with attachment ownership", async () => {
    const order = await purchase({ anonymous: true }),
      raw = randomUUID(),
      id = randomUUID();
    await prisma.anonymousCheckoutSession.create({
      data: {
        id,
        name: "Anonymous",
        sessionHash: randomUUID(),
        accessHash: secretHash(raw),
        expiresAt: new Date(Date.now() + 600000),
        accessExpiresAt: new Date(Date.now() + 600000),
        orderId: order.id,
      },
    });
    const session = await app.get(AnonymousService).access(raw),
      actor = { anonymousSessionId: session.id, orderId: session.orderId };
    const row = await support.create(actor, {
      subject: "Anonymous order",
      text: "Help",
      clientKey: randomUUID(),
    });
    expect(
      (
        await request(
          `/platform-support/cases/${row.id}/messages`,
          "GET",
          undefined,
          "none",
          { "x-quick-access": raw },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/platform-support/cases/${row.id}/messages`,
          "GET",
          undefined,
          "public",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/platform-support/cases/${row.id}/messages`,
          "GET",
          undefined,
          "none",
          { "x-quick-access": order.id },
        )
      ).status,
    ).toBe(404);
    const buffer = Buffer.from(
      "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
    );
    const file = await support.upload(
      actor,
      {
        buffer,
        size: buffer.length,
        mimetype: "application/pdf",
        originalname: "receipt.pdf",
      },
      row.id,
    );
    await support.message(row.id, actor, {
      text: "Файл",
      clientKey: randomUUID(),
      fileIds: [file.id],
    });
    expect((await support.file(file.id, actor)).buffer).toEqual(buffer);
    await expect(
      support.file(file.id, { userId: other }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("preserves verification versions, review messages, private files and badge revocation", async () => {
    const buffer = Buffer.from("%PDF-1.4\n<< /Type /Catalog >>\n%%EOF"),
      upload = () =>
        support.upload(
          { userId: organizer },
          {
            buffer,
            size: buffer.length,
            mimetype: "application/pdf",
            originalname: "business.pdf",
          },
        );
    let file = await upload();
    const input = {
      legalName: "Тестовая компания",
      entityType: "ooo",
      countryCode: "KZ",
      registrationId: "international-id-123",
      email: "test@example.test",
      phone: "+77000000000",
      fileIds: [file.id],
    };
    const first = await support.submit(organizer, input);
    await expect(support.submit(organizer, input)).rejects.toMatchObject({
      status: 409,
    });
    await expect(support.file(file.id, agent)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      support.file(file.id, { userId: other }),
    ).rejects.toMatchObject({ status: 404 });
    expect((await support.file(file.id, admin)).buffer).toEqual(buffer);
    expect(
      (await request(`/staff/files/${file.id}`, "GET", undefined, "support"))
        .status,
    ).toBe(403);
    await support.review(first.id, admin, {
      decision: "changes_requested",
      reason: "Добавьте актуальную регистрацию",
    });
    file = await upload();
    const next = await support.submit(organizer, {
      ...input,
      fileIds: [file.id],
    });
    expect(next.version).toBe(2);
    await support.review(next.id, admin, {
      decision: "verified",
      reason: "Регистрация проверена модератором",
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: organizer } }))
        .organizerVerifiedAt,
    ).not.toBeNull();
    expect(
      (
        (await (
          await request(`/events/${event}`, "GET", undefined, "none")
        ).json()) as { organizer: { verified: boolean } }
      ).organizer.verified,
    ).toBe(true);
    await support.review(next.id, admin, {
      decision: "revoked",
      reason: "Предоставленные данные больше не актуальны",
    });
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: organizer } }))
        .organizerVerifiedAt,
    ).toBeNull();
    expect(
      (
        (await (
          await request(`/events/${event}`, "GET", undefined, "none")
        ).json()) as { organizer: { verified: boolean } }
      ).organizer.verified,
    ).toBe(false);
    expect(
      (await support.verification(organizer)).map((v) => v.status),
    ).toEqual(["revoked", "changes_requested"]);
  });
  it("rejects forged and active-content documents server-side", async () => {
    const bad = Buffer.from("%PDF-1.4 /JavaScript (evil) %%EOF");
    await expect(
      support.upload(
        { userId: organizer },
        {
          buffer: bad,
          size: bad.length,
          mimetype: "application/pdf",
          originalname: "bad.pdf",
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      support.upload(
        { userId: organizer },
        {
          buffer: bad,
          size: bad.length,
          mimetype: "image/png",
          originalname: "bad.png",
        },
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("refunds one admission without changing the remaining QR and deduplicates concurrent retries", async () => {
    const order = await purchase(),
      key = randomUUID(),
      input = { key, ticketIds: [order.tickets[0]!.id], reason };
    const [a, b] = await Promise.all([
      refunds.request(agent, order.id, input),
      refunds.request(agent, order.id, input),
    ]);
    expect(a.id).toBe(b.id);
    expect((await refunds.process(a.id)).status).toBe("succeeded");
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("paid");
    const unchanged = await prisma.ticket.findUniqueOrThrow({
      where: { id: order.tickets[1]!.id },
    });
    expect(unchanged).toMatchObject({
      status: "active",
      qrToken: order.tickets[1]!.qrToken,
    });
    expect((await refunds.quote(order.id)).remaining).toBe(1000);
    await refunds.request(agent, order.id, { key: randomUUID(), reason });
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("refunded");
    expect(
      (
        await prisma.staffRefund.aggregate({
          where: { orderId: order.id, status: "succeeded" },
          _sum: { amount: true },
        })
      )._sum.amount,
    ).toBe(2000);
    await expect(
      refunds.request(agent, order.id, { key: randomUUID(), reason }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("keeps settled timestamps and refunded status on delayed duplicate payment callbacks", async () => {
    const order = await purchase(),
      booking = app.get(BookingService),
      payment = await prisma.payment.findFirstOrThrow({
        where: { orderId: order.id },
      });
    const webhook = {
      provider: "mock",
      eventId: randomUUID(),
      eventType: "payment.succeeded" as const,
      providerPaymentId: payment.providerPaymentId!,
      orderId: order.id,
      amount: 2000,
      currency: "KZT",
      occurredAt: new Date(),
      payloadHash: digest(randomUUID()),
    };
    await booking.handlePaymentWebhook(webhook);
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .webhookReceivedAt,
    ).toEqual(payment.webhookReceivedAt);
    await refunds.request(agent, order.id, { key: randomUUID(), reason });
    await booking.handlePaymentWebhook({ ...webhook, eventId: randomUUID() });
    expect(
      (await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } }))
        .status,
    ).toBe("refunded");
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .paymentStatus,
    ).toBe("refunded");
  });
  it("rejects used tickets and unsupported legacy partials; permits an unused individual remainder", async () => {
    const order = await purchase({ used: true });
    await expect(
      refunds.request(agent, order.id, { key: randomUUID(), reason }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await refunds.request(agent, order.id, {
          key: randomUUID(),
          reason,
          ticketIds: [order.tickets[1]!.id],
        })
      ).status,
    ).toBe("succeeded");
    const old = await purchase({ legacy: true });
    await expect(
      refunds.request(admin, old.id, {
        key: randomUUID(),
        reason,
        override: true,
        ticketIds: [old.tickets[0]!.id],
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (
        await refunds.request(admin, old.id, {
          key: randomUUID(),
          reason,
          override: true,
        })
      ).status,
    ).toBe("succeeded");
  });
  it("represents provider failure and uncertain outcomes without releasing admissions or over-refunding", async () => {
    const order = await purchase();
    let state: "uncertain" | "succeeded" | "failed" = "uncertain",
      calls = 0;
    const fake: PaymentProvider = {
      ...new DevelopmentPaymentProvider("http://localhost:3400", "test-only"),
      name: "mock",
      createPaymentLink: vi.fn(),
      verifyWebhook: vi.fn(),
      async requestRefund() {
        calls++;
        if (state === "uncertain") throw new Error("Timeout");
        return { status: state, providerRefundId: "test-refund-reference" };
      },
      async lookupRefund() {
        return {
          status: state === "uncertain" ? "processing" : state,
          providerRefundId: "test-refund-reference",
        };
      },
    };
    const service = new StaffRefundsService(prisma, fake);
    const response = await service.request(agent, order.id, {
      key: randomUUID(),
      reason,
    });
    expect(response.status).toBe("processing");
    await service.process(response.id);
    expect(calls).toBe(1);
    expect(
      (
        await prisma.ticket.findUniqueOrThrow({
          where: { id: order.tickets[0]!.id },
        })
      ).status,
    ).toBe("active");
    state = "succeeded";
    await Promise.all([
      service.process(response.id),
      service.process(response.id),
    ]);
    expect(
      (
        await prisma.staffRefund.findUniqueOrThrow({
          where: { id: response.id },
        })
      ).status,
    ).toBe("succeeded");
    const rejected = await purchase();
    state = "failed";
    expect(
      (await service.request(agent, rejected.id, { key: randomUUID(), reason }))
        .status,
    ).toBe("failed");
    expect(
      (
        await prisma.ticket.findUniqueOrThrow({
          where: { id: rejected.tickets[0]!.id },
        })
      ).status,
    ).toBe("active");
  });
  it("resends the original ticket through the durable fake email adapter, once per request", async () => {
    const order = await purchase(),
      delivery = app.get(TicketEmailDeliveryService);
    const sender = (
      delivery as unknown as {
        sender: {
          available: () => boolean;
          send: (value: unknown) => Promise<{ id: string }>;
        };
      }
    ).sender;
    const available = vi.spyOn(sender, "available").mockReturnValue(true),
      send = vi
        .spyOn(sender, "send")
        .mockResolvedValue({ id: "fake-accepted-email" });
    await prisma.order.update({
      where: { id: order.id },
      data: {
        emailDeliveryAddress: "verified-fixture@example.test",
        emailDeliveryRequestedAt: new Date(Date.now() - 3600000),
      },
    });
    await prisma.ticketEmailDelivery.create({
      data: {
        orderId: order.id,
        recipient: "verified-fixture@example.test",
        capabilityHash: randomUUID(),
        capabilityExpiresAt: new Date(Date.now() + 3600000),
        status: "accepted",
        updatedAt: new Date(Date.now() - 3600000),
      },
    });
    const key = randomUUID();
    await Promise.all([
      management.resend(agent, order.id, key, reason),
      management.resend(agent, order.id, key, reason),
    ]);
    expect(
      (
        await prisma.ticketEmailDelivery.findUniqueOrThrow({
          where: { orderId: order.id },
        })
      ).generation,
    ).toBe(2);
    await delivery.tick();
    await delivery.tick();
    expect(send).toHaveBeenCalledTimes(1);
    expect(
      (
        await prisma.ticket.findUniqueOrThrow({
          where: { id: order.tickets[0]!.id },
        })
      ).qrToken,
    ).toBe(order.tickets[0]!.qrToken);
    await expect(
      management.resend(agent, order.id, randomUUID(), reason),
    ).rejects.toMatchObject({ status: 409 });
    send.mockRestore();
    available.mockRestore();
  });
  it("queues Telegram resends through the existing delivery worker without replacing QR codes", async () => {
    const order = await purchase(),
      telegram = app.get(EventNotificationsService),
      chatId = BigInt(Date.now()) + 500000000000n;
    await prisma.user.update({
      where: { id: customer },
      data: { telegramChatId: chatId },
    });
    try {
      const key = randomUUID();
      await management.resend(agent, order.id, key, reason, "telegram");
      await management.resend(agent, order.id, key, reason, "telegram");
      const photo = vi.fn(async () => "fake-telegram-message");
      await telegram.tick(async () => "fake-message", photo);
      expect(photo).toHaveBeenCalledTimes(2);
      expect(
        (
          await prisma.ticket.findUniqueOrThrow({
            where: { id: order.tickets[0]!.id },
          })
        ).qrToken,
      ).toBe(order.tickets[0]!.qrToken);
      const notifications = await prisma.notification.findMany({
        where: {
          type: "ticket.resend",
          payload: { path: ["orderId"], equals: order.id },
        },
      });
      expect(notifications).toHaveLength(2);
      expect(notifications.every((row) => row.status === "sent")).toBe(true);
    } finally {
      await prisma.user.update({
        where: { id: customer },
        data: { telegramChatId: null },
      });
    }
  });
  it("expires staff sessions, immediately observes role changes, and safely resets MFA", async () => {
    const login = await auth.login(agentEmail, password),
      pending = await auth.authenticate(login.token, undefined, false, true);
    const replacement = await auth.otp(pending, recoveryCodes[1]!);
    await prisma.staffSession.update({
      where: { id: replacement.id },
      data: { expiresAt: new Date(0) },
    });
    await expect(auth.authenticate(replacement.token)).rejects.toMatchObject({
      status: 401,
    });
    await auth.change(admin, agent.id, { role: "support", reason });
    await expect(auth.authenticate(agentToken)).rejects.toMatchObject({
      status: 401,
    });
    const next = await auth.login(agentEmail, password),
      full = await auth.otp(
        await auth.authenticate(next.token, undefined, false, true),
        recoveryCodes[2]!,
      );
    agentToken = full.token;
    agentCsrf = full.session.csrf;
    agent = await auth.authenticate(full.token);
    await expect(
      auth.resetMfa(agent, "wrong-password", recoveryCodes[3]!),
    ).rejects.toMatchObject({ status: 401 });
    await auth.resetMfa(agent, password, recoveryCodes[3]!);
    await expect(auth.authenticate(agentToken)).rejects.toMatchObject({
      status: 401,
    });
    const enrolled = await enroll(agentEmail);
    agent = enrolled.actor;
    agentToken = enrolled.token;
    agentCsrf = enrolled.session.csrf;
  });
  it("blocks direct sales for hidden events and blocked organizers while preserving old purchase support", async () => {
    await management.moderate(event, admin, { action: "hide", reason });
    await expect(purchase()).rejects.toThrow();
    await management.moderate(event, admin, { action: "unhide", reason });
    await management.block(organizer, admin, true, { reason });
    await expect(purchase()).rejects.toThrow();
    await management.block(organizer, admin, false, { reason });
    const order = await purchase();
    expect(
      (
        await management.orders({
          search: `TKT-${order.tickets[0]!.id.replaceAll("-", "")}`,
        })
      ).items.some((v) => v.id === order.id),
    ).toBe(true);
    await management.block(customer, admin, true, { reason });
    await expect(
      app.get(AuthService).authenticate(customerToken),
    ).rejects.toMatchObject({ status: 401 });
    await expect(purchase()).rejects.toThrow();
    expect(
      (await support.cases({ userId: customer }, {})).total,
    ).toBeGreaterThan(0);
    await management.block(customer, admin, false, { reason });
  });
  it("separates currencies and mock money, records external payouts once and audits reversals", async () => {
    await purchase({ currency: "USD" });
    const real = await management.finance({}),
      demo = await management.finance({
        testOnly: "true",
        organizerId: organizer,
      });
    expect(real.groups.every((v) => !v.testOnly)).toBe(true);
    expect(demo.groups.map((v) => v.currency).sort()).toEqual(["KZT", "USD"]);
    expect(demo.transactions.length).toBeGreaterThan(0);
    const input = {
      key: randomUUID(),
      organizerId: organizer,
      amount: 500,
      currency: "KZT",
      reference: `test-${namespace}`,
      paidAt: new Date().toISOString(),
      testOnly: true,
    };
    const [a, b] = await Promise.all([
      management.payout(admin, input),
      management.payout(admin, input),
    ]);
    expect(a.id).toBe(b.id);
    await management.reversePayout(admin, a.id, { reason });
    expect(
      (await prisma.organizerPayout.findUniqueOrThrow({ where: { id: a.id } }))
        .reversedAt,
    ).not.toBeNull();
    expect(csvCell(' =HYPERLINK("bad")')).toMatch(/^"'/);
  });
  it("uses the refund's actual period rather than moving it into the original sale period", async () => {
    const order = await purchase({ currency: "EUR" });
    await prisma.payment.updateMany({
      where: { orderId: order.id },
      data: { webhookReceivedAt: new Date("2020-01-01T12:00Z") },
    });
    const refund = await refunds.request(agent, order.id, {
      key: randomUUID(),
      reason,
    });
    await prisma.staffRefund.update({
      where: { id: refund.id },
      data: { completedAt: new Date("2030-01-01T12:00Z") },
    });
    const report = await management.finance({
        testOnly: "true",
        organizerId: organizer,
        from: "2030-01-01",
        to: "2030-01-02",
      }),
      group = report.groups.find((row) => row.currency === "EUR");
    expect(group).toMatchObject({
      gross: 0,
      refunds: 2000,
      commission: -100,
      outstanding: null,
    });
    expect(
      report.transactions.some(
        (row) => row.kind === "refund" && row.amount === -2000,
      ),
    ).toBe(true);
    expect(report.balances.find((row) => row.currency === "EUR")).toMatchObject(
      { gross: 2000, refunds: 2000, commission: 0, outstanding: 0 },
    );
  });
  it("preserves immutable audit records without secrets and revokes staff access immediately", async () => {
    const rows = await management.audit({ limit: "100" });
    expect(rows.items.some((v) => v.action === "payout.reversed")).toBe(true);
    const json = JSON.stringify(rows);
    expect(json).not.toContain(password);
    expect(json).not.toContain(adminToken);
    expect(json).not.toContain(recoveryCodes[0]);
    await expect(
      prisma.staffAudit.update({
        where: { id: rows.items[0]!.id },
        data: { reason: "tampered" },
      }),
    ).rejects.toThrow();
    await auth.change(admin, agent.id, { disabled: true, reason });
    expect(
      (await request("/staff/users", "GET", undefined, "support")).status,
    ).toBe(401);
    await auth.logout(admin);
    await expect(auth.authenticate(adminToken)).rejects.toMatchObject({
      status: 401,
    });
  });
});
