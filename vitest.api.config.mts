import { defineConfig } from "vitest/config";
import path from "node:path";

// API tests call a running server (BASE_URL, default http://localhost:3000) that points at a seeded test database.
// scripts/test-all.sh starts that server; locally, run `npm run dev` or `npm start` first.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/api/**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    globalSetup: ["tests/api/global-setup.ts"],
  },
});
