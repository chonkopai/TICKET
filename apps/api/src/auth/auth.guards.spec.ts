import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { describe, expect, it, vi } from "vitest";

import { RolesGuard } from "./auth.guards.js";

function contextFor(role: "guest" | "organizer" | "admin"): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    getType: () => "http",
    switchToHttp: () => ({
      getRequest: () => ({ user: { userId: "user-1", role } }),
      getResponse: vi.fn(),
      getNext: vi.fn(),
    }),
  } as unknown as ExecutionContext;
}

describe("RolesGuard", () => {
  it("rejects a guest from an organizer route", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["organizer", "admin"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(contextFor("guest"))).toThrow(ForbiddenException);
  });

  it("allows an organizer", () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(["organizer", "admin"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(contextFor("organizer"))).toBe(true);
  });
});
