import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { readFileSync } from "node:fs";
import { RowDataPacket } from "mysql2/promise";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { app, pool, accounts } from "../src/server.js";

const projectId = "demo-petconnect";
const apps: ReturnType<typeof initializeApp>[] = [];

function client(name: string) {
  const clientApp = initializeApp(
    {
      projectId,
      apiKey: "demo-key",
      authDomain: `${projectId}.firebaseapp.com`,
    },
    name,
  );
  apps.push(clientApp);
  const a = getAuth(clientApp);
  connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  return a;
}

async function resetTestDb() {
  await pool.query("SET FOREIGN_KEY_CHECKS = 0");
  await pool.query("TRUNCATE TABLE audit_logs");
  await pool.query("TRUNCATE TABLE appointments");
  await pool.query("TRUNCATE TABLE health_records");
  await pool.query("TRUNCATE TABLE pets");
  await pool.query("TRUNCATE TABLE clinic_members");
  await pool.query("TRUNCATE TABLE clinics");
  await pool.query("TRUNCATE TABLE users");
  await pool.query("SET FOREIGN_KEY_CHECKS = 1");
}

before(async () => {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Tests require FIREBASE_AUTH_EMULATOR_HOST");
  }
  const schemaSql = readFileSync(
    new URL("../../../sql/schema.sql", import.meta.url),
    "utf8",
  );
  await pool.query(schemaSql);
  await resetTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

after(async () => {
  await Promise.all(apps.map(deleteApp));
  await pool.end();
});

test("GET /v1/health returns ok", async () => {
  const res = await request(app).get("/v1/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ok");
});

test("owner callable initializes once, refreshes claims and returns session", async () => {
  const auth = client("owner");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "owner@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();

  const invalidRes = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: "A" });
  assert.equal(invalidRes.status, 400);

  const initRes = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: " Owner ", phone: "123" });
  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.status, "ACTIVE");

  const refreshedToken = await credential.user.getIdToken(true);
  const sessionRes = await request(app)
    .get("/v1/session")
    .set("Authorization", `Bearer ${refreshedToken}`);
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.role, "OWNER");

  const [users] = await pool.query<
    (RowDataPacket & { display_name: string })[]
  >("SELECT * FROM users WHERE id = ?", [credential.user.uid]);
  assert.equal(users[0].display_name, "Owner");
});

test("unauthenticated access is denied", async () => {
  const initRes = await request(app)
    .post("/v1/account/initialize")
    .send({ displayName: "Guest" });
  assert.equal(initRes.status, 401);

  const sessionRes = await request(app).get("/v1/session");
  assert.equal(sessionRes.status, 401);
});

test("clinic provisioning and login succeeds", async () => {
  await accounts.provisionClinic(
    {
      uid: "vet-one",
      email: "vet@example.test",
      clinicId: "clinic-one",
      name: "Test Clinic",
      address: "Tagum",
    },
    "test-operator",
  );
  const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
  await getAdminAuth().updateUser("vet-one", { password: "Example-pass-123!" });

  const auth = client("clinic");
  const credential = await signInWithEmailAndPassword(
    auth,
    "vet@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken(true);

  const sessionRes = await request(app)
    .get("/v1/session")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.role, "CLINIC");
  assert.equal(sessionRes.body.clinicId, "clinic-one");
});

test("disabling account denies session access", async () => {
  const auth = client("disabled");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "disabled@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();

  await accounts.initializeOwner(credential.user.uid, {
    displayName: "Disabled",
  });
  await accounts.disable(credential.user.uid, "test-operator");

  const sessionRes = await request(app)
    .get("/v1/session")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(sessionRes.status, 403);
});
