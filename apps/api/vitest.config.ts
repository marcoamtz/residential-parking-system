import { defineConfig } from "vitest/config";

// The root .env applies to tests too (DATABASE_URL, REDIS_URL, TEST_DATABASE_URL), as the README
// promises; process variables set by CI still win because loadEnvFile never overwrites them.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url).pathname);
} catch {
  // No .env file: rely on the process environment.
}

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Creates and migrates the dedicated test database (parking_test) before any suite runs.
    globalSetup: ["./src/test/global-setup.ts"],
    // Expected failures (e.g. the unreachable-Redis test) would otherwise print warning lines.
    env: { LOG_LEVEL: "silent" },
  },
});
