import "./test-environment.js";
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { readFileSync } from "node:fs";
import { RowDataPacket, PoolConnection } from "mysql2/promise";
import { assertTestDatabase } from "../src/test-safety.js";
import { mysqlConnectionOptions } from "../src/db-config.js";
import sharp from "sharp";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import {
  app,
  pool,
  accounts,
  finderEvidence,
  finderSessions,
  finderVerification,
  scheduledNotifications,
} from "../src/server.js";
import { Notifications } from "../src/notifications.js";
import { ScheduledNotifications } from "../src/scheduled-notifications.js";
import { createPool } from "../src/db.js";
import { FinderEvidence } from "../src/finder-evidence.js";
import type { MediaStorage } from "../src/media-storage.js";

const projectId = process.env.FIREBASE_PROJECT_ID || "demo-petconnect";
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
  connectAuthEmulator(
    a,
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099"}`,
    { disableWarnings: true },
  );
  return a;
}

async function assertTestTarget(connection: PoolConnection) {
  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT DATABASE() AS db",
  );
  const database = rows[0]?.db;
  assertTestDatabase(process.env, database);
  assert.equal(
    database,
    mysqlConnectionOptions().database,
    "Resolved test database differs from live connection",
  );
}

async function resetTestDb() {
  const connection = await pool.getConnection();
  try {
    await assertTestTarget(connection);
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const table of [
      "push_delivery_jobs",
      "media_cleanup_jobs",
      "audit_logs",
      "scheduled_notifications",
      "health_reminders",
      "appointments",
      "health_records",
      "notifications",
      "expo_push_receipts",
      "push_devices",
      "sighting_evidence",
      "recovery_contact_events",
      "recovery_tag_scans",
      "finder_otp_challenges",
      "sightings",
      "lost_reports",
      "finder_sessions",
      "pet_recovery_tags",
      "pet_recovery_tokens",
      "pets",
      "clinic_members",
      "clinics",
      "users",
    ])
      await connection.query("TRUNCATE TABLE " + table);
  } finally {
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS = 1");
    } finally {
      connection.release();
    }
  }
}

before(async () => {
  const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
  if (
    authEmulatorHost !== "127.0.0.1:9199" ||
    firebaseProjectId !== "demo-petconnect-test"
  ) {
    throw new Error(
      "Backend tests require the isolated Firebase Auth test emulator at 127.0.0.1:9199 with FIREBASE_PROJECT_ID=demo-petconnect-test. Run `npm run test:backend` instead of test:backend:run directly.",
    );
  }
  const connection = await pool.getConnection();
  try {
    await assertTestTarget(connection);
  } finally {
    connection.release();
  }
  const resetAuth = await fetch(
    "http://127.0.0.1:9199/emulator/v1/projects/demo-petconnect-test/accounts",
    { method: "DELETE" },
  );
  if (!resetAuth.ok)
    throw new Error("Could not reset the isolated Auth test emulator.");
  const schemaSql = readFileSync(
    new URL("../../../sql/schema.sql", import.meta.url),
    "utf8",
  );
  const schemaStatements = schemaSql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of schemaStatements) {
    await pool.query(statement);
  }
  await resetTestDb();
});

beforeEach(async () => {
  await resetTestDb();
});

after(async () => {
  await Promise.all(apps.map(deleteApp));
  await pool.end();
});

test("push receipts wait for delivery, discard expired tickets and disable unregistered devices", async (t) => {
  await pool.query(
    "INSERT INTO users (id, email, display_name, role, status) VALUES (?, ?, ?, ?, ?)",
    [
      "receipt-owner",
      "receipts@example.test",
      "Receipt Owner",
      "OWNER",
      "ACTIVE",
    ],
  );
  const notifications = new Notifications(pool);
  const token = "ExpoPushToken[test-receipts]";
  await notifications.registerDevice("receipt-owner", {
    expoPushToken: token,
    platform: "android",
  });
  await pool.query(
    "INSERT INTO expo_push_receipts (receipt_id, expo_push_token, created_at) VALUES " +
      "('expired', ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 25 HOUR)), " +
      "('ready', ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 20 MINUTE)), " +
      "('young', ?, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))",
    [token, token, token],
  );
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: unknown, options?: RequestInit) => {
      assert.deepEqual(JSON.parse(String(options?.body)).ids, ["ready"]);
      return new Response(
        JSON.stringify({
          data: {
            ready: {
              status: "error",
              details: { error: "DeviceNotRegistered" },
            },
          },
        }),
        { status: 200 },
      );
    },
  );
  const previousEnvironment = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.equal(await notifications.processPushReceipts(1), 1);
    const [devices] = await pool.query<RowDataPacket[]>(
      "SELECT enabled FROM push_devices WHERE expo_push_token = ?",
      [token],
    );
    assert.equal(Number(devices[0].enabled), 0);
    const [receipts] = await pool.query<RowDataPacket[]>(
      "SELECT receipt_id FROM expo_push_receipts ORDER BY receipt_id",
    );
    assert.deepEqual(
      receipts.map((row) => row.receipt_id),
      ["young"],
    );
    assert.equal(await notifications.processPushReceipts(1), 0);
  } finally {
    process.env.NODE_ENV = previousEnvironment;
  }
});

test("private nearby proximity uses only the disclosed coordinate grid", async () => {
  const owner = await ownerToken("Grid Owner", "grid-owner@example.test");
  const header = `Bearer ${owner.token}`;
  const ids: string[] = [];
  for (const name of ["Older", "Newer"]) {
    const pet = await request(app)
      .post("/v1/pets")
      .set("Authorization", header)
      .send({ name, species: "Dog" })
      .expect(201);
    const report = await request(app)
      .post("/v1/lost-reports")
      .set("Authorization", header)
      .send({
        petId: pet.body.id,
        lastSeenText: "Test location",
        latitude: 7.448,
        longitude: 125.808,
      })
      .expect(201);
    ids.push(report.body.id);
  }
  await pool.query(
    "UPDATE lost_reports SET last_known_latitude = ?, reported_at = ? WHERE id = ?",
    [7.4481, "2026-10-01 00:00:00", ids[0]],
  );
  await pool.query(
    "UPDATE lost_reports SET last_known_latitude = ?, reported_at = ? WHERE id = ?",
    [7.4484, "2026-10-02 00:00:00", ids[1]],
  );
  const feed = await request(app)
    .get("/v1/recovery/nearby")
    .query({ latitude: 7.448, longitude: 125.808, radiusKm: 2 })
    .expect(200);
  assert.deepEqual(
    feed.body.reports.map((item: { id: string }) => item.id),
    [ids[1], ids[0]],
  );
  assert.ok(
    feed.body.reports.every(
      (item: { latitude: number }) => item.latitude === 7.448,
    ),
  );
});

test("deleting a pet cancels its care schedules and prevents phantom updates", async () => {
  const owner = await ownerToken(
    "Delete Care Owner",
    "delete-care@example.test",
  );
  const header = `Bearer ${owner.token}`;
  const pet = await request(app)
    .post("/v1/pets")
    .set("Authorization", header)
    .send({ name: "Delete Care", species: "Cat" })
    .expect(201);
  const reminder = await request(app)
    .post("/v1/reminders")
    .set("Authorization", header)
    .send({
      petId: pet.body.id,
      title: "Care",
      dueAt: new Date(Date.now() + 86400000).toISOString(),
    })
    .expect(201);
  const key = `health-reminder:${reminder.body.id}`;
  await pool.query(
    "UPDATE scheduled_notifications SET scheduled_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE dedupe_key = ?",
    [key],
  );
  await request(app)
    .delete(`/v1/pets/${pet.body.id}`)
    .set("Authorization", header)
    .expect(204);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT status FROM scheduled_notifications WHERE dedupe_key = ?",
    [key],
  );
  assert.equal(rows[0].status, "CANCELLED");
  assert.deepEqual(await scheduledNotifications.processDue(), {
    sent: 0,
    failed: 0,
  });
  const updates = await request(app)
    .get("/v1/notifications")
    .set("Authorization", header)
    .expect(200);
  assert.equal(
    updates.body.notifications.some(
      (item: { data?: { reminderId?: string } }) =>
        item.data?.reminderId === reminder.body.id,
    ),
    false,
  );
});

