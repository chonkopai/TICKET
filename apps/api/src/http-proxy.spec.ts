import type { ExecutionContext } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { describe, expect, it } from "vitest";
import { SensitiveRateGuard } from "./auth/sensitive-rate.guard.js";
import { configureHttpProxy } from "./http-proxy.js";

function proxyRequest(hops: number, forwardedFor: string) {
  const app = new ExpressAdapter().getInstance();
  configureHttpProxy(app, hops);
  // Use Express's actual IP getter without opening a network listener.
  return Object.assign(Object.create(app.request), {
    app, socket: { remoteAddress: "172.20.0.3" },
    headers: { "x-forwarded-for": forwardedFor },
    method: "POST", url: "/auth/telegram/widget",
  });
}

describe("trusted proxy client addresses", () => {
  it("ignores forged forwarding headers with the default direct-API configuration", () => {
    expect(proxyRequest(0, "203.0.113.8, 172.20.0.2").ip).toBe("172.20.0.3");
  });

  it("uses the client address through Caddy and Next and ignores forged addresses to its left", () => {
    expect(proxyRequest(2, "198.51.100.99, 203.0.113.8, 172.20.0.2").ip).toBe("203.0.113.8");
    expect(proxyRequest(1, "198.51.100.99, 203.0.113.8").ip).toBe("203.0.113.8");
  });

  it("isolates login rate limits for clients sharing the same two proxies", () => {
    const guard = new SensitiveRateGuard();
    const context = (client: string) => ({ switchToHttp: () => ({ getRequest: () => proxyRequest(2, `${client}, 172.20.0.2`) }) }) as unknown as ExecutionContext;
    for (let index = 0; index < 10; index++) guard.canActivate(context("203.0.113.8"));
    expect(() => guard.canActivate(context("203.0.113.8"))).toThrow();
    expect(guard.canActivate(context("203.0.113.9"))).toBe(true);
  });
});
