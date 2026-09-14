import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // Creates and migrates the dedicated test database (parking_test) before any suite runs.
    globalSetup: ["./src/test/global-setup.ts"],
    // Expected failures (e.g. the unreachable-Redis test) would otherwise print warning lines.
    env: { LOG_LEVEL: "silent" },
  },
});