test("deletion stops a care update already claimed behind another delivery", async (t) => {
  const owner = await ownerToken(
    "Claimed Care Owner",
    "claimed-care@example.test",
  );
  const header = "Bearer " + owner.token;
  const reminders: { id: string; petId: string }[] = [];
  for (const name of ["Keep Care", "Delete Claimed Care"]) {
    const pet = await request(app)
      .post("/v1/pets")
      .set("Authorization", header)
      .send({ name, species: "Cat" })
      .expect(201);
    const reminder = await request(app)
      .post("/v1/reminders")
      .set("Authorization", header)
      .send({
        petId: pet.body.id,
        title: name,
        dueAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);
    reminders.push({ id: reminder.body.id, petId: pet.body.id });
  }
  for (let index = 0; index < reminders.length; index += 1) {
    await pool.query(
      "UPDATE scheduled_notifications SET scheduled_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? MINUTE) WHERE dedupe_key = ?",
      [2 - index, "health-reminder:" + reminders[index].id],
    );
  }
  let start!: () => void;
  let release!: () => void;
  const started = new Promise<void>((resolve) => {
    start = resolve;
  });
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  const delivered: unknown[] = [];
  t.mock.method(
    Notifications.prototype,
    "notifyUser",
    async (
      _userId: string,
      _type: string,
      _title: string,
      _body: string,
      data: Record<string, unknown> = {},
    ) => {
      delivered.push(data.reminderId);
      start();
      await paused;
    },
  );
  const processing = scheduledNotifications.processDue();
  try {
    await Promise.race([
      started,
      processing.then(() => {
        throw new Error("Worker finished before beginning the first delivery.");
      }),
    ]);
    const [claimed] = await pool.query<RowDataPacket[]>(
      "SELECT status FROM scheduled_notifications WHERE dedupe_key = ?",
      ["health-reminder:" + reminders[1].id],
    );
    assert.equal(claimed[0].status, "PROCESSING");
    await request(app)
      .delete("/v1/pets/" + reminders[1].petId)
      .set("Authorization", header)
      .expect(204);
  } finally {
    release();
  }
  assert.deepEqual(await processing, { sent: 1, failed: 0 });
  assert.deepEqual(delivered, [reminders[0].id]);
  const [cancelled] = await pool.query<RowDataPacket[]>(
    "SELECT status FROM scheduled_notifications WHERE dedupe_key = ?",
    ["health-reminder:" + reminders[1].id],
  );
  assert.equal(cancelled[0].status, "CANCELLED");
});

test("scheduled delivery retry after a restart creates one durable notification", async (t) => {
  await pool.query(
    "INSERT INTO users (id,email,display_name,role,status) VALUES ('restart-owner','restart@example.test','Restart','OWNER','ACTIVE')",
  );
  const sender = new Notifications(pool);
  const worker = new ScheduledNotifications(pool, sender);
  await worker.schedule({
    userId: "restart-owner",
    type: "HEALTH_REMINDER",
    title: "Reminder",
    body: "Due",
    scheduledAt: new Date(Date.now() - 60000),
  });
  const original = sender.notifyUser.bind(sender);
  let interrupted = true;
  t.mock.method(
    sender,
    "notifyUser",
    async (...args: Parameters<typeof original>) => {
      await original(...args);
      if (interrupted)
        throw new Error("Simulated restart after durable insertion");
    },
  );
  assert.deepEqual(await worker.processDue(), { sent: 0, failed: 1 });
  interrupted = false;
  assert.deepEqual(
    await new ScheduledNotifications(pool, sender).processDue(),
    { sent: 1, failed: 0 },
  );
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM notifications WHERE user_id='restart-owner'",
  );
  assert.equal(Number(rows[0].count), 1);
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

  const incompleteRes = await request(app)
    .get("/v1/session")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(incompleteRes.status, 404);
  assert.equal(incompleteRes.body.error, "account-not-found");

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
  assert.equal(sessionRes.body.displayName, "Owner");
  assert.equal(sessionRes.body.email, "owner@example.test");
  assert.equal(sessionRes.body.phone, "123");

  const [users] = await pool.query<
    (RowDataPacket & { display_name: string })[]
  >("SELECT * FROM users WHERE id = ?", [credential.user.uid]);
  assert.equal(users[0].display_name, "Owner");
});

test("owner initialization repairs an orphaned local emulator identity", async () => {
  const auth = client("owner-local-reconcile");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "owner-local-reconcile@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();

  await pool.query(
    "INSERT INTO users (id, email, role, display_name, status) VALUES (?, ?, 'OWNER', 'Stale Owner', 'ACTIVE')",
    ["stale-owner-local", "owner-local-reconcile@example.test"],
  );

  const initRes = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: "Recovered Owner" });

  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.status, "ACTIVE");

  const [users] = await pool.query<
    (RowDataPacket & { id: string; display_name: string; status: string })[]
  >("SELECT id, display_name, status FROM users WHERE email = ?", [
    "owner-local-reconcile@example.test",
  ]);
  assert.equal(users.length, 1);
  assert.equal(users[0].id, credential.user.uid);
  assert.equal(users[0].display_name, "Recovered Owner");
  assert.equal(users[0].status, "ACTIVE");
});

test("owner initialization reassigns orphaned local owner data", async () => {
  const auth = client("owner-local-conflict");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "owner-local-conflict@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();

  await pool.query(
    "INSERT INTO users (id, email, role, display_name, status) VALUES (?, ?, 'OWNER', 'Existing Owner', 'ACTIVE')",
    ["stale-owner-with-data", "owner-local-conflict@example.test"],
  );
  await pool.query(
    "INSERT INTO pets (id, owner_id, name, species) VALUES (?, ?, ?, ?)",
    ["PC-STALE-OWNER-DATA", "stale-owner-with-data", "Bantay", "Dog"],
  );

  const initRes = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: "Replacement Owner" });

  assert.equal(initRes.status, 200);
  assert.equal(initRes.body.status, "ACTIVE");

  const [users] = await pool.query<(RowDataPacket & { id: string })[]>(
    "SELECT id FROM users WHERE email = ?",
    ["owner-local-conflict@example.test"],
  );
  assert.deepEqual(
    users.map((row) => row.id),
    [credential.user.uid],
  );

  const [pets] = await pool.query<
    (RowDataPacket & { id: string; owner_id: string })[]
  >("SELECT id, owner_id FROM pets WHERE id = ?", ["PC-STALE-OWNER-DATA"]);
  assert.equal(pets.length, 1);
  assert.equal(pets[0].owner_id, credential.user.uid);
});

test("owner initialization never reassigns a live local emulator identity", async () => {
  const auth = client("owner-local-live-conflict");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "owner-local-live-conflict@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();

  const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
  await getAdminAuth().createUser({
    uid: "stale-owner-live-auth",
    email: "stale-owner-live-auth@example.test",
  });

  await pool.query(
    "INSERT INTO users (id, email, role, display_name, status) VALUES (?, ?, 'OWNER', 'Existing Owner', 'ACTIVE')",
    ["stale-owner-live-auth", "owner-local-live-conflict@example.test"],
  );
  await pool.query(
    "INSERT INTO pets (id, owner_id, name, species) VALUES (?, ?, ?, ?)",
    ["PC-LIVE-OWNER-DATA", "stale-owner-live-auth", "Bantay", "Dog"],
  );

  const initRes = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: "Replacement Owner" });

  assert.equal(initRes.status, 409);
  assert.equal(initRes.body.error, "account-conflict");

  const [pets] = await pool.query<(RowDataPacket & { owner_id: string })[]>(
    "SELECT owner_id FROM pets WHERE id = ?",
    ["PC-LIVE-OWNER-DATA"],
  );
  assert.equal(pets[0].owner_id, "stale-owner-live-auth");
});

test("production mode never auto-reconciles a conflicting owner identity", async () => {
  const auth = client("owner-production-conflict");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "owner-production-conflict@example.test",
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();

  await pool.query(
    "INSERT INTO users (id, email, role, display_name, status) VALUES (?, ?, 'OWNER', 'Existing Owner', 'ACTIVE')",
    ["production-owner-conflict", "owner-production-conflict@example.test"],
  );

  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const initRes = await request(app)
      .post("/v1/account/initialize")
      .set("Authorization", `Bearer ${token}`)
      .send({ displayName: "Replacement Owner" });

    assert.equal(initRes.status, 409);
    assert.equal(initRes.body.error, "account-conflict");
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }

  const [users] = await pool.query<(RowDataPacket & { id: string })[]>(
    "SELECT id FROM users WHERE email = ?",
    ["owner-production-conflict@example.test"],
  );
  assert.deepEqual(
    users.map((row) => row.id),
    ["production-owner-conflict"],
  );
});

test("unauthenticated access is denied", async () => {
  const initRes = await request(app)
    .post("/v1/account/initialize")
    .send({ displayName: "Guest" });
  assert.equal(initRes.status, 401);

  const sessionRes = await request(app).get("/v1/session");
  assert.equal(sessionRes.status, 401);
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
  assert.equal(sessionRes.status, 401);
  assert.equal(sessionRes.body.error, "unauthenticated");
});

async function ownerToken(name: string, email: string) {
  const auth = client(name);
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    "Example-pass-123!",
  );
  await accounts.initializeOwner(credential.user.uid, { displayName: name });
  return {
    uid: credential.user.uid,
    token: await credential.user.getIdToken(true),
  };
}

