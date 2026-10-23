import type { PrismaClient } from "@event-platform/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventNotificationsService } from "./event-notifications.service.js";
import { TransactionalNotificationsService } from "./transactional-notifications.service.js";

const env = vi.hoisted(() => ({
  NODE_ENV: "production",
  TRANSACTIONAL_NOTIFICATIONS_ENABLED: false,
}));
vi.mock("@event-platform/config", () => ({ loadApiEnv: () => env }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("transactional notification worker enablement", () => {
  it.each(["production", "test"])("does not scan or schedule when disabled in %s", async (mode) => {
    vi.useFakeTimers();
    env.NODE_ENV = mode;
    env.TRANSACTIONAL_NOTIFICATIONS_ENABLED = false;
    const service = new TransactionalNotificationsService({} as PrismaClient, {} as EventNotificationsService);
    const tick = vi.spyOn(service, "tick").mockResolvedValue();
    service.onModuleInit();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(tick).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    service.onModuleDestroy();
  });

  it.each(["production", "test"])("scans immediately and periodically only when enabled in %s", async (mode) => {
    vi.useFakeTimers();
    env.NODE_ENV = mode;
    env.TRANSACTIONAL_NOTIFICATIONS_ENABLED = true;
    const service = new TransactionalNotificationsService({} as PrismaClient, {} as EventNotificationsService);
    const tick = vi.spyOn(service, "tick").mockResolvedValue();
    service.onModuleInit();
    expect(tick).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(tick).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
});
