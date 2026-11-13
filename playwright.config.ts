import { defineConfig, devices } from "@playwright/test";

// Browser tests run against a server (E2E_BASE_URL, default http://localhost:3000) that points at a freshly seeded
// database. scripts/test-all.sh starts that server; locally, `npm run dev` against a seeded database works too.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL, trace: "off", screenshot: "only-on-failure", video: "off", viewport: { width: 1440, height: 900 }, locale: "en-IN", timezoneId: "Asia/Kolkata" },
  projects: [
    { name: "flows", testIgnore: /screenshots\.spec\.ts/, use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "screenshots", testMatch: /screenshots\.spec\.ts/, dependencies: ["flows"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
  ],
});
