import { HttpException, type ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { SensitiveRateGuard } from "./sensitive-rate.guard.js";

function context(path: string, userId?: string): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => ({ path, method: "POST", ip: "127.0.0.1", user: userId ? { userId, role: "guest" } : undefined }) }) } as unknown as ExecutionContext;
}

describe("sensitive action rate guard", () => {
  it("limits login by address and isolates authenticated users", () => {
    const guard = new SensitiveRateGuard();
    for (let i = 0; i < 10; i++) expect(guard.canActivate(context("/auth/telegram/widget"))).toBe(true);
    expect(() => guard.canActivate(context("/auth/telegram/widget"))).toThrow(HttpException);
    for (let i = 0; i < 30; i++) expect(guard.canActivate(context("/organizer/events/00000000-0000-4000-8000-000000000001/campaigns/00000000-0000-4000-8000-000000000002/send", "u1"))).toBe(true);
    expect(() => guard.canActivate(context("/organizer/events/00000000-0000-4000-8000-000000000003/campaigns/00000000-0000-4000-8000-000000000004/send", "u1"))).toThrow(HttpException);
    expect(guard.canActivate(context("/organizer/events/00000000-0000-4000-8000-000000000003/campaigns/00000000-0000-4000-8000-000000000004/send", "u2"))).toBe(true);
  });
});