test("pet CRUD persists fields and enforces owner-scoped access", async () => {
  const first = await ownerToken("pet-owner-a", "pets-a@example.test");
  const second = await ownerToken("pet-owner-b", "pets-b@example.test");
  const firstHeader = `Bearer ${first.token}`;
  const secondHeader = `Bearer ${second.token}`;

  assert.equal((await request(app).get("/v1/pets")).status, 401);
  const invalid = await request(app)
    .post("/v1/pets")
    .set("Authorization", firstHeader)
    .send({ name: "", species: "Dog" });
  assert.equal(invalid.status, 400);

  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", firstHeader)
    .send({
      name: " Bantay ",
      species: "Dog",
      breed: "Retriever",
      sex: "Male",
      ageLabel: "3 years",
      identifyingDetails: "Blue collar",
      microchipNumber: "985141000123456",
      ownerId: second.uid,
      id: "attacker-chosen",
    });
  assert.equal(created.status, 201);
  assert.match(created.body.id, /^PC-[A-F0-9-]{36}$/);
  assert.equal(created.body.name, "Bantay");
  assert.equal(created.body.identifyingDetails, "Blue collar");
  assert.equal(created.body.microchipNumber, "985141000123456");
  assert.equal(created.body.photoUrl, null);

  const id = created.body.id;
  const [rows] = await pool.query<
    (RowDataPacket & {
      owner_id: string;
      age_label: string;
      microchip_number: string | null;
    })[]
  >("SELECT owner_id, age_label, microchip_number FROM pets WHERE id = ?", [
    id,
  ]);
  assert.equal(rows[0].owner_id, first.uid);
  assert.equal(rows[0].age_label, "3 years");
  assert.equal(rows[0].microchip_number, "985141000123456");

  const firstList = await request(app)
    .get("/v1/pets")
    .set("Authorization", firstHeader);
  assert.deepEqual(
    firstList.body.pets.map((pet: { id: string }) => pet.id),
    [id],
  );
  const otherList = await request(app)
    .get("/v1/pets")
    .set("Authorization", secondHeader);
  assert.deepEqual(otherList.body.pets, []);
  for (const method of ["get", "patch", "delete"] as const) {
    const path = `/v1/pets/${id}`;
    const action =
      method === "get"
        ? request(app).get(path)
        : method === "patch"
          ? request(app).patch(path).send({ name: "Stolen" })
          : request(app).delete(path);
    assert.equal((await action.set("Authorization", secondHeader)).status, 404);
  }

  const edited = await request(app)
    .patch(`/v1/pets/${id}`)
    .set("Authorization", firstHeader)
    .send({
      name: " Bantay Jr ",
      breed: "",
      sex: "Female",
      ageLabel: "4 years",
      identifyingDetails: "White paw",
      microchipNumber: "985141000123457",
      ownerId: second.uid,
    });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, "Bantay Jr");
  assert.equal(edited.body.sex, "Female");
  assert.equal(edited.body.breed, "");
  assert.equal(edited.body.microchipNumber, "985141000123457");
  assert.equal(
    (await request(app).get(`/v1/pets/${id}`).set("Authorization", firstHeader))
      .body.identifyingDetails,
    "White paw",
  );
  assert.equal(
    (
      await request(app)
        .patch(`/v1/pets/${id}`)
        .set("Authorization", firstHeader)
        .send({ sex: "Unknown" })
    ).status,
    400,
  );

  assert.equal(
    (
      await request(app)
        .delete(`/v1/pets/${id}`)
        .set("Authorization", firstHeader)
    ).status,
    204,
  );
  assert.equal(
    (await request(app).get(`/v1/pets/${id}`).set("Authorization", firstHeader))
      .status,
    404,
  );
  assert.deepEqual(
    (await request(app).get("/v1/pets").set("Authorization", firstHeader)).body
      .pets,
    [],
  );
});

test("pet photos upload, replace and remove only for the owner", async () => {
  const owner = await ownerToken("photo-owner", "photo-owner@example.test");
  const other = await ownerToken("photo-other", "photo-other@example.test");
  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ name: "Mingming", species: "Cat" });
  const id = created.body.id;
  const path = `/v1/pets/${id}/photo`;
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "#e69664" },
  })
    .png()
    .toBuffer();

  assert.equal(
    (
      await request(app)
        .put(path)
        .set("Authorization", `Bearer ${other.token}`)
        .attach("file", png, { filename: "cat.png", contentType: "image/png" })
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .delete(path)
        .set("Authorization", `Bearer ${other.token}`)
    ).status,
    404,
  );
  assert.equal(
    (
      await request(app)
        .put(path)
        .set("Authorization", `Bearer ${owner.token}`)
        .attach("file", Buffer.from("not a photo"), {
          filename: "bad.png",
          contentType: "image/png",
        })
    ).status,
    400,
  );

  const uploaded = await request(app)
    .put(path)
    .set("Authorization", `Bearer ${owner.token}`)
    .attach("file", png, { filename: "cat.png", contentType: "image/png" });
  assert.equal(uploaded.status, 200, JSON.stringify(uploaded.body));
  assert.match(uploaded.body.photoUrl, /^\/uploads\/[a-f0-9-]+\.webp$/);
  const photoUrl = uploaded.body.photoUrl;
  const served = await request(app).get(photoUrl);
  assert.equal(served.status, 200);
  assert.equal(served.headers["content-type"], "image/webp");
  assert.equal(served.headers["x-content-type-options"], "nosniff");
  assert.match(served.headers["cache-control"], /immutable/);
  assert.notDeepEqual(served.body, png);
  assert.equal(
    (
      await request(app)
        .get(`/v1/pets/${id}`)
        .set("Authorization", `Bearer ${owner.token}`)
    ).body.photoUrl,
    photoUrl,
  );

  await request(app)
    .post("/v1/uploads")
    .set("Authorization", `Bearer ${owner.token}`)
    .attach("file", png, { filename: "orphan.png", contentType: "image/png" })
    .expect(410);

  const removed = await request(app)
    .delete(path)
    .set("Authorization", `Bearer ${owner.token}`);
  assert.equal(removed.status, 200);
  assert.equal(removed.body.photoUrl, null);
  const again = await request(app)
    .put(path)
    .set("Authorization", `Bearer ${owner.token}`)
    .attach("file", png, { filename: "cat.png", contentType: "image/png" });
  assert.equal(again.status, 200);
  assert.notEqual(again.body.photoUrl, photoUrl);
  assert.equal(
    (
      await request(app)
        .delete(`/v1/pets/${id}`)
        .set("Authorization", `Bearer ${owner.token}`)
    ).status,
    204,
  );
});

