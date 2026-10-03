import { defineConfig, devices } from "@playwright/test";

const localChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        ...(localChromium
          ? { launchOptions: { executablePath: localChromium } }
          : {}),
      },
    },
  ],
  webServer: {
    command: "npm run web:export && npx serve -s frontend/dist -l 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
