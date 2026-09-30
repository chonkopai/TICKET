import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";

import { normalizeContact } from "./contact-identity.js";

describe("verified contact normalization", () => {
  it("folds email case without collapsing plus tags or dots", () => {
    expect(normalizeContact("email", "  Alice.Tag+Seat@Example.COM  ")).toBe("alice.tag+seat@example.com");
    expect(normalizeContact("email", "alicetag@example.com")).not.toBe(normalizeContact("email", "alice.tag@example.com"));
  });

  it("requires valid explicitly international phone numbers", () => {
    expect(normalizeContact("phone", "+1 (202) 555-0123")).toBe("+12025550123");
    expect(() => normalizeContact("phone", "2025550123")).toThrow(BadRequestException);
    expect(() => normalizeContact("phone", "+123")).toThrow(BadRequestException);
  });
});