test("recovery QR tokens are public-safe, owner-scoped, revocable and rotatable", async () => {
  const owner = await ownerToken(
    "Recovery Owner",
    "recovery-owner@example.test",
  );
  const other = await ownerToken(
    "Other Recovery Owner",
    "recovery-other@example.test",
  );
  const ownerHeader = `Bearer ${owner.token}`;
  const otherHeader = `Bearer ${other.token}`;

  await request(app)
    .patch("/v1/profile")
    .set("Authorization", ownerHeader)
    .send({ phone: "09171234567" })
    .expect(200);

  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", ownerHeader)
    .send({
      name: "Lucky",
      species: "Dog",
      breed: "Aspin",
      sex: "Male",
      ageLabel: "2 years",
      identifyingDetails: "White chest and red collar",
      microchipNumber: "985141000654321",
    })
    .expect(201);
  const petId = created.body.id as string;

  const issued = await request(app)
    .get(`/v1/pets/${petId}/recovery`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(issued.body.active, true);
  assert.match(issued.body.token, /^[a-f0-9]{32}\.[A-Za-z0-9_-]{43}$/);
  assert.match(issued.body.recoveryUrl, /\/recover\?token=/);
  const firstToken = issued.body.token as string;

  await request(app)
    .get(`/v1/pets/${petId}/recovery`)
    .set("Authorization", otherHeader)
    .expect(404);

  const publicProfile = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(firstToken)}`)
    .expect(200);
  assert.equal(publicProfile.body.pet.name, "Lucky");
  assert.equal(publicProfile.body.pet.breed, "Aspin");
  assert.equal(
    publicProfile.body.pet.identifyingDetails,
    "White chest and red collar",
  );
  assert.equal(publicProfile.body.pet.microchipped, true);
  assert.equal(publicProfile.body.pet.microchipNumber, undefined);
  assert.equal(publicProfile.body.owner.displayName, "Recovery Owner");
  assert.equal(publicProfile.body.owner.phone, null);
  assert.equal(publicProfile.body.pet.id, undefined);
  assert.equal(publicProfile.body.owner.id, undefined);
  assert.equal(publicProfile.body.owner.email, undefined);

  const privacyDefaults = await request(app)
    .get("/v1/privacy")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.deepEqual(privacyDefaults.body, {
    shareRecoveryPhone: false,
    sharePreciseRecoveryLocation: false,
  });

  await request(app)
    .patch("/v1/privacy")
    .set("Authorization", ownerHeader)
    .send({ shareRecoveryPhone: true })
    .expect(200);

  const optedInProfile = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(firstToken)}`)
    .expect(200);
  assert.equal(optedInProfile.body.owner.phone, "09171234567");

  const tampered =
    firstToken.slice(0, -1) + (firstToken.endsWith("A") ? "B" : "A");
  await request(app)
    .get(`/v1/recovery/${encodeURIComponent(tampered)}`)
    .expect(404);

  const revoked = await request(app)
    .delete(`/v1/pets/${petId}/recovery`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.deepEqual(revoked.body, {
    active: false,
    token: null,
    recoveryUrl: null,
  });
  await request(app)
    .get(`/v1/recovery/${encodeURIComponent(firstToken)}`)
    .expect(404);

  const disabledState = await request(app)
    .get(`/v1/pets/${petId}/recovery`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(disabledState.body.active, false);

  const rotated = await request(app)
    .post(`/v1/pets/${petId}/recovery/rotate`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(rotated.body.active, true);
  assert.notEqual(rotated.body.token, firstToken);
  await request(app)
    .get(`/v1/recovery/${encodeURIComponent(rotated.body.token)}`)
    .expect(200);
  await request(app)
    .get(`/v1/recovery/${encodeURIComponent(firstToken)}`)
    .expect(404);
});

test("recovery tags are independent, short-code addressable, and record scans", async () => {
  const owner = await ownerToken("Tag Owner", "tag-owner@example.test");
  const ownerHeader = `Bearer ${owner.token}`;

  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", ownerHeader)
    .send({ name: "Milo", species: "Dog", breed: "Aspin" })
    .expect(201);
  const petId = created.body.id as string;

  const initial = await request(app)
    .get(`/v1/pets/${petId}/recovery/tags`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(initial.body.tags.length, 1);
  assert.equal(initial.body.tags[0].status, "ACTIVE");
  assert.match(initial.body.tags[0].shortCode, /^PC-[A-F0-9]{8}$/);

  const spare = await request(app)
    .post(`/v1/pets/${petId}/recovery/tags`)
    .set("Authorization", ownerHeader)
    .send({ label: "Harness", tagType: "HARNESS" })
    .expect(201);
  assert.equal(spare.body.label, "Harness");
  assert.notEqual(spare.body.token, initial.body.tags[0].token);

  const resolved = await request(app)
    .get(`/v1/recovery/code/${encodeURIComponent(spare.body.shortCode)}`)
    .expect(200);
  assert.equal(resolved.body.token, spare.body.token);

  const finder = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  await request(app)
    .post(`/v1/recovery/${encodeURIComponent(spare.body.token)}/scan`)
    .set("X-Finder-Session", finder.body.credential)
    .send({ source: "CODE" })
    .expect(201);
  await request(app)
    .post(`/v1/recovery/${encodeURIComponent(spare.body.token)}/scan`)
    .set("X-Finder-Session", finder.body.credential)
    .send({ source: "CODE" })
    .expect(200);

  await request(app)
    .post(`/v1/pets/${petId}/recovery/tags/${spare.body.id}/lost`)
    .set("Authorization", ownerHeader)
    .expect(200);

  await request(app)
    .get(`/v1/recovery/${encodeURIComponent(spare.body.token)}`)
    .expect(404);
  await request(app)
    .get(`/v1/recovery/${encodeURIComponent(initial.body.tags[0].token)}`)
    .expect(200);

  const replaced = await request(app)
    .post(`/v1/pets/${petId}/recovery/tags/${spare.body.id}/replace`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(replaced.body.status, "ACTIVE");
  assert.notEqual(replaced.body.shortCode, spare.body.shortCode);
  await request(app)
    .get(`/v1/recovery/code/${encodeURIComponent(spare.body.shortCode)}`)
    .expect(404);
});

test("recovery network transitions LOST to SIGHTED to REUNITED with privacy boundaries", async () => {
  const owner = await ownerToken("Network Owner", "network-owner@example.test");
  const nearbyMember = await ownerToken(
    "Nearby Member",
    "network-nearby@example.test",
  );
  const ownerHeader = `Bearer ${owner.token}`;
  const nearbyHeader = `Bearer ${nearbyMember.token}`;

  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", ownerHeader)
    .send({
      name: "Scout",
      species: "Dog",
      breed: "Aspin",
      sex: "Male",
      ageLabel: "4 years",
      identifyingDetails: "Green collar",
    })
    .expect(201);
  const petId = created.body.id as string;

  const recoveryState = await request(app)
    .get(`/v1/pets/${petId}/recovery`)
    .set("Authorization", ownerHeader)
    .expect(200);
  const token = recoveryState.body.token as string;

  await request(app)
    .put("/v1/push/devices")
    .set("Authorization", nearbyHeader)
    .send({
      expoPushToken: "ExpoPushToken[nearby-test-device]",
      platform: "android",
      latitude: 7.4478,
      longitude: 125.8078,
      accuracyM: 10,
    })
    .expect(204);

  await request(app)
    .put("/v1/push/devices")
    .set("Authorization", ownerHeader)
    .send({
      expoPushToken: "not-an-expo-token",
      platform: "android",
    })
    .expect(400);

  const report = await request(app)
    .post("/v1/lost-reports")
    .set("Authorization", ownerHeader)
    .send({
      petId,
      lastSeenText: "Freedom Park, Tagum",
      details: "May run away from motorcycles",
      latitude: 7.4479,
      longitude: 125.8079,
      accuracyM: 8,
    })
    .expect(201);
  assert.equal(report.body.status, "LOST");
  assert.equal(report.body.petName, "Scout");
  assert.equal(report.body.sightingCount, 0);
  const reportId = report.body.id as string;

  await request(app)
    .post("/v1/lost-reports")
    .set("Authorization", ownerHeader)
    .send({
      petId,
      lastSeenText: "Duplicate active case",
      latitude: 7.4479,
      longitude: 125.8079,
    })
    .expect(409);

  const nearbyFeed = await request(app)
    .get("/v1/recovery/nearby")
    .query({ latitude: 7.4478, longitude: 125.8078, radiusKm: 2 })
    .expect(200);
  assert.equal(nearbyFeed.body.reports.length, 1);
  assert.equal(nearbyFeed.body.reports[0].id, reportId);
  assert.equal(nearbyFeed.body.reports[0].status, "LOST");
  assert.equal(nearbyFeed.body.reports[0].finderContact, undefined);
  assert.equal(nearbyFeed.body.reports[0].latitude, 7.448);
  assert.equal(nearbyFeed.body.reports[0].longitude, 125.808);
  assert.ok(nearbyFeed.body.reports[0].accuracyM >= 150);

  const farFeed = await request(app)
    .get("/v1/recovery/nearby")
    .query({ latitude: 8.5, longitude: 125.8, radiusKm: 2 })
    .expect(200);
  assert.deepEqual(farFeed.body.reports, []);

  const nearbyAlerts = await request(app)
    .get("/v1/notifications")
    .set("Authorization", nearbyHeader)
    .expect(200);
  assert.equal(nearbyAlerts.body.notifications.length, 1);
  assert.equal(nearbyAlerts.body.notifications[0].type, "LOST_PET_NEARBY");
  assert.equal(nearbyAlerts.body.notifications[0].data.latitude, 7.448);
  assert.equal(nearbyAlerts.body.notifications[0].data.longitude, 125.808);
  assert.ok(nearbyAlerts.body.notifications[0].data.accuracyM >= 150);

  const publicLost = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(token)}`)
    .expect(200);
  assert.equal(publicLost.body.activeReport.status, "LOST");
  assert.equal(publicLost.body.activeReport.sightingCount, 0);
  assert.equal(publicLost.body.activeReport.latitude, 7.448);
  assert.equal(publicLost.body.activeReport.longitude, 125.808);
  assert.ok(publicLost.body.activeReport.accuracyM >= 150);
  assert.equal(publicLost.body.pet.id, undefined);
  assert.equal(publicLost.body.owner.email, undefined);

  await request(app)
    .patch("/v1/privacy")
    .set("Authorization", ownerHeader)
    .send({ sharePreciseRecoveryLocation: true })
    .expect(200);
  const precisePublicLost = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(token)}`)
    .expect(200);
  assert.equal(precisePublicLost.body.activeReport.latitude, 7.4479);
  assert.equal(precisePublicLost.body.activeReport.longitude, 125.8079);
  assert.equal(precisePublicLost.body.activeReport.accuracyM, 8);

  const sighting = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .send({
      finderName: "Helpful Finder",
      finderContact: "finder@example.test",
      notes: "Heading toward the market",
      latitude: 7.452,
      longitude: 125.812,
      accuracyM: 6,
    })
    .expect(201);
  assert.equal(sighting.body.reportId, reportId);
  assert.equal(sighting.body.finderContact, "finder@example.test");

  const mine = await request(app)
    .get("/v1/lost-reports")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(mine.body.reports[0].status, "SIGHTED");
  assert.equal(mine.body.reports[0].sightingCount, 1);
  assert.equal(Number(mine.body.reports[0].lastKnownLatitude), 7.452);
  assert.equal(Number(mine.body.reports[0].lastKnownLongitude), 125.812);
  assert.equal(Number(mine.body.reports[0].lastKnownAccuracyM), 6);
  assert.ok(mine.body.reports[0].lastSightedAt);

  const overview = await request(app)
    .get("/v1/owner/recovery-overview")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(overview.body.reports[0].id, reportId);
  assert.equal(overview.body.reports[0].status, "SIGHTED");
  assert.equal(overview.body.sightingsByReport[reportId].length, 1);
  assert.equal(
    overview.body.sightingsByReport[reportId][0].finderContact,
    "finder@example.test",
  );

  const ownerDetail = await request(app)
    .get(`/v1/lost-reports/${reportId}`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(ownerDetail.body.sightings.length, 1);
  assert.equal(
    ownerDetail.body.sightings[0].finderContact,
    "finder@example.test",
  );

  await request(app)
    .get(`/v1/lost-reports/${reportId}`)
    .set("Authorization", nearbyHeader)
    .expect(404);

  const publicSighted = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(token)}`)
    .expect(200);
  assert.equal(publicSighted.body.activeReport.status, "SIGHTED");
  assert.equal(publicSighted.body.activeReport.sightingCount, 1);
  assert.equal(publicSighted.body.activeReport.finderContact, undefined);
  assert.equal(publicSighted.body.activeReport.latitude, 7.452);
  assert.equal(publicSighted.body.activeReport.longitude, 125.812);
  assert.equal(publicSighted.body.activeReport.accuracyM, 6);

  const ownerAlerts = await request(app)
    .get("/v1/notifications")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(ownerAlerts.body.notifications.length, 1);
  assert.equal(ownerAlerts.body.notifications[0].type, "PET_SIGHTED");

  await request(app)
    .post(`/v1/lost-reports/${reportId}/reunite`)
    .set("Authorization", nearbyHeader)
    .expect(404);

  const reunited = await request(app)
    .post(`/v1/lost-reports/${reportId}/reunite`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(reunited.body.status, "REUNITED");
  assert.ok(reunited.body.reunitedAt);

  const afterReunionFeed = await request(app)
    .get("/v1/recovery/nearby")
    .query({ latitude: 7.4478, longitude: 125.8078, radiusKm: 10 })
    .expect(200);
  assert.deepEqual(afterReunionFeed.body.reports, []);

  const afterReunionProfile = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(token)}`)
    .expect(200);
  assert.equal(afterReunionProfile.body.activeReport, null);

  await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .send({
      notes: "Too late",
      latitude: 7.453,
      longitude: 125.813,
    })
    .expect(409);

  const historical = await request(app)
    .get("/v1/lost-reports")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(historical.body.reports[0].status, "REUNITED");
});

test("no-tag finder sightings can attach staged photo evidence by report ID", async () => {
  const owner = await ownerToken(
    "No Tag Evidence Owner",
    "no-tag-evidence@example.test",
  );
  const ownerHeader = `Bearer ${owner.token}`;

  const pet = await request(app)
    .post("/v1/pets")
    .set("Authorization", ownerHeader)
    .send({ name: "Luna", species: "Dog", breed: "Aspin" })
    .expect(201);

  const report = await request(app)
    .post("/v1/lost-reports")
    .set("Authorization", ownerHeader)
    .send({
      petId: pet.body.id,
      lastSeenText: "Public market",
      latitude: 7.4479,
      longitude: 125.8079,
      accuracyM: 12,
    })
    .expect(201);
  const reportId = report.body.id as string;

  const finder = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  const finderHeader = finder.body.credential as string;

  const png = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 60, g: 85, b: 70 },
    },
  })
    .png()
    .toBuffer();

  const staged = await request(app)
    .post(`/v1/recovery/report/${encodeURIComponent(reportId)}/evidence/photo`)
    .set("X-Finder-Session", finderHeader)
    .attach("file", png, {
      filename: "luna-sighting.png",
      contentType: "image/png",
    })
    .expect(201);
  assert.match(staged.body.id, /^EV-/);
  assert.equal(staged.body.mimeType, "image/webp");

  const payload = {
    evidenceId: staged.body.id,
    locationText: "Beside the public market entrance",
    notes: "Heading toward the terminal",
    idempotencyKey: "no-tag-photo-001",
  };
  const sighting = await request(app)
    .post(`/v1/recovery/report/${encodeURIComponent(reportId)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send(payload)
    .expect(201);

  assert.equal(sighting.body.kind, "SIGHTING");
  assert.equal(sighting.body.sighting.encounterType, "SEEN");
  assert.equal(sighting.body.sighting.evidence.length, 1);
  assert.equal(sighting.body.sighting.evidence[0].id, staged.body.id);

  const retry = await request(app)
    .post(`/v1/recovery/report/${encodeURIComponent(reportId)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send(payload)
    .expect(201);
  assert.equal(retry.body.sighting.id, sighting.body.sighting.id);

  const [evidenceRows] = await pool.query<
    (RowDataPacket & { status: string; sighting_id: string | null })[]
  >("SELECT status, sighting_id FROM sighting_evidence WHERE id = ?", [
    staged.body.id,
  ]);
  assert.equal(evidenceRows[0].status, "ATTACHED");
  assert.equal(evidenceRows[0].sighting_id, sighting.body.sighting.id);

  const [sightingCount] = await pool.query<
    (RowDataPacket & { count: number | string })[]
  >("SELECT COUNT(*) AS count FROM sightings WHERE report_id = ?", [reportId]);
  assert.equal(Number(sightingCount[0].count), 1);
});

