import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // Disable OTEL SDK in tests — prevents connection attempts to non-existent collector
    env: {
      NODE_ENV: "test",
      OTEL_SDK_DISABLED: "true",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
    },
    reporters: ["verbose"],
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
});
