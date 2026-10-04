import { defineConfig, devices, type WebServerConfig } from "@playwright/test";

const localChromium = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?.trim();
const integration = process.env.PETCONNECT_E2E_INTEGRATION === "1";
const developmentUrl = process.env.PETCONNECT_E2E_DEV_URL?.trim();
if (integration && !developmentUrl) {
  process.env.PETCONNECT_E2E_VERIFY_OTP = "1";
  process.env.PETCONNECT_E2E_SMSGATE_URL = "http://127.0.0.1:9098";
}
const inheritedEnv = Object.fromEntries(
  Object.entries(process.env).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  ),
);

const staticServer: WebServerConfig = {
  command: "npm run web:export && npx serve -s frontend/dist -l 4173",
  url: "http://127.0.0.1:4173",
  env: integration ? { ...inheritedEnv, EXPO_NO_DOTENV: "1", EXPO_PUBLIC_FIREBASE_ENV: "emulator", EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:3011" } : inheritedEnv,
  // Never reuse an arbitrary process on the release-test port. A stale local
  // server can otherwise make Playwright validate the wrong artifact.
  reuseExistingServer: false,
  timeout: 180_000,
};

const integrationServers: WebServerConfig[] = [
  { command: "node e2e/mock-smsgate.mjs", url: "http://127.0.0.1:9098/health", env: { ...inheritedEnv, NODE_ENV: "test" }, reuseExistingServer: !process.env.CI },
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
    url: "http://127.0.0.1:3011/v1/health",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...inheritedEnv,
      NODE_ENV: "development",
      PORT: "3011",
      UPLOAD_STORAGE_PROVIDER: "local",
      FINDER_OTP_PROVIDER: "smsgate", FINDER_OTP_EXPOSE_CODE: "false",
      SMSGATE_BASE_URL: "http://127.0.0.1:9098", SMSGATE_USERNAME: "fixture", SMSGATE_PASSWORD: "fixture-password",
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
  // A live development run compiles routes and can follow public tunnel links.
  timeout: developmentUrl ? 120_000 : integration ? 60_000 : 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: developmentUrl || "http://127.0.0.1:4173",
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
  webServer: developmentUrl
    ? undefined
    : integration
      ? [staticServer, ...integrationServers]
      : staticServer,
});