test("anonymous finder recovery supports evidence, privacy, idempotency and non-lost contact", async () => {
  const owner = await ownerToken(
    "Finder Recovery Owner",
    "finder-recovery-owner@example.test",
  );
  const ownerHeader = `Bearer ${owner.token}`;
  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", ownerHeader)
    .send({
      name: "Bantay",
      species: "Dog",
      breed: "Aspin",
      sex: "Male",
      ageLabel: "3 years",
      identifyingDetails: "Brown coat, white chest, green collar",
    })
    .expect(201);
  const petId = created.body.id as string;
  const recoveryState = await request(app)
    .get(`/v1/pets/${petId}/recovery`)
    .set("Authorization", ownerHeader)
    .expect(200);
  const token = recoveryState.body.token as string;

  const session = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  assert.match(session.body.credential, /^FS-[0-9A-F-]{36}\.[A-Za-z0-9_-]+$/);
  assert.equal(session.body.phoneVerified, false);
  const finderHeader = session.body.credential as string;

  await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send({
      encounterType: "HAVE_PET",
      locationText: "Near Freedom Park",
      idempotencyKey: "have-without-photo",
    })
    .expect(400);

  const png = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 3,
      background: { r: 90, g: 70, b: 40 },
    },
  })
    .png()
    .toBuffer();
  const staged = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/evidence/photo`)
    .set("X-Finder-Session", finderHeader)
    .attach("file", png, {
      filename: "bantay.png",
      contentType: "image/png",
    })
    .expect(201);
  assert.match(staged.body.id, /^EV-/);
  assert.equal(staged.body.mimeType, "image/webp");

  const [storedEvidence] = await pool.query<
    (RowDataPacket & { storage_url: string })[]
  >("SELECT storage_url FROM sighting_evidence WHERE id = ?", [staged.body.id]);
  assert.equal(storedEvidence.length, 1);
  await request(app).get(storedEvidence[0].storage_url).expect(404);

  const otherSession = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .set("X-Finder-Session", otherSession.body.credential)
    .send({
      encounterType: "HAVE_PET",
      evidenceId: staged.body.id,
      locationText: "Wrong session",
      idempotencyKey: "wrong-session-photo",
    })
    .expect(409);

  const foundPayload = {
    encounterType: "HAVE_PET",
    evidenceId: staged.body.id,
    finderName: "Helpful Finder",
    finderContact: "09171234567",
    shareContact: false,
    notes: "Bantay is safe with me.",
    latitude: 7.4479,
    longitude: 125.8079,
    accuracyM: 7,
    locationSource: "GPS",
    idempotencyKey: "non-lost-have-pet-001",
  };
  const found = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send(foundPayload)
    .expect(201);
  assert.equal(found.body.kind, "RECOVERY_CONTACT");
  assert.equal(found.body.event.encounterType, "HAVE_PET");
  assert.equal(found.body.event.finderContact, null);
  assert.equal(found.body.event.contactShared, false);
  assert.equal(found.body.event.evidence.length, 1);
  const eventId = found.body.event.id as string;
  const evidenceId = found.body.event.evidence[0].id as string;

  const duplicate = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send(foundPayload)
    .expect(201);
  assert.equal(duplicate.body.event.id, eventId);
  const [contactCount] = await pool.query<
    (RowDataPacket & { count: number | string })[]
  >("SELECT COUNT(*) AS count FROM recovery_contact_events");
  assert.equal(Number(contactCount[0].count), 1);
  const [lostCount] = await pool.query<
    (RowDataPacket & { count: number | string })[]
  >("SELECT COUNT(*) AS count FROM lost_reports");
  assert.equal(Number(lostCount[0].count), 0);

  const privateContact = await request(app)
    .get(`/v1/recovery-contacts/${eventId}`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(privateContact.body.finderContact, null);
  assert.equal(privateContact.body.latitude, 7.4479);
  assert.equal(privateContact.body.longitude, 125.8079);
  assert.equal(privateContact.body.evidence.length, 1);

  await request(app).get(`/v1/finder-evidence/${evidenceId}/file`).expect(401);
  const evidenceFile = await request(app)
    .get(`/v1/finder-evidence/${evidenceId}/file`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(evidenceFile.headers["content-type"], "image/webp");
  assert.match(evidenceFile.headers["cache-control"], /no-store/);

  const foundAlerts = await request(app)
    .get("/v1/notifications")
    .set("Authorization", ownerHeader)
    .expect(200);
  const foundNotice = foundAlerts.body.notifications.find(
    (item: { type: string }) => item.type === "PET_QR_FOUND",
  );
  assert.equal(foundNotice.data.recoveryContactEventId, eventId);
  assert.equal(foundNotice.data.finderContact, undefined);
  assert.equal(foundNotice.data.latitude, undefined);

  const report = await request(app)
    .post("/v1/lost-reports")
    .set("Authorization", ownerHeader)
    .send({
      petId,
      lastSeenText: "Madaum road",
      latitude: 7.45,
      longitude: 125.8,
      accuracyM: 12,
    })
    .expect(201);
  const reportId = report.body.id as string;

  const seen = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send({
      encounterType: "SEEN",
      finderContact: "private@example.test",
      shareContact: false,
      notes: "Running toward the market",
      locationText: "Outside the barangay hall",
      idempotencyKey: "text-only-sighting-001",
    })
    .expect(201);
  assert.equal(seen.body.kind, "SIGHTING");
  assert.equal(seen.body.sighting.encounterType, "SEEN");
  assert.equal(seen.body.sighting.latitude, null);
  assert.equal(seen.body.sighting.finderContact, null);
  assert.equal(seen.body.sighting.locationText, "Outside the barangay hall");

  const reportAfterTextSighting = await request(app)
    .get(`/v1/lost-reports/${reportId}`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(reportAfterTextSighting.body.report.status, "SIGHTED");
  assert.equal(
    Number(reportAfterTextSighting.body.report.lastKnownLatitude),
    7.45,
  );
  assert.equal(
    Number(reportAfterTextSighting.body.report.lastKnownLongitude),
    125.8,
  );

  const secondPhoto = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/evidence/photo`)
    .set("X-Finder-Session", finderHeader)
    .attach("file", png, {
      filename: "bantay-again.png",
      contentType: "image/png",
    })
    .expect(201);
  const haveLost = await request(app)
    .post(`/v1/recovery/${encodeURIComponent(token)}/sightings`)
    .set("X-Finder-Session", finderHeader)
    .send({
      encounterType: "HAVE_PET",
      evidenceId: secondPhoto.body.id,
      finderName: "Finder Two",
      finderContact: "+639171234567",
      shareContact: true,
      notes: "Waiting by the guardhouse.",
      latitude: 7.451,
      longitude: 125.801,
      accuracyM: 5,
      idempotencyKey: "active-have-pet-001",
    })
    .expect(201);
  assert.equal(haveLost.body.kind, "SIGHTING");
  assert.equal(haveLost.body.sighting.encounterType, "HAVE_PET");
  assert.equal(haveLost.body.sighting.finderContact, "+639171234567");
  assert.equal(haveLost.body.sighting.contactShared, true);
  assert.equal(haveLost.body.sighting.evidence.length, 1);

  const previousExpose = process.env.FINDER_OTP_EXPOSE_CODE;
  process.env.FINDER_OTP_EXPOSE_CODE = "true";
  try {
    const otp = await request(app)
      .post("/v1/recovery/finder-session/otp/send")
      .set("X-Finder-Session", finderHeader)
      .send({ phone: "09171234567" })
      .expect(201);
    assert.match(otp.body.developmentCode, /^\d{6}$/);
    await request(app)
      .post("/v1/recovery/finder-session/otp/verify")
      .set("X-Finder-Session", finderHeader)
      .send({
        challengeId: otp.body.challengeId,
        code: otp.body.developmentCode,
      })
      .expect(200);
    const resumed = await request(app)
      .post("/v1/recovery/finder-session")
      .set("X-Finder-Session", finderHeader)
      .expect(200);
    assert.equal(resumed.body.phoneVerified, true);
  } finally {
    if (previousExpose === undefined) delete process.env.FINDER_OTP_EXPOSE_CODE;
    else process.env.FINDER_OTP_EXPOSE_CODE = previousExpose;
  }

  await request(app)
    .post(`/v1/lost-reports/${reportId}/reunite`)
    .set("Authorization", ownerHeader)
    .expect(200);
  await pool.query(
    "UPDATE lost_reports SET reunited_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 DAY) WHERE id = ?",
    [reportId],
  );
  await pool.query(
    "UPDATE recovery_contact_events SET created_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 31 DAY) WHERE id = ?",
    [eventId],
  );
  // Simulate notifications written by the previous version with finder text.
  await pool.query("UPDATE notifications SET body = ? WHERE id = ?", [
    "Legacy finder contact 09171234567 at the guardhouse",
    foundNotice.id,
  ]);
  await finderEvidence.cleanupExpired();

  const [retainedSightings] = await pool.query<
    (RowDataPacket & {
      finder_contact: string | null;
      latitude: number | string | null;
    })[]
  >("SELECT finder_contact, latitude FROM sightings WHERE id = ?", [
    haveLost.body.sighting.id,
  ]);
  assert.equal(retainedSightings[0].finder_contact, null);
  assert.equal(retainedSightings[0].latitude, null);
  const retainedReport = await request(app)
    .get(`/v1/lost-reports/${reportId}`)
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(retainedReport.body.report.lastKnownLatitude, 7.45);
  assert.equal(retainedReport.body.report.lastKnownLongitude, 125.8);
  assert.equal(retainedReport.body.sightings[0].notes, "");
  const [retainedContact] = await pool.query<
    (RowDataPacket & {
      finder_name: string | null;
      longitude: number | string | null;
    })[]
  >("SELECT finder_name, longitude FROM recovery_contact_events WHERE id = ?", [
    eventId,
  ]);
  assert.equal(retainedContact[0].finder_name, null);
  assert.equal(retainedContact[0].longitude, null);
  const retainedAlerts = await request(app)
    .get("/v1/notifications")
    .set("Authorization", ownerHeader)
    .expect(200);
  const retainedNotice = retainedAlerts.body.notifications.find(
    (notice: { id: string }) => notice.id === foundNotice.id,
  );
  assert.equal(retainedNotice.body.includes("09171234567"), false);
  await request(app)
    .get(`/v1/finder-evidence/${evidenceId}/file`)
    .set("Authorization", ownerHeader)
    .expect(404);
});

