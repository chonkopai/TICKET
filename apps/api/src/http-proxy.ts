import type { NestExpressApplication } from "@nestjs/platform-express";

/** Trust only the explicitly configured number of controlled proxies.
 * Deployments enabling this must prevent shorter, direct paths to the API. */
export function configureHttpProxy(app: Pick<NestExpressApplication, "set">, hops: number): void {
  app.set("trust proxy", hops);
}
