import assert from "node:assert/strict";
import { test } from "node:test";
import { rootCertificates } from "node:tls";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { mysqlConnectionOptions } from "../src/db-config.js";
import { firebaseServiceAccount } from "../src/firebase-admin-config.js";
import { assertProductionEnvironment, serverPort } from "../src/config.js";

const key = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ type: "pkcs8", format: "pem" })
  .toString();
const account = JSON.stringify({
  project_id: "petconnect-prod",
  client_email: "backend@petconnect-prod.iam.gserviceaccount.com",
  private_key: key,
});
const valid: NodeJS.ProcessEnv = {
  NODE_ENV: "production",
  RENDER: "true",
  PORT: "10000",
  TRUST_PROXY_HOPS: "1",
  MYSQL_HOST: "mysql.aivencloud.com",
  MYSQL_PORT: "23306",
  MYSQL_USER: "petconnect_app",
  MYSQL_PASSWORD: "a-strong-runtime-password",
  MYSQL_DATABASE: "petconnect_db",
  MYSQL_SSL: "true",
  MYSQL_SSL_CA: rootCertificates[0],
  FIREBASE_PROJECT_ID: "petconnect-prod",
  FIREBASE_SERVICE_ACCOUNT_JSON: account,
  CORS_ALLOWED_ORIGINS:
    "https://petconnect-umtc-20260929.web.app,https://petconnect-umtc-20260929.firebaseapp.com",
  PUBLIC_APP_BASE_URL: "https://petconnect-umtc-20260929.web.app",
  RECOVERY_TOKEN_SECRET: "0123456789abcdef0123456789abcdef",
  FINDER_SESSION_SECRET: "abcdef0123456789abcdef0123456789",
  FINDER_IP_HASH_SECRET: "0123456789abcdef0123456789abcdef",
  FINDER_OTP_SECRET: "fedcba9876543210fedcba9876543210",
  FINDER_OTP_PROVIDER: "smsgate",
  SMSGATE_BASE_URL: "https://api.sms-gate.app/3rdparty/v1",
  SMSGATE_USERNAME: "test-user",
  SMSGATE_PASSWORD: "test-password",
  UPLOAD_STORAGE_PROVIDER: "cloudinary",
  CLOUDINARY_CLOUD_NAME: "petconnect",
  CLOUDINARY_API_KEY: "123456789012345",
  CLOUDINARY_API_SECRET: "cloudinary-test-secret",
};