test("finder cleanup keeps failed deletions eligible for retry", async () => {
  const owner = await ownerToken("Cleanup Owner", "cleanup-owner@example.test");
  const pet = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${owner.token}`)
    .send({ name: "Retry", species: "Dog" })
    .expect(201);
  const session = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  const finderSessionId = String(session.body.credential).split(".")[0];
  const storageUrl =
    "/uploads/recovery/00000000-0000-4000-8000-000000000001.webp";
  const removed: string[] = [];
  let failRemoval = true;
  const storage: MediaStorage = {
    owns: (reference) => reference === storageUrl,
    save: async () => {
      throw new Error("unused");
    },
    read: async () => {
      throw new Error("unused");
    },
    remove: async (reference) => {
      assert.equal(reference, storageUrl);
      if (failRemoval) throw new Error("simulated storage failure");
      removed.push(reference);
    },
  };
  const retryableEvidence = new FinderEvidence(pool, storage);
  const staged = await retryableEvidence.stage(pet.body.id, finderSessionId, {
    relativeUrl: storageUrl,
    mimeType: "image/webp",
    byteSize: 1,
    width: 1,
    height: 1,
    sha256: "0".repeat(64),
  });
  await pool.query(
    "UPDATE sighting_evidence SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 HOUR) WHERE id = ?",
    [staged.evidence.id],
  );

  await assert.rejects(retryableEvidence.cleanupExpired());
  const [failed] = await pool.query<(RowDataPacket & { status: string })[]>(
    "SELECT status FROM sighting_evidence WHERE id = ?",
    [staged.evidence.id],
  );
  assert.equal(failed[0].status, "STAGED");

  failRemoval = false;
  await retryableEvidence.cleanupExpired();
  const [retried] = await pool.query<(RowDataPacket & { status: string })[]>(
    "SELECT status FROM sighting_evidence WHERE id = ?",
    [staged.evidence.id],
  );
  assert.equal(retried[0].status, "DELETED");
  assert.deepEqual(removed, [storageUrl]);
});

test("finder sessions resume safely and reject expired or blocked credentials", async () => {
  const first = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  const credential = first.body.credential as string;
  const id = credential.split(".")[0];
  const resumed = await request(app)
    .post("/v1/recovery/finder-session")
    .set("X-Finder-Session", credential)
    .expect(200);
  assert.equal(resumed.body.credential, credential);
  assert.ok(
    Math.abs(
      Date.parse(resumed.body.expiresAt) - Date.parse(first.body.expiresAt),
    ) < 1000,
  );
  assert.ok(
    Date.parse(first.body.expiresAt) - Date.now() <= 30 * 86400000 + 1000,
  );
  const [rows] = await pool.query<
    (RowDataPacket & { secret_hash: string; ip_hash: string })[]
  >("SELECT secret_hash, ip_hash FROM finder_sessions WHERE id = ?", [id]);
  assert.match(rows[0].secret_hash, /^[a-f0-9]{64}$/);
  assert.match(rows[0].ip_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first.body).includes(rows[0].ip_hash), false);
  await pool.query(
    "UPDATE finder_sessions SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE id = ?",
    [id],
  );
  await request(app)
    .post("/v1/recovery/finder-session/otp/send")
    .set("X-Finder-Session", credential)
    .send({ phone: "09171234567" })
    .expect(401);
  const second = await request(app)
    .post("/v1/recovery/finder-session")
    .expect(201);
  await pool.query(
    "UPDATE finder_sessions SET status = 'BLOCKED' WHERE id = ?",
    [second.body.credential.split(".")[0]],
  );
  await request(app)
    .post("/v1/recovery/finder-session/otp/send")
    .set("X-Finder-Session", second.body.credential)
    .send({ phone: "09171234567" })
    .expect(401);
});

test("finder OTP enforces expiry, attempts, cooldown and IP limits", async () => {
  const saved = process.env.FINDER_OTP_EXPOSE_CODE;
  process.env.FINDER_OTP_EXPOSE_CODE = "true";
  try {
    const first = await request(app)
      .post("/v1/recovery/finder-session")
      .expect(201);
    const otp = await request(app)
      .post("/v1/recovery/finder-session/otp/send")
      .set("X-Finder-Session", first.body.credential)
      .send({ phone: "09171234567" })
      .expect(201);
    const [stored] = await pool.query<
      (RowDataPacket & { code_hash: string; phone_hash: string })[]
    >("SELECT code_hash, phone_hash FROM finder_otp_challenges WHERE id = ?", [
      otp.body.challengeId,
    ]);
    assert.match(stored[0].code_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(stored[0].code_hash, otp.body.developmentCode);
    assert.equal(JSON.stringify(stored[0]).includes("09171234567"), false);
    await request(app)
      .post("/v1/recovery/finder-session/otp/send")
      .set("X-Finder-Session", first.body.credential)
      .send({ phone: "09171234567" })
      .expect(429);
    const wrong = otp.body.developmentCode === "000000" ? "999999" : "000000";
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app)
        .post("/v1/recovery/finder-session/otp/verify")
        .set("X-Finder-Session", first.body.credential)
        .send({ challengeId: otp.body.challengeId, code: wrong })
        .expect(400);
    }
    await request(app)
      .post("/v1/recovery/finder-session/otp/verify")
      .set("X-Finder-Session", first.body.credential)
      .send({
        challengeId: otp.body.challengeId,
        code: otp.body.developmentCode,
      })
      .expect(400);
    const second = await request(app)
      .post("/v1/recovery/finder-session")
      .expect(201);
    const expiring = await request(app)
      .post("/v1/recovery/finder-session/otp/send")
      .set("X-Finder-Session", second.body.credential)
      .send({ phone: "+639181234567" })
      .expect(201);
    await pool.query(
      "UPDATE finder_otp_challenges SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE id = ?",
      [expiring.body.challengeId],
    );
    await request(app)
      .post("/v1/recovery/finder-session/otp/verify")
      .set("X-Finder-Session", second.body.credential)
      .send({
        challengeId: expiring.body.challengeId,
        code: expiring.body.developmentCode,
      })
      .expect(400);
    process.env.FINDER_OTP_EXPOSE_CODE = "false";
    const third = await request(app)
      .post("/v1/recovery/finder-session")
      .expect(201);
    const privateOtp = await request(app)
      .post("/v1/recovery/finder-session/otp/send")
      .set("X-Finder-Session", third.body.credential)
      .send({ phone: "+639191234567" })
      .expect(201);
    assert.equal(privateOtp.body.developmentCode, undefined);
    for (let index = 0; index < 7; index++) {
      await pool.query(
        `INSERT INTO finder_otp_challenges (id, finder_session_id, phone_hash, code_hash, expires_at)
         SELECT ?, finder_session_id, ?, code_hash, expires_at FROM finder_otp_challenges WHERE id = ?`,
        [`OTP-IP-LIMIT-${index}`, "0".repeat(64), otp.body.challengeId],
      );
    }
    const fourth = await request(app)
      .post("/v1/recovery/finder-session")
      .expect(201);
    await request(app)
      .post("/v1/recovery/finder-session/otp/send")
      .set("X-Finder-Session", fourth.body.credential)
      .send({ phone: "+639201234567" })
      .expect(429);
  } finally {
    if (saved === undefined) delete process.env.FINDER_OTP_EXPOSE_CODE;
    else process.env.FINDER_OTP_EXPOSE_CODE = saved;
  }
});

test("each pooled database connection uses UTC for server timestamps", async () => {
  const freshPool = createPool();
  const connections = await Promise.all([
    freshPool.getConnection(),
    freshPool.getConnection(),
  ]);
  try {
    for (const connection of connections) {
      const [rows] = await connection.query<RowDataPacket[]>(
        "SELECT @@SESSION.time_zone AS session_zone, CURRENT_TIMESTAMP AS created_at",
      );
      assert.equal(rows[0].session_zone, "+00:00");
      assert.ok(
        Math.abs(rows[0].created_at.getTime() - Date.now()) < 5000,
        "Database timestamps must represent the current instant.",
      );
    }
  } finally {
    for (const connection of connections) connection.release();
    await freshPool.end();
  }
});

test("reminder edits reject a retained notification after the new due time", async () => {
  const owner = await ownerToken(
    "Reminder Dates",
    "reminder-dates@example.test",
  );
  const header = "Bearer " + owner.token;
  const pet = await request(app)
    .post("/v1/pets")
    .set("Authorization", header)
    .send({ name: "Milo", species: "Dog" })
    .expect(201);
  const dueAt = new Date(Date.now() + 7 * 86400000).toISOString();
  const notifyAt = new Date(Date.now() + 6 * 86400000).toISOString();
  const reminder = await request(app)
    .post("/v1/reminders")
    .set("Authorization", header)
    .send({ petId: pet.body.id, title: "Checkup", dueAt, notifyAt })
    .expect(201);
  const earlierDueAt = new Date(Date.now() + 3 * 86400000).toISOString();

  await request(app)
    .patch("/v1/reminders/" + reminder.body.id)
    .set("Authorization", header)
    .send({ dueAt: earlierDueAt })
    .expect(400);
  const unchanged = await request(app)
    .get("/v1/reminders")
    .set("Authorization", header)
    .expect(200);
  assert.deepEqual(unchanged.body.reminders, [reminder.body]);
  const [jobs] = await pool.query<RowDataPacket[]>(
    "SELECT scheduled_at FROM scheduled_notifications WHERE dedupe_key = ?",
    ["health-reminder:" + reminder.body.id],
  );
  assert.equal(jobs[0].scheduled_at.toISOString(), reminder.body.notifyAt);

  const corrected = await request(app)
    .patch("/v1/reminders/" + reminder.body.id)
    .set("Authorization", header)
    .send({ dueAt: earlierDueAt, notifyAt: earlierDueAt })
    .expect(200);
  assert.equal(corrected.body.dueAt, corrected.body.notifyAt);
});

async function auditOwner(name: string) {
  const auth = client("audit-" + name);
  const credential = await createUserWithEmailAndPassword(
    auth,
    "audit-" + name + "@example.test",
    "Example-pass-123!",
  );
  const response = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", "Bearer " + (await credential.user.getIdToken()))
    .send({ displayName: "Audit " + name });
  assert.equal(response.status, 200);
  return {
    uid: credential.user.uid,
    token: await credential.user.getIdToken(true),
  };
}
async function auditPet(token: string) {
  const response = await request(app)
    .post("/v1/pets")
    .set("Authorization", "Bearer " + token)
    .send({
      name: "Audit Pet",
      species: "Dog",
      breed: "Mixed",
      sex: "Male",
      ageLabel: "2 years",
      identifyingDetails: "",
      microchipNumber: "",
    });
  assert.equal(response.status, 201);
  return response.body.id as string;
}
function auditDue(days = 3) {
  return new Date(
    Math.floor((Date.now() + days * 86400000) / 1000) * 1000,
  ).toISOString();
}

test("retired clinic identities cannot initialize, sign in, read owner data, or use clinic routes", async () => {
  const auth = client("audit-retired");
  const credential = await createUserWithEmailAndPassword(
    auth,
    "audit-retired@example.test",
    "Example-pass-123!",
  );
  const uid = credential.user.uid;
  const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
  await getAdminAuth().setCustomUserClaims(uid, {
    role: "CLINIC",
    clinicId: "legacy-clinic",
  });
  await pool.query(
    "INSERT INTO users (id,email,role,display_name,status) VALUES (?,?,'CLINIC','Historical Vet','ACTIVE')",
    [uid, "audit-retired@example.test"],
  );
  const token = await credential.user.getIdToken(true);
  const session = await request(app)
    .get("/v1/session")
    .set("Authorization", "Bearer " + token);
  assert.equal(session.status, 403);
  assert.equal(
    (
      await request(app)
        .get("/v1/pets")
        .set("Authorization", "Bearer " + token)
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/v1/account/initialize")
        .set("Authorization", "Bearer " + token)
        .send({ displayName: "Retired Vet" })
    ).status,
    403,
  );
  for (const path of [
    "/v1/clinic",
    "/v1/clinic/appointments",
    "/v1/clinic/patients/recovery/legacy",
  ])
    assert.equal(
      (
        await request(app)
          .get(path)
          .set("Authorization", "Bearer " + token)
      ).status,
      404,
    );
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT role FROM users WHERE id = ?",
    [uid],
  );
  assert.equal(
    rows[0].role,
    "CLINIC",
    "A historical identity must never be silently converted into an owner",
  );
});

test("owner care retains historical veterinary records and saves and cancels personal appointment schedules", async () => {
  const owner = await auditOwner("care");
  const petId = await auditPet(owner.token);
  await pool.query(
    "INSERT INTO users (id,email,role,display_name,status) VALUES ('historical-vet','history@example.test','CLINIC','Historical Vet','DISABLED')",
  );
  await pool.query(
    "INSERT INTO clinics (id,name,address,status) VALUES ('historical-clinic','Historical Clinic','Test location','ACTIVE')",
  );
  await pool.query(
    "INSERT INTO health_records (id,pet_id,clinic_id,vet_id,record_type,title,occurred_at) VALUES ('HR-HISTORY',?,'historical-clinic','historical-vet','CHECKUP','Preserved checkup',UTC_TIMESTAMP())",
    [petId],
  );
  const history = await request(app)
    .get("/v1/health-records")
    .set("Authorization", "Bearer " + owner.token);
  assert.equal(history.status, 200);
  assert.equal(history.body.records[0].vetName, "Historical Vet");
  const saved = await request(app)
    .post("/v1/appointments")
    .set("Authorization", "Bearer " + owner.token)
    .send({
      petId,
      clinicId: "historical-clinic",
      appointmentDate: auditDue(),
      reason: "Owner calendar visit",
      reminderMinutesBefore: 60,
    });
  assert.equal(saved.status, 201);
  assert.equal(saved.body.status, "SCHEDULED");
  const [reminders] = await pool.query<RowDataPacket[]>(
    "SELECT id,status FROM health_reminders WHERE source_id = ?",
    [saved.body.id],
  );
  assert.equal(reminders.length, 1);
  assert.equal(reminders[0].status, "PENDING");
  assert.equal(
    (
      await request(app)
        .get("/v1/reminders/" + reminders[0].id)
        .set("Authorization", "Bearer " + owner.token)
    ).status,
    200,
  );
  const cancelled = await request(app)
    .post("/v1/appointments/" + saved.body.id + "/cancel")
    .set("Authorization", "Bearer " + owner.token);
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.status, "CANCELLED");
  const [jobs] = await pool.query<RowDataPacket[]>(
    "SELECT status FROM scheduled_notifications WHERE dedupe_key = ?",
    ["health-reminder:" + reminders[0].id],
  );
  assert.equal(jobs[0].status, "CANCELLED");
  const privacy = await request(app)
    .get("/v1/privacy")
    .set("Authorization", "Bearer " + owner.token);
  assert.deepEqual(Object.keys(privacy.body).sort(), [
    "sharePreciseRecoveryLocation",
    "shareRecoveryPhone",
  ]);
});

test("queue insertion failure rolls back reminder creation and edits, so a retry creates one reminder", async (t) => {
  const owner = await auditOwner("atomic");
  const petId = await auditPet(owner.token);
  const input = {
    petId,
    title: "Atomic reminder",
    dueAt: auditDue(),
    notifyAt: auditDue(2),
  };
  const schedule = t.mock.method(
    scheduledNotifications,
    "schedule",
    async () => {
      throw new Error("queue unavailable");
    },
  );
  const failed = await request(app)
    .post("/v1/reminders")
    .set("Authorization", "Bearer " + owner.token)
    .send(input);
  assert.equal(failed.status, 500);
  const [empty] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM health_reminders WHERE owner_id = ?",
    [owner.uid],
  );
  assert.equal(Number(empty[0].count), 0);
  schedule.mock.restore();
  const retry = await request(app)
    .post("/v1/reminders")
    .set("Authorization", "Bearer " + owner.token)
    .send(input);
  assert.equal(retry.status, 201);
  const editSchedule = t.mock.method(
    scheduledNotifications,
    "schedule",
    async () => {
      throw new Error("queue unavailable");
    },
  );
  const edited = await request(app)
    .patch("/v1/reminders/" + retry.body.id)
    .set("Authorization", "Bearer " + owner.token)
    .send({ title: "Must roll back" });
  assert.equal(edited.status, 500);
  editSchedule.mock.restore();
  const detail = await request(app)
    .get("/v1/reminders/" + retry.body.id)
    .set("Authorization", "Bearer " + owner.token);
  assert.equal(detail.body.title, "Atomic reminder");
  const [counts] = await pool.query<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM health_reminders) AS reminders, (SELECT COUNT(*) FROM scheduled_notifications) AS jobs",
  );
  assert.equal(Number(counts[0].reminders), 1);
  assert.equal(Number(counts[0].jobs), 1);
});

test("appointment save rolls back its appointment, reminder, audit record and queue when scheduling fails", async (t) => {
  const owner = await auditOwner("atomic-appointment");
  const petId = await auditPet(owner.token);
  await pool.query(
    "INSERT INTO clinics (id,name,address,status) VALUES ('atomic-location','Clinic location','Address','ACTIVE')",
  );
  t.mock.method(scheduledNotifications, "schedule", async () => {
    throw new Error("queue unavailable");
  });
  const response = await request(app)
    .post("/v1/appointments")
    .set("Authorization", "Bearer " + owner.token)
    .send({ petId, clinicId: "atomic-location", appointmentDate: auditDue() });
  assert.equal(response.status, 500);
  const [counts] = await pool.query<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM appointments) AS appointments, (SELECT COUNT(*) FROM health_reminders) AS reminders, (SELECT COUNT(*) FROM scheduled_notifications) AS jobs, (SELECT COUNT(*) FROM audit_logs WHERE entity_type='appointment') AS audits",
  );
  for (const field of ["appointments", "reminders", "jobs", "audits"])
    assert.equal(Number(counts[0][field]), 0);
});

test("reminder details beyond the 250-row list limit remain owner-scoped and readable", async () => {
  const owner = await auditOwner("many-reminders");
  const other = await auditOwner("other-reminders");
  const petId = await auditPet(owner.token);
  const base = new Date(auditDue()).getTime();
  const values = Array.from({ length: 260 }, (_, index) => [
    "RM-AUDIT-" + index,
    petId,
    owner.uid,
    "Reminder " + index,
    new Date(base + index * 3600000),
    new Date(base),
    "PENDING",
  ]);
  await pool.query(
    "INSERT INTO health_reminders (id,pet_id,owner_id,title,due_at,notify_at,status) VALUES ?",
    [values],
  );
  const list = await request(app)
    .get("/v1/reminders")
    .set("Authorization", "Bearer " + owner.token);
  assert.equal(list.body.reminders.length, 250);
  const range = await request(app)
    .get("/v1/reminders")
    .query({
      from: new Date(base).toISOString(),
      to: new Date(base + 31 * 86400000).toISOString(),
    })
    .set("Authorization", "Bearer " + owner.token);
  assert.equal(range.body.reminders.length, 260);
  const detail = await request(app)
    .get("/v1/reminders/RM-AUDIT-259")
    .set("Authorization", "Bearer " + owner.token);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.title, "Reminder 259");
  assert.equal(
    (
      await request(app)
        .get("/v1/reminders/RM-AUDIT-259")
        .set("Authorization", "Bearer " + other.token)
    ).status,
    404,
  );
});

test("finder middleware forwards a database failure and the API remains responsive", async (t) => {
  const resolver = t.mock.method(finderSessions, "resolve", async () => {
    throw new Error("database offline");
  });
  const failed = await request(app)
    .post("/v1/recovery/finder-session/otp/send")
    .set("X-Finder-Session", "unavailable")
    .send({ phone: "+639172345678" });
  assert.equal(failed.status, 500);
  assert.ok(!String(failed.body.message).includes("database offline"));
  resolver.mock.restore();
  assert.equal((await request(app).get("/v1/health")).status, 200);
});

test("concurrent OTP verification enforces the five-attempt budget and consumes a valid code once", async (t) => {
  const previousExposeCode = process.env.FINDER_OTP_EXPOSE_CODE;
  process.env.FINDER_OTP_EXPOSE_CODE = "true";
  t.after(() => {
    if (previousExposeCode === undefined)
      delete process.env.FINDER_OTP_EXPOSE_CODE;
    else process.env.FINDER_OTP_EXPOSE_CODE = previousExposeCode;
  });
  const finder = await finderSessions.create("198.51.100.21");
  const challenge = await finderVerification.send(finder.id, "+639172345671");
  assert.ok(challenge.developmentCode);
  await pool.query(
    "UPDATE finder_otp_challenges SET attempts = 4 WHERE id = ?",
    [challenge.challengeId],
  );
  const wrong = challenge.developmentCode === "000000" ? "999999" : "000000";
  const results = await Promise.allSettled(
    Array.from({ length: 4 }, () =>
      finderVerification.verify(finder.id, challenge.challengeId, wrong),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 0);
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT attempts FROM finder_otp_challenges WHERE id = ?",
    [challenge.challengeId],
  );
  assert.equal(Number(rows[0].attempts), 5);
  const second = await finderSessions.create("198.51.100.22");
  const good = await finderVerification.send(second.id, "+639172345672");
  const consumed = await Promise.allSettled([
    finderVerification.verify(
      second.id,
      good.challengeId,
      good.developmentCode,
    ),
    finderVerification.verify(
      second.id,
      good.challengeId,
      good.developmentCode,
    ),
  ]);
  assert.equal(consumed.filter((r) => r.status === "fulfilled").length, 1);
  const [verified] = await pool.query<RowDataPacket[]>(
    "SELECT phone_verified_at FROM finder_sessions WHERE id = ?",
    [second.id],
  );
  assert.ok(verified[0].phone_verified_at);
});

test("provider 503 retries durable push delivery after a restart without duplicating the inbox", async (t) => {
  const owner = await auditOwner("push-retry");
  const pushes = new Notifications(pool);
  await pushes.registerDevice(owner.uid, {
    expoPushToken: "ExpoPushToken[audit-retry]",
    platform: "android",
  });
  await scheduledNotifications.schedule({
    userId: owner.uid,
    type: "HEALTH_REMINDER_DUE",
    title: "Due",
    body: "Due reminder",
    scheduledAt: new Date(Date.now() - 1000),
    dedupeKey: "audit-push-retry",
  });
  assert.deepEqual(await scheduledNotifications.processDue(), {
    sent: 1,
    failed: 0,
  });
  const [inbox] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM notifications WHERE user_id = ?",
    [owner.uid],
  );
  assert.equal(inbox.length, 1);
  const failure = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response("", { status: 503 }),
  );
  assert.deepEqual(await pushes.processPushDeliveries(), {
    sent: 0,
    failed: 1,
    cancelled: 0,
  });
  failure.mock.restore();
  const [pending] = await pool.query<RowDataPacket[]>(
    "SELECT status,attempts,last_error FROM push_delivery_jobs",
  );
  assert.equal(pending[0].status, "PENDING");
  assert.equal(Number(pending[0].attempts), 1);
  assert.equal(pending[0].last_error, "expo-http-503");
  await pushes.notifyUser(
    owner.uid,
    "HEALTH_REMINDER_DUE",
    "Due",
    "Due reminder",
    {},
    inbox[0].id,
  );
  await pool.query(
    "UPDATE push_delivery_jobs SET available_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 SECOND)",
  );
  t.mock.method(
    globalThis,
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ data: [{ status: "ok", id: "audit-receipt" }] }),
        { status: 200 },
      ),
  );
  assert.deepEqual(await new Notifications(pool).processPushDeliveries(), {
    sent: 1,
    failed: 0,
    cancelled: 0,
  });
  const [counts] = await pool.query<RowDataPacket[]>(
    "SELECT (SELECT COUNT(*) FROM notifications) AS inbox, (SELECT COUNT(*) FROM push_delivery_jobs) AS jobs, (SELECT COUNT(*) FROM expo_push_receipts) AS receipts",
  );
  assert.equal(Number(counts[0].inbox), 1);
  assert.equal(Number(counts[0].jobs), 1);
  assert.equal(Number(counts[0].receipts), 1);
});

test("a queued private push is cancelled when its device token changes owner", async (t) => {
  const a = await auditOwner("push-owner-a"),
    b = await auditOwner("push-owner-b");
  const pushes = new Notifications(pool);
  const input = {
    expoPushToken: "ExpoPushToken[audit-shared]",
    platform: "android" as const,
  };
  await pushes.registerDevice(a.uid, input);
  await pushes.notifyUser(
    a.uid,
    "HEALTH_REMINDER_DUE",
    "Private A",
    "Private A",
    {},
  );
  await pushes.registerDevice(b.uid, input);
  const fetcher = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not send");
  });
  assert.deepEqual(await pushes.processPushDeliveries(), {
    sent: 0,
    failed: 0,
    cancelled: 1,
  });
  assert.equal(fetcher.mock.callCount(), 0);
});

test("readiness rejects a missing current outbox migration", async () => {
  assert.equal((await request(app).get("/v1/ready")).status, 200);
  await pool.query(
    "RENAME TABLE push_delivery_jobs TO push_delivery_jobs_audit_hidden",
  );
  try {
    assert.equal((await request(app).get("/v1/ready")).status, 503);
  } finally {
    await pool.query(
      "RENAME TABLE push_delivery_jobs_audit_hidden TO push_delivery_jobs",
    );
  }
});
