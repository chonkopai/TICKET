import "reflect-metadata";

import { loadApiEnv } from "@event-platform/config";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

async function bootstrap(): Promise<void> {
  const env = loadApiEnv();
  const { AppModule } = await import("./app.module.js");
  const app = await NestFactory.create(AppModule, { rawBody: true, bodyParser: true });

  app.enableCors({ origin: env.WEB_ORIGIN });
  app.useGlobalPipes(
    new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }),
  );
  app.enableShutdownHooks();
  await app.listen(env.API_PORT, "0.0.0.0");
}

void bootstrap();
