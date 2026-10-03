import assert from "node:assert/strict";
import test from "node:test";

import { assertProductionEnvironment } from "../src/config.js";

const valid = {
  NODE_ENV: "production",
  MYSQL_HOST: "127.0.0.1",
  MYSQL_PORT: "3306",
  MYSQL_USER: "petconnect_app",
  MYSQL_PASSWORD: "a-strong-runtime-password",
  MYSQL_DATABASE: "petconnect_db",
  FIREBASE_PROJECT_ID: "petconnect-prod",
  GOOGLE_APPLICATION_CREDENTIALS: "/etc/petconnect/firebase-admin.json",
  CORS_ALLOWED_ORIGINS: "https://pets.example.org",
  PUBLIC_APP_BASE_URL: "https://pets.example.org",
  RECOVERY_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
  UPLOAD_DIR: "/var/lib/petconnect/uploads",
} satisfies NodeJS.ProcessEnv;

test("production configuration accepts explicit safe values", () => {
  assert.doesNotThrow(() => assertProductionEnvironment({ ...valid }));
});

test("production configuration rejects development defaults", () => {
  assert.throws(
    () =>
      assertProductionEnvironment({
        ...valid,
        MYSQL_USER: "root",
      }),
    /must not be root/,
  );
  assert.throws(
    () =>
      assertProductionEnvironment({
        ...valid,
        PUBLIC_APP_BASE_URL: "http://localhost:8081",
      }),
    /HTTPS|localhost/,
  );
  assert.throws(
    () =>
      assertProductionEnvironment({
        ...valid,
        FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
      }),
    /must not be set/,
  );
  assert.throws(
    () =>
      assertProductionEnvironment({
        ...valid,
        RECOVERY_TOKEN_SECRET: "change-this-local-secret-32-bytes-minimum",
      }),
    /non-placeholder/,
  );
});
