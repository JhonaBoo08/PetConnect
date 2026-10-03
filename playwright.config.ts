import { defineConfig, devices, type WebServerConfig } from "@playwright/test";

const localChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
const integration = process.env.PETCONNECT_E2E_INTEGRATION === "1";
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

const staticServer: WebServerConfig = {
  command: "npm run web:export && npx serve -s frontend/dist -l 4173",
  url: "http://127.0.0.1:4173",
  reuseExistingServer: !process.env.CI,
  timeout: 180_000,
};

const integrationServers: WebServerConfig[] = [
  {
    command:
      "npx firebase --config backend/firebase.json emulators:start --project demo-petconnect --only auth",
    url: "http://127.0.0.1:4000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  {
    command:
      "npm run db:bootstrap && npm run build:backend && npm --prefix backend/api start",
    url: "http://127.0.0.1:3000/v1/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...inheritedEnv,
      NODE_ENV: "test",
      MYSQL_DATABASE: process.env.MYSQL_DATABASE || "petconnect_e2e",
      FIREBASE_PROJECT_ID: "demo-petconnect",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      CORS_ALLOWED_ORIGINS: "http://127.0.0.1:4173",
      PUBLIC_APP_BASE_URL: "http://127.0.0.1:4173",
      RECOVERY_TOKEN_SECRET: "petconnect-e2e-recovery-secret-32-bytes-minimum",
      UPLOAD_DIR: "./.e2e-uploads",
    },
  },
];

export default defineConfig({
  testDir: "./e2e",
  timeout: integration ? 60_000 : 30_000,
  expect: { timeout: 10_000 },
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
  webServer: integration ? [staticServer, ...integrationServers] : staticServer,
});
