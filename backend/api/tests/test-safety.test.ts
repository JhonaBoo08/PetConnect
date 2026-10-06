import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTestDatabase, assertTestAuth } from "../src/test-safety.js";
test("database test guard rejects ordinary databases and non-test processes", () => {
  for (const database of [
    "petconnect_dev",
    "petconnect_db",
    "",
    undefined,
    "unsafe;_test",
    "qa_TEST",
  ]) {
    assert.throws(
      () => assertTestDatabase({ NODE_ENV: "test" }, database),
      /Refusing/,
    );
  }
  for (const NODE_ENV of [undefined, "development", "production"]) {
    assert.throws(
      () => assertTestDatabase({ NODE_ENV }, "petconnect_test"),
      /Refusing/,
    );
  }
  assert.doesNotThrow(() =>
    assertTestDatabase({ NODE_ENV: "test" }, "petconnect_test"),
  );
  assert.doesNotThrow(() =>
    assertTestDatabase({ NODE_ENV: "test" }, "petconnect_isolated_e2e"),
  );
});
test("Auth test guard cannot use a live project or another emulator", () => {
  assert.throws(() =>
    assertTestAuth({
      FIREBASE_PROJECT_ID: "live",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
    }),
  );
  assert.throws(() =>
    assertTestAuth({
      FIREBASE_PROJECT_ID: "demo-petconnect-test",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
    }),
  );
  assert.doesNotThrow(() =>
    assertTestAuth({
      FIREBASE_PROJECT_ID: "demo-petconnect-test",
      FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9199",
    }),
  );
});
