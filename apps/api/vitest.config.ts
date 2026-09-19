import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootEnvPath = fileURLToPath(new URL("../../.env", import.meta.url));
if (existsSync(rootEnvPath)) loadEnvFile(rootEnvPath);

export default defineConfig({
  test: {
    environment: "node",
    // API integration specs share one local PostgreSQL database; serialize files
    // so global fixture assertions cannot race with another suite's cleanup.
    fileParallelism: false,
    include: ["src/**/*.spec.ts"],
  },
});
