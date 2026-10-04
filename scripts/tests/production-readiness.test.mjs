import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSourceTreeSafe,
  unsafeTrackedPath,
  validateEnvironmentPair,
} from "../production-readiness.mjs";

const frontend = {
  EXPO_PUBLIC_FIREBASE_ENV: "production",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "petconnect-prod",
  EXPO_PUBLIC_FIREBASE_API_KEY: "public-api-key",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "petconnect-prod.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
  EXPO_PUBLIC_API_BASE_URL: "https://api.petconnect.app",
};

test("release tree rejects tracked private runtime artifacts", () => {
  for (const file of [
    ".deployment/production.env",
    "backend/api/.env",
    ".env.production",
    "secrets/firebase-admin.json",
    "secrets/service-account-prod.json",
    "certs/server.key",
    "certs/admin.pem",
    "backups/2026/database.sql",
    "uploads/pet.webp",
  ]) {
    assert.equal(unsafeTrackedPath(file), true, file);
  }

  for (const file of [
    "backend/api/.env.example",
    "frontend/.env.example",
    ".env.production.example",
    "deploy/api.env.example",
    ".firebaserc",
  ]) {
    assert.equal(unsafeTrackedPath(file), false, file);
  }
});

test("current tracked source tree does not contain private deployment artifacts", () => {
  assert.doesNotThrow(() => assertSourceTreeSafe());
});

test("production frontend and backend must target the same Firebase project", () => {
  assert.doesNotThrow(() =>
    validateEnvironmentPair(
      {
        NODE_ENV: "production",
        FIREBASE_PROJECT_ID: "petconnect-prod",
      },
      frontend,
    ),
  );

  assert.throws(() =>
    validateEnvironmentPair(
      {
        NODE_ENV: "production",
        FIREBASE_PROJECT_ID: "different-project",
      },
      frontend,
    ),
  );
});
