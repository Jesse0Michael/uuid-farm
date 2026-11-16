import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5191",
    browserName: "chromium",
    channel: process.env.PLAYWRIGHT_CHROME === "1" ? "chrome" : undefined,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm start -- --port 5191 --strictPort",
    url: "http://127.0.0.1:5191",
    reuseExistingServer: !process.env.CI,
  },
});
