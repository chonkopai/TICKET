import type { User } from "@event-platform/database";
import { describe, expect, it } from "vitest";

import { presentUser } from "./auth.presenter.js";

describe("auth presenter", () => {
  it("returns a non-Telegram account without inventing a Telegram identity or exposing credentials", () => {
    const now = new Date();
    const user: User = {
      id: "00000000-0000-4000-8000-000000000101",
      telegramId: null,
      telegramChatId: null,
      role: "guest",
      name: "Alice Example",
      firstName: "Alice",
      lastName: "Example",
      passwordHash: "secret-hash",
      credentialVersion: 2,
      photoUrl: null,
      phone: null,
      email: null,
      defaultCity: null,
      createdAt: now,
      updatedAt: now,
    };
    const result = presentUser(user);
    expect(result).toMatchObject({ id: user.id, telegramId: null, name: "Alice Example" });
    expect(result).not.toHaveProperty("passwordHash");
    expect(result).not.toHaveProperty("credentialVersion");
  });
});
