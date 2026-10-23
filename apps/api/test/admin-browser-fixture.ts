/** Disposable local browser fixtures. This command refuses every non-test database. */
import { prisma } from "@event-platform/database";
import { loadApiEnv } from "@event-platform/config";
import { generateSecret } from "otplib";
import { writeFile } from "node:fs/promises";
import { hashPassword } from "../src/auth/password.js";
import { encrypt, staffConfig } from "../src/staff/staff.config.js";
const env = loadApiEnv(),
  url = new URL(env.DATABASE_URL),
  password = process.env.ADMIN_BROWSER_FIXTURE_PASSWORD;
if (
  env.NODE_ENV !== "test" ||
  !["localhost", "127.0.0.1"].includes(url.hostname) ||
  !url.pathname.startsWith("/ticket_admin_test") ||
  !password
)
  throw new Error(
    "Disposable local test database and explicit fixture password required",
  );
const hash = await hashPassword(password),
  secret = generateSecret();
const staff = await prisma.staffAccount.create({
  data: {
    email: `browser-staff-${Date.now()}@example.test`,
    name: "Модератор TICKET · тест",
    role: "moderator",
    passwordHash: hash,
    mfaSecret: encrypt(secret, staffConfig()),
    mfaConfirmedAt: new Date(),
  },
});
const users = [];
for (const role of ["guest", "organizer"] as const) {
  const email = `browser-${role}-${Date.now()}@example.test`;
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: hash,
      name:
        role === "organizer"
          ? "Анна · Тестовый организатор"
          : "Иван · Тестовый покупатель",
      role,
      contactIdentities: {
        create: {
          method: "email",
          normalizedIdentifier: email,
          verifiedAt: new Date(),
        },
      },
    },
  });
  if (role === "organizer")
    await prisma.organizerProfile.create({
      data: {
        userId: user.id,
        organizationName: "TICKET Demo Events",
        showContactInfo: false,
      },
    });
  users.push({ role, id: user.id, email });
}
const event = await prisma.event.create({
  data: {
    organizerId: users[1]!.id,
    title: "Тестовый концерт TICKET",
    description: "Событие для локальной проверки административной системы.",
    date: new Date("2031-10-22"),
    time: new Date("1970-01-01T19:00Z"),
    timezone: "Asia/Almaty",
    address: "Тестовый зал, Алматы",
    status: "published",
    category: "music",
    city: "Алматы",
    countryCode: "KZ",
  },
});
await prisma.ticketType.create({
  data: {
    eventId: event.id,
    name: "Стандарт",
    price: 200000,
    currency: "KZT",
    quantityTotal: 100,
    status: "active",
  },
});
const fixture = {
  staff: { id: staff.id, email: staff.email, secret },
  users,
  eventId: event.id,
};
await writeFile(
  "/tmp/ticket-admin-browser-fixture.json",
  JSON.stringify(fixture),
  { mode: 0o600 },
);
console.log(
  JSON.stringify({ staffEmail: staff.email, users, eventId: event.id }),
);
await prisma.$disconnect();
