import "reflect-metadata";

import { loadApiEnv } from "@event-platform/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { configureHttpProxy } from "./http-proxy.js";

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  // Database-dependent modules must load after the environment file.
  const { PersistenceExceptionFilter } = await import("./staff/persistence.filter.js");
  const { AppModule } = await import("./app.module.js");
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true, bodyParser: true });
  configureHttpProxy(app, env.API_TRUST_PROXY_HOPS);

  // A 2,000-seat editor document exceeds Express's 100 KB default; retain a bounded JSON body.
  app.useBodyParser("json", { limit: "4mb" });
  app.enableCors({ origin: env.WEB_ORIGIN });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.useGlobalFilters(new PersistenceExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, "0.0.0.0");
}

void bootstrap();
