import { describe, expect, it } from "vitest";
import { encrypt, decrypt, enabled, type StaffConfig } from "./staff.config.js";
import { sessionCookie, secureEqual } from "./staff-auth.service.js";
import { cookieToken } from "./staff.guards.js";
const config: StaffConfig = {
  enabled: true,
  origin: "https://staging-admin.ticketron.live",
  gatewaySecret: "gateway-test-secret-independent-12345",
  encryptionKey: "ab".repeat(32),
  storageDir: "/tmp/private",
};
describe("staff credential storage and cookies", () => {
  it("encrypts MFA with randomized authenticated encryption", () => {
    const secret = "TEST-ONLY-SECRET",
      first = encrypt(secret, config),
      second = encrypt(secret, config);
    expect(first).not.toBe(second);
    expect(first).not.toContain(secret);
    expect(decrypt(first, config)).toBe(secret);
    expect(() =>
      decrypt(first, { ...config, encryptionKey: "cd".repeat(32) }),
    ).toThrow();
    const [iv, tag, data] = first.split(".");
    expect(() => decrypt(`${iv}.${tag}.${data?.slice(1)}x`, config)).toThrow();
  });
  it("uses a host-only secure staff cookie, isolated from public access tokens", () => {
    const cookie = sessionCookie(config, "test-token", new Date("2030-01-01"));
    expect(cookie).toContain("__Host-ticket-staff=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("Domain=");
    expect(
      sessionCookie(
        { ...config, origin: "http://admin.localhost:3000" },
        "test",
        new Date(),
      ),
    ).toContain("ticket-staff-local=");
  });
  it("rejects unavailable configuration and malformed cookie encodings safely", () => {
    expect(() => enabled({ ...config, enabled: false })).toThrow();
    expect(() => enabled({ ...config, encryptionKey: "bad" })).toThrow();
    expect(
      cookieToken({ headers: { cookie: "__Host-ticket-staff=%ZZ" } }, config),
    ).toBeUndefined();
    expect(secureEqual("secret", "secret")).toBe(true);
    expect(secureEqual("secret", "secrex")).toBe(false);
  });
});
