import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      // Pinned so the suite cannot depend on a developer's local server/.env.
      // Without it, a machine with DATABASE_PROVIDER=mongo set locally boots
      // the app against a real MongoDB, and any route that touches media or
      // relations blocks until the driver's connect timeout fires.
      DATABASE_PROVIDER: "postgres",
    },
    sequence: {
      concurrent: false,
    },
  },
});