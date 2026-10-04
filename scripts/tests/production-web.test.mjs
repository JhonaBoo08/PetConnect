import assert from "node:assert/strict";
import test from "node:test";
import { productionWebEnvironment } from "../production-web.mjs";
const valid = {
  EXPO_PUBLIC_FIREBASE_ENV: "production",
  EXPO_PUBLIC_FIREBASE_PROJECT_ID: "petconnect-umtc-20260929",
  EXPO_PUBLIC_FIREBASE_API_KEY: "public-api-key",
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: "petconnect-umtc-20260929.firebaseapp.com",
  EXPO_PUBLIC_FIREBASE_APP_ID: "1:123:web:abc",
  EXPO_PUBLIC_API_BASE_URL: "https://petconnect-api.onrender.com",
};
test("production export uses explicit public values and disables dotenv overrides", () => {
  assert.equal(productionWebEnvironment(valid).EXPO_NO_DOTENV, "1");
});
test("production export fails before bundling emulator, incomplete, unsafe URL or server secrets", () => {
  for (const overrides of [
    { EXPO_PUBLIC_FIREBASE_ENV: "emulator" },
    { EXPO_PUBLIC_FIREBASE_API_KEY: "" },
    { EXPO_PUBLIC_API_BASE_URL: "http://127.0.0.1:3000" },
    { EXPO_PUBLIC_API_BASE_URL: "https://u:password@api.example.org" },
    { EXPO_PUBLIC_API_BASE_URL: "https://api.example.org/path" },
    { EXPO_PUBLIC_API_BASE_URL: "https://172.20.1.10" },
    { EXPO_PUBLIC_API_BASE_URL: "https://api.example.net" },
    { EXPO_PUBLIC_EMULATOR_HOST: "localhost" },
    { FIREBASE_SERVICE_ACCOUNT_JSON: "private" },
    { EXPO_PUBLIC_ADMIN_SECRET: "private" },
  ])
    assert.throws(() => productionWebEnvironment({ ...valid, ...overrides }));
});
