import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/server-only-stub.ts") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // integration tests share one database; run files serially
    fileParallelism: false,
    setupFiles: ["tests/setup-env.ts"],
    globalSetup: ["tests/global-setup.ts"],
    testTimeout: 20_000,
  },
});
