import { describe, expect, it, vi } from "vitest";
import { IdentityAuthService } from "./identity-auth.service.js";

describe("password recovery registration feedback", () => {
  it.each(["email", "phone"] as const)("reports an unknown %s before checking delivery availability", async method => {
    const issue = vi.fn(), providerAvailable = vi.fn().mockReturnValue(false), enforceCredentialLimit = vi.fn();
    const db = { contactIdentity: { findUnique: vi.fn().mockResolvedValue(null) } };
    const service = new IdentityAuthService(db as never, {} as never, { issue, providerAvailable, enforceCredentialLimit } as never);
    await expect(service.requestPasswordReset({ method, target: method === "email" ? "unknown@example.com" : "+77011234567", clientKey: "test" })).rejects.toMatchObject({ response: { code: method === "email" ? "EMAIL_NOT_REGISTERED" : "PHONE_NOT_REGISTERED" } });
    expect(enforceCredentialLimit).toHaveBeenCalledOnce(); expect(issue).not.toHaveBeenCalled(); expect(providerAvailable).not.toHaveBeenCalled();
  });
  it("keeps recovery available for a registered verified identity", async () => {
    const issue = vi.fn().mockResolvedValue({ challengeId: "real-challenge" });
    const service = new IdentityAuthService({ contactIdentity: { findUnique: vi.fn().mockResolvedValue({ userId: "u" }) } } as never, {} as never, { enforceCredentialLimit: vi.fn(), providerAvailable: () => true, issue } as never);
    await expect(service.requestPasswordReset({ method: "email", target: "KNOWN@example.com", clientKey: "test" })).resolves.toEqual({ challengeId: "real-challenge" });
    expect(issue).toHaveBeenCalledWith({ method: "email", target: "known@example.com", clientKey: "test", purpose: "password_reset" });
  });
});
