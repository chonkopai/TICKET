import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import { defineConfig } from "vitest/config";

loadDotenv({
  path: fileURLToPath(new URL("../../.env", import.meta.url)),
  override: false,
  quiet: true,
});

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    testTimeout: 10_000,
  },
});
