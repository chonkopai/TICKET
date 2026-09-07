import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { defineConfig, env } from "prisma/config";

loadDotenv({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  override: false,
  quiet: true,
});

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
