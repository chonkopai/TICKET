import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@event-platform/config");
  vi.doUnmock("@event-platform/database");
  vi.doUnmock("@nestjs/core");
  vi.doUnmock("./app.module.js");
});

it("loads environment configuration before database-dependent bootstrap imports", async () => {
  vi.resetModules();
  let environmentLoaded = false;
  const listen = vi.fn().mockResolvedValue(undefined);
  const app = {
    set: vi.fn(),
    useBodyParser: vi.fn(),
    enableCors: vi.fn(),
    useGlobalPipes: vi.fn(),
    useGlobalFilters: vi.fn(),
    enableShutdownHooks: vi.fn(),
    listen,
  };
  vi.doMock("@event-platform/config", () => ({
    loadApiEnv: () => {
      environmentLoaded = true;
      return { API_PORT: 3001, API_TRUST_PROXY_HOPS: 1, WEB_ORIGIN: "http://localhost:3000" };
    },
  }));
  vi.doMock("@event-platform/database", () => {
    if (!environmentLoaded) throw new Error("Database initialized before environment configuration");
    return {
      Prisma: {
        PrismaClientKnownRequestError: class extends Error {},
        PrismaClientValidationError: class extends Error {},
        PrismaClientUnknownRequestError: class extends Error {},
      },
    };
  });
  vi.doMock("@nestjs/core", () => ({ NestFactory: { create: vi.fn().mockResolvedValue(app) } }));
  vi.doMock("./app.module.js", () => ({ AppModule: class {} }));

  await import("./main.js");
  await vi.waitFor(() => expect(listen).toHaveBeenCalledWith(3001, "0.0.0.0"));
  expect(app.useGlobalFilters).toHaveBeenCalledOnce();
});
