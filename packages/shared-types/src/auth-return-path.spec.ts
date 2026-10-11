import { describe, expect, it } from "vitest";
import { validatedReturnPath } from "./auth-return-path.js";

describe("authentication return paths", () => {
  it("preserves a same-origin query and hash", () => {
    expect(validatedReturnPath("/events/1?buy=true#tickets", "https://ticket.example", "/")).toBe("/events/1?buy=true#tickets");
  });
  it.each(["//evil.example", "https://evil.example", "javascript:alert(1)", "/\\evil.example", "/\u0000evil", "/login/telegram/callback?code=secret", "", null, "/" + "x".repeat(2048)])("rejects unsafe destination %s", path => {
    expect(validatedReturnPath(path, "https://ticket.example", "/?lang=en")).toBe("/?lang=en");
  });
});
