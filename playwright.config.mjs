// Tests run against the built site (npm run build first), served exactly as
// GitHub Pages will serve it: under /setech-arcade/.
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
export default defineConfig({
  testDir: "tests",
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: { baseURL: `http://localhost:${PORT}/setech-arcade/`, trace: "retain-on-failure" },
  webServer: {
    command: `node scripts/serve.mjs --port ${PORT}`,
    url: `http://localhost:${PORT}/setech-arcade/`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: "build", testMatch: /build\.spec\.mjs/ },
    { name: "chromium", testIgnore: /build\.spec\.mjs/, use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", testIgnore: /build\.spec\.mjs/, use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", testIgnore: /build\.spec\.mjs/, use: { ...devices["Desktop Safari"] } },
  ],
});