test("local MySQL remains non-TLS and bounded", () => {
  const config = mysqlConnectionOptions({});
  assert.equal(config.ssl, undefined);
  assert.equal(config.connectionLimit, 4);
  assert.equal(config.queueLimit, 64);
  assert.equal(config.connectTimeout, 10000);
});
test("MySQL TLS validates inline multiline/escaped CA and never disables peer verification", () => {
  for (const ca of [
    rootCertificates[0],
    rootCertificates[0].replaceAll("\n", "\\n"),
  ]) {
    const options = mysqlConnectionOptions({
      MYSQL_SSL: "true",
      MYSQL_SSL_CA: ca,
    });
    assert.equal(typeof options.ssl, "object");
    assert.equal(
      (options.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized,
      true,
    );
    assert.match((options.ssl as { ca: string }).ca, /BEGIN CERTIFICATE/);
  }
});
test("MySQL TLS supports CA secret files and safely rejects missing or malformed CAs", () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "petconnect-ca-"));
  try {
    const file = path.join(dir, "ca.pem");
    writeFileSync(file, rootCertificates[0]);
    assert.equal(
      (
        mysqlConnectionOptions({ MYSQL_SSL: "true", MYSQL_SSL_CA_PATH: file })
          .ssl as { ca: string }
      ).ca,
      rootCertificates[0],
    );
    for (const env of [
      { MYSQL_SSL: "true" },
      { MYSQL_SSL: "true", MYSQL_SSL_CA: "sensitive-invalid-ca" },
      { MYSQL_SSL: "true", MYSQL_SSL_CA_PATH: path.join(dir, "missing.pem") },
      { MYSQL_SSL: "false", MYSQL_SSL_CA: rootCertificates[0] },
      { MYSQL_SSL: "yes" },
      { MYSQL_PORT: "NaN" },
      { MYSQL_CONNECTION_LIMIT: "999" },
    ])
      assert.throws(
        () => mysqlConnectionOptions(env),
        (error: Error) => !error.message.includes("sensitive-invalid-ca"),
      );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("production accepts the selected stack without UPLOAD_DIR or webhook", () => {
  assert.doesNotThrow(() => assertProductionEnvironment({ ...valid }));
  assert.equal(serverPort(valid), 10000);
});
test("production supports webhook and explicitly durable local storage outside Render", () => {
  assert.doesNotThrow(() =>
    assertProductionEnvironment({
      ...valid,
      RENDER: "",
      FINDER_OTP_PROVIDER: "webhook",
      FINDER_OTP_WEBHOOK_URL: "https://sms.example.org/send",
      UPLOAD_STORAGE_PROVIDER: "local",
      UPLOAD_LOCAL_DURABLE: "true",
      UPLOAD_DIR: path.resolve("durable-uploads"),
    }),
  );
});
test("Firebase Admin accepts JSON and files and rejects invalid/foreign credentials without exposing them", () => {
  assert.equal(firebaseServiceAccount(valid)?.projectId, "petconnect-prod");
  const dir = mkdtempSync(path.join(os.tmpdir(), "petconnect-admin-"));
  try {
    const file = path.join(dir, "admin.json");
    writeFileSync(file, account);
    assert.equal(
      firebaseServiceAccount({
        FIREBASE_PROJECT_ID: "petconnect-prod",
        GOOGLE_APPLICATION_CREDENTIALS: file,
      })?.projectId,
      "petconnect-prod",
    );
    for (const raw of [
      "not-json-private-value",
      "{}",
      JSON.stringify({
        project_id: "different",
        client_email: "a@b.test",
        private_key: key,
      }),
    ]) {
      assert.throws(
        () =>
          firebaseServiceAccount({
            ...valid,
            FIREBASE_SERVICE_ACCOUNT_JSON: raw,
          }),
        (e: Error) =>
          !e.message.includes("not-json-private-value") &&
          !e.message.includes(key),
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
const unsafe: Array<[string, string]> = [
  ["MYSQL_USER", "root"],
  ["MYSQL_PASSWORD", "password"],
  ["MYSQL_DATABASE", "petconnect_test"],
  ["MYSQL_SSL", "false"],
  ["MYSQL_SSL_CA", ""],
  ["MYSQL_PORT", "0"],
  ["FIREBASE_PROJECT_ID", "demo-petconnect"],
  ["FIREBASE_SERVICE_ACCOUNT_JSON", "{}"],
  ["FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099"],
  ["RECOVERY_TOKEN_SECRET", "change-this-local-secret-32-bytes-minimum"],
  ["FINDER_SESSION_SECRET", "short"],
  ["FINDER_OTP_PROVIDER", "console"],
  ["FINDER_OTP_PROVIDER", "disabled"],
  ["FINDER_OTP_EXPOSE_CODE", "true"],
  ["SMSGATE_USERNAME", ""],
  ["SMSGATE_PASSWORD", ""],
  ["SMSGATE_BASE_URL", "http://localhost:9999"],
  ["SMSGATE_BASE_URL", "https://user:secret@sms.example.org"],
  ["UPLOAD_STORAGE_PROVIDER", "local"],
  ["UPLOAD_STORAGE_PROVIDER", "unknown"],
  ["CLOUDINARY_API_SECRET", ""],
  ["PORT", "nonsense"],
  ["PORT", "65536"],
  ["TRUST_PROXY_HOPS", "3"],
  ["CORS_ALLOWED_ORIGINS", "*"],
  ["CORS_ALLOWED_ORIGINS", "https://pets.example.org/path"],
  ...[
    "http://localhost:8081",
    "https://[::1]",
    "https://localhost.",
    "https://127.12.34.56",
    "https://192.168.1.2",
    "https://user:password@pets.example.org",
    "https://x.exp.direct",
  ].map((v): [string, string] => ["PUBLIC_APP_BASE_URL", v]),
];
for (const [keyName, value] of unsafe)
  test(`production rejects unsafe ${keyName}: ${value.startsWith("https:") ? "URL" : value}`, () => {
    assert.throws(() =>
      assertProductionEnvironment({ ...valid, [keyName]: value }),
    );
  });
