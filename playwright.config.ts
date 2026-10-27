import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  outputDir: "test-results",
  use: {
    baseURL: `http://127.0.0.1:${PORT}/salvage-links/`,
    trace: "off",
    video: "off",
    launchOptions: { args: ["--allow-file-access-from-files"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: `npm run build && node scripts/serve-subpath.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/salvage-links/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
