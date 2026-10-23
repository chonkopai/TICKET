import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import type { PrismaClient } from "@event-platform/database";
import { hashPassword } from "../auth/password.js";
import { staffAudit } from "./staff.config.js";
export async function bootstrapModerator(
  db: PrismaClient,
  email: string,
  name: string,
  password: string,
) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) || !name.trim())
    throw new Error("Valid email and name are required");
  const passwordHash = await hashPassword(password);
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended('staff-team',0))`;
    if (await tx.staffAccount.count())
      throw new Error("Staff already exists; use a moderator invitation");
    const row = await tx.staffAccount.create({
      data: {
        email: normalized,
        name: name.trim().slice(0, 120),
        role: "moderator",
        passwordHash,
      },
    });
    await staffAudit(
      tx,
      { id: row.id, role: row.role },
      "staff.bootstrapped",
      "staff",
      row.id,
    );
    return { id: row.id, email: row.email };
  });
}
async function main() {
  const { staffConfig, enabled } = await import("./staff.config.js");
  enabled(staffConfig());
  const { prisma } = await import("@event-platform/database");
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const input = createInterface({
    input: process.stdin,
    output,
    terminal: !!process.stdin.isTTY,
  });
  try {
    const email = await input.question("Moderator email: "),
      name = await input.question("Name: ");
    process.stdout.write("Password (12+ characters, hidden): ");
    muted = true;
    const password = await input.question("");
    muted = false;
    process.stdout.write("\n");
    const result = await bootstrapModerator(prisma, email, name, password);
    process.stdout.write(
      `Moderator created: ${result.email}. Sign in and enroll MFA.\n`,
    );
  } finally {
    input.close();
    await prisma.$disconnect();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main().catch(() => {
    process.stderr.write(
      "Bootstrap failed. Check configuration, password length, and whether staff already exists.\n",
    );
    process.exitCode = 1;
  });
