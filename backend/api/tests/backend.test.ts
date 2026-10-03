import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { readFileSync } from "node:fs";
import { RowDataPacket } from "mysql2/promise";
import sharp from "sharp";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { app, pool, accounts, scheduledNotifications } from "../src/server.js";
import { Notifications } from "../src/notifications.js";
import { createPool } from "../src/db.js";
import {
  HealthClinic,
  HealthClinicValidationError,
} from "../src/health-clinic.js";

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
  await pool.query("TRUNCATE TABLE scheduled_notifications");
  await pool.query("TRUNCATE TABLE health_reminders");
  await pool.query("TRUNCATE TABLE appointments");
  await pool.query("TRUNCATE TABLE health_records");
  await pool.query("TRUNCATE TABLE notifications");
  await pool.query("TRUNCATE TABLE expo_push_receipts");
  await pool.query("TRUNCATE TABLE push_devices");
  await pool.query("TRUNCATE TABLE sightings");
  await pool.query("TRUNCATE TABLE lost_reports");
  await pool.query("TRUNCATE TABLE pet_recovery_tokens");
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
      ownerId: second.uid,
      id: "attacker-chosen",
    });
  assert.equal(created.status, 201);
  assert.match(created.body.id, /^PC-[A-F0-9-]{36}$/);
  assert.equal(created.body.name, "Bantay");
  assert.equal(created.body.identifyingDetails, "Blue collar");
  assert.equal(created.body.photoUrl, null);

  const id = created.body.id;
  const [rows] = await pool.query<
    (RowDataPacket & { owner_id: string; age_label: string })[]
  >("SELECT owner_id, age_label FROM pets WHERE id = ?", [id]);
  assert.equal(rows[0].owner_id, first.uid);
  assert.equal(rows[0].age_label, "3 years");

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
      ownerId: second.uid,
    });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.name, "Bantay Jr");
  assert.equal(edited.body.sex, "Female");
  assert.equal(edited.body.breed, "");
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
    sharePhoneWithClinics: true,
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

test("invalid vaccination notification times leave no clinical record", async () => {
  await pool.query(
    "INSERT INTO users (id, email, display_name, role, status) VALUES " +
      "('vaccine-owner', 'vaccine-owner@example.test', 'Owner', 'OWNER', 'ACTIVE'), " +
      "('vaccine-vet', 'vaccine-vet@example.test', 'Vet', 'CLINIC', 'ACTIVE')",
  );
  await pool.query(
    "INSERT INTO clinics (id, name, address, status) VALUES ('vaccine-clinic', 'Test Clinic', 'Tagum', 'ACTIVE')",
  );
  await pool.query(
    "INSERT INTO pets (id, owner_id, name, species) VALUES ('vaccine-pet', 'vaccine-owner', 'Mochi', 'Cat')",
  );
  const nextDueAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await pool.query(
    "INSERT INTO appointments (id, pet_id, owner_id, clinic_id, appointment_date, status) VALUES (?, ?, ?, ?, ?, 'REQUESTED')",
    [
      "vaccine-appointment",
      "vaccine-pet",
      "vaccine-owner",
      "vaccine-clinic",
      new Date(nextDueAt),
    ],
  );
  const healthClinic = new HealthClinic(
    pool,
    new Notifications(pool),
    scheduledNotifications,
  );

  for (const notifyAt of [
    "not-a-date",
    new Date(Date.now() + 8 * 86400000).toISOString(),
  ]) {
    await assert.rejects(
      healthClinic.createVaccination(
        "vaccine-clinic",
        "vaccine-vet",
        "vaccine-pet",
        { vaccineName: "Rabies", nextDueAt, notifyAt },
      ),
      HealthClinicValidationError,
    );
    assert.deepEqual(
      await healthClinic.ownerHealthRecords("vaccine-owner"),
      [],
    );
    assert.deepEqual(await healthClinic.ownerReminders("vaccine-owner"), []);
    const [jobs] = await pool.query<RowDataPacket[]>(
      "SELECT id FROM scheduled_notifications WHERE user_id = 'vaccine-owner'",
    );
    assert.equal(jobs.length, 0);
  }

  const saved = await healthClinic.createVaccination(
    "vaccine-clinic",
    "vaccine-vet",
    "vaccine-pet",
    { vaccineName: "Rabies", nextDueAt, notifyAt: nextDueAt },
  );
  assert.equal(saved.recordType, "VACCINATION");
  assert.equal(
    (await healthClinic.ownerHealthRecords("vaccine-owner")).length,
    1,
  );
  assert.equal((await healthClinic.ownerReminders("vaccine-owner")).length, 1);
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

test("health and clinic ecosystem enforces QR scope, vaccination reminders, appointments, and scheduled notifications", async () => {
  const owner = await ownerToken("Health Owner", "health-owner@example.test");
  const ownerHeader = `Bearer ${owner.token}`;

  await request(app)
    .patch("/v1/profile")
    .set("Authorization", ownerHeader)
    .send({ phone: "09179990000" })
    .expect(200);

  const createdPet = await request(app)
    .post("/v1/pets")
    .set("Authorization", ownerHeader)
    .send({
      name: "Mochi",
      species: "Cat",
      breed: "Domestic Shorthair",
      sex: "Female",
      ageLabel: "2 years",
      identifyingDetails: "White paws",
    })
    .expect(201);
  const petId = createdPet.body.id as string;

  const qr = await request(app)
    .get(`/v1/pets/${petId}/recovery`)
    .set("Authorization", ownerHeader)
    .expect(200);
  const token = qr.body.token as string;

  await accounts.provisionClinic(
    {
      uid: "clinic-health-one",
      email: "clinic-health-one@example.test",
      clinicId: "clinic-health-one",
      name: "Tagum Health Clinic",
      address: "Tagum City",
      phone: "084-111-1111",
    },
    "test-operator",
  );
  await accounts.provisionClinic(
    {
      uid: "clinic-health-two",
      email: "clinic-health-two@example.test",
      clinicId: "clinic-health-two",
      name: "Other Clinic",
      address: "Davao City",
    },
    "test-operator",
  );

  const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
  await getAdminAuth().updateUser("clinic-health-one", {
    password: "Example-pass-123!",
  });
  await getAdminAuth().updateUser("clinic-health-two", {
    password: "Example-pass-123!",
  });

  const firstClinicAuth = client("health-clinic-one");
  const firstClinicCredential = await signInWithEmailAndPassword(
    firstClinicAuth,
    "clinic-health-one@example.test",
    "Example-pass-123!",
  );
  const clinicHeader = `Bearer ${await firstClinicCredential.user.getIdToken(true)}`;

  const secondClinicAuth = client("health-clinic-two");
  const secondClinicCredential = await signInWithEmailAndPassword(
    secondClinicAuth,
    "clinic-health-two@example.test",
    "Example-pass-123!",
  );
  const otherClinicHeader = `Bearer ${await secondClinicCredential.user.getIdToken(true)}`;

  const clinics = await request(app)
    .get("/v1/clinics")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(clinics.body.clinics.length, 2);
  assert.equal(
    clinics.body.clinics.some(
      (clinic: { id: string }) => clinic.id === "clinic-health-one",
    ),
    true,
  );

  await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .expect(401);
  await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .set("Authorization", ownerHeader)
    .expect(403);

  const patient = await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .set("Authorization", clinicHeader)
    .expect(200);
  assert.equal(patient.body.pet.name, "Mochi");
  assert.equal(patient.body.owner.displayName, "Health Owner");
  assert.equal(patient.body.owner.phone, "09179990000");
  assert.equal(patient.body.clinicalHistoryGranted, false);
  assert.equal(patient.body.clinicalAccessGranted, false);
  assert.deepEqual(patient.body.recentHealthRecords, []);

  await request(app)
    .get(
      `/v1/clinic/patients/recovery/${encodeURIComponent(token)}/health-records`,
    )
    .set("Authorization", clinicHeader)
    .expect(403);

  await request(app)
    .post(
      `/v1/clinic/patients/recovery/${encodeURIComponent(token)}/health-records`,
    )
    .set("Authorization", clinicHeader)
    .send({
      recordType: "CHECKUP",
      title: "Unauthorized pre-appointment write",
    })
    .expect(403);

  await request(app)
    .patch("/v1/privacy")
    .set("Authorization", ownerHeader)
    .send({ sharePhoneWithClinics: false })
    .expect(200);
  const privatePatient = await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .set("Authorization", clinicHeader)
    .expect(200);
  assert.equal(privatePatient.body.owner.phone, null);

  const appointmentDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  appointmentDate.setUTCHours(9, 0, 0, 0);
  const requested = await request(app)
    .post("/v1/appointments")
    .set("Authorization", ownerHeader)
    .send({
      petId,
      clinicId: "clinic-health-one",
      appointmentDate: appointmentDate.toISOString(),
      reason: "Annual wellness exam",
      reminderMinutesBefore: 1440,
    })
    .expect(201);
  assert.equal(requested.body.status, "REQUESTED");
  const appointmentId = requested.body.id as string;

  const authorizedPatient = await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .set("Authorization", clinicHeader)
    .expect(200);
  assert.equal(authorizedPatient.body.clinicalHistoryGranted, true);
  assert.equal(authorizedPatient.body.clinicalAccessGranted, true);

  const unrelatedClinicPatient = await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .set("Authorization", otherClinicHeader)
    .expect(200);
  assert.equal(unrelatedClinicPatient.body.clinicalHistoryGranted, false);
  assert.equal(unrelatedClinicPatient.body.clinicalAccessGranted, false);

  const clinicNotifications = await request(app)
    .get("/v1/notifications")
    .set("Authorization", clinicHeader)
    .expect(200);
  assert.equal(
    clinicNotifications.body.notifications.some(
      (item: { type: string }) => item.type === "APPOINTMENT_REQUESTED",
    ),
    true,
  );

  const clinicQueue = await request(app)
    .get("/v1/clinic/appointments")
    .set("Authorization", clinicHeader)
    .expect(200);
  assert.equal(clinicQueue.body.appointments[0].id, appointmentId);
  assert.equal(clinicQueue.body.appointments[0].status, "REQUESTED");
  assert.equal(clinicQueue.body.appointments[0].ownerPhone, null);

  await request(app)
    .patch(`/v1/clinic/appointments/${appointmentId}`)
    .set("Authorization", otherClinicHeader)
    .send({ status: "SCHEDULED" })
    .expect(404);

  const confirmed = await request(app)
    .patch(`/v1/clinic/appointments/${appointmentId}`)
    .set("Authorization", clinicHeader)
    .send({ status: "SCHEDULED", reminderMinutesBefore: 1440 })
    .expect(200);
  assert.equal(confirmed.body.status, "SCHEDULED");

  const ownerAppointments = await request(app)
    .get("/v1/appointments")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(ownerAppointments.body.appointments[0].status, "SCHEDULED");

  const appointmentReminders = await request(app)
    .get("/v1/reminders")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(
    appointmentReminders.body.reminders.some(
      (item: { sourceType: string; sourceId: string }) =>
        item.sourceType === "APPOINTMENT" && item.sourceId === appointmentId,
    ),
    true,
  );

  const genericRecord = await request(app)
    .post(
      `/v1/clinic/patients/recovery/${encodeURIComponent(token)}/health-records`,
    )
    .set("Authorization", clinicHeader)
    .send({
      recordType: "CHECKUP",
      title: "Annual wellness exam",
      notes: "Bright, alert, responsive.",
      occurredAt: new Date().toISOString(),
    })
    .expect(201);
  assert.equal(genericRecord.body.recordType, "CHECKUP");

  const nextDueAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  nextDueAt.setUTCHours(9, 0, 0, 0);
  const vaccination = await request(app)
    .post(
      `/v1/clinic/patients/recovery/${encodeURIComponent(token)}/vaccinations`,
    )
    .set("Authorization", clinicHeader)
    .send({
      vaccineName: "Rabies",
      doseNumber: "1",
      lotNumber: "RAB-2026-001",
      notes: "No immediate reaction.",
      administeredAt: new Date().toISOString(),
      nextDueAt: nextDueAt.toISOString(),
    })
    .expect(201);
  assert.equal(vaccination.body.recordType, "VACCINATION");
  assert.equal(vaccination.body.vaccineName, "Rabies");
  assert.equal(vaccination.body.lotNumber, "RAB-2026-001");

  const ownerRecords = await request(app)
    .get("/v1/health-records")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(ownerRecords.body.records.length, 2);
  assert.equal(
    ownerRecords.body.records.some(
      (item: { vaccineName: string | null }) => item.vaccineName === "Rabies",
    ),
    true,
  );

  const publicProfile = await request(app)
    .get(`/v1/recovery/${encodeURIComponent(token)}`)
    .expect(200);
  assert.equal(publicProfile.body.healthRecords, undefined);
  assert.equal(publicProfile.body.vaccinations, undefined);
  assert.equal(publicProfile.body.appointments, undefined);

  const reminders = await request(app)
    .get("/v1/reminders")
    .set("Authorization", ownerHeader)
    .expect(200);
  const vaccineReminder = reminders.body.reminders.find(
    (item: { sourceType: string; sourceId: string }) =>
      item.sourceType === "VACCINATION" &&
      item.sourceId === vaccination.body.id,
  );
  assert.ok(vaccineReminder);
  assert.equal(vaccineReminder.title, "Rabies next dose");

  const manualDue = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const manualReminder = await request(app)
    .post("/v1/reminders")
    .set("Authorization", ownerHeader)
    .send({
      petId,
      title: "Deworming",
      notes: "Routine preventive care.",
      dueAt: manualDue.toISOString(),
    })
    .expect(201);
  assert.equal(manualReminder.body.status, "PENDING");

  const completedManual = await request(app)
    .patch(`/v1/reminders/${manualReminder.body.id}`)
    .set("Authorization", ownerHeader)
    .send({ status: "COMPLETED" })
    .expect(200);
  assert.equal(completedManual.body.status, "COMPLETED");
  assert.ok(completedManual.body.completedAt);

  await request(app)
    .delete(`/v1/reminders/${manualReminder.body.id}`)
    .set("Authorization", ownerHeader)
    .expect(204);

  const [scheduledRows] = await pool.query<
    (RowDataPacket & { id: string; dedupe_key: string; status: string })[]
  >(
    `SELECT id, dedupe_key, status
       FROM scheduled_notifications
      WHERE dedupe_key = ?`,
    [`health-reminder:${vaccineReminder.id}`],
  );
  assert.equal(scheduledRows.length, 1);
  assert.equal(scheduledRows[0].status, "PENDING");

  await pool.query(
    `UPDATE scheduled_notifications
        SET scheduled_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE)
      WHERE id = ?`,
    [scheduledRows[0].id],
  );
  const processed = await scheduledNotifications.processDue();
  assert.equal(processed.sent, 1);
  assert.equal(processed.failed, 0);

  const ownerNotifications = await request(app)
    .get("/v1/notifications")
    .set("Authorization", ownerHeader)
    .expect(200);
  assert.equal(
    ownerNotifications.body.notifications.some(
      (item: { type: string; data: { reminderId?: string } }) =>
        item.type === "HEALTH_REMINDER_DUE" &&
        item.data?.reminderId === vaccineReminder.id,
    ),
    true,
  );

  const completed = await request(app)
    .patch(`/v1/clinic/appointments/${appointmentId}`)
    .set("Authorization", clinicHeader)
    .send({ status: "COMPLETED" })
    .expect(200);
  assert.equal(completed.body.status, "COMPLETED");

  const afterCompletion = await request(app)
    .get("/v1/reminders")
    .set("Authorization", ownerHeader)
    .expect(200);
  const linkedAppointmentReminder = afterCompletion.body.reminders.find(
    (item: { sourceType: string; sourceId: string }) =>
      item.sourceType === "APPOINTMENT" && item.sourceId === appointmentId,
  );
  assert.equal(linkedAppointmentReminder.status, "COMPLETED");

  const rotated = await request(app)
    .post(`/v1/pets/${petId}/recovery/rotate`)
    .set("Authorization", ownerHeader)
    .expect(200);
  const newToken = rotated.body.token as string;
  assert.notEqual(newToken, token);

  await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(token)}`)
    .set("Authorization", clinicHeader)
    .expect(404);
  const rotatedPatient = await request(app)
    .get(`/v1/clinic/patients/recovery/${encodeURIComponent(newToken)}`)
    .set("Authorization", clinicHeader)
    .expect(200);
  assert.equal(rotatedPatient.body.pet.id, petId);
  assert.equal(rotatedPatient.body.clinicalHistoryGranted, true);
  assert.equal(rotatedPatient.body.clinicalAccessGranted, false);
  assert.equal(rotatedPatient.body.recentHealthRecords.length, 2);

  await request(app)
    .get(
      `/v1/clinic/patients/recovery/${encodeURIComponent(newToken)}/health-records`,
    )
    .set("Authorization", clinicHeader)
    .expect(200);

  await request(app)
    .post(
      `/v1/clinic/patients/recovery/${encodeURIComponent(newToken)}/health-records`,
    )
    .set("Authorization", clinicHeader)
    .send({
      recordType: "CHECKUP",
      title: "Post-completion write must require renewed owner authorization",
    })
    .expect(403);
});

test("clinic accounts cannot access owner pet endpoints", async () => {
  await accounts.provisionClinic(
    {
      uid: "clinic-pets",
      email: "clinic-pets@example.test",
      clinicId: "clinic-pets",
      name: "Pets Clinic",
      address: "Tagum",
    },
    "test-operator",
  );
  const { getAuth: getAdminAuth } = await import("firebase-admin/auth");
  await getAdminAuth().updateUser("clinic-pets", {
    password: "Example-pass-123!",
  });
  const auth = client("clinic-pets");
  const credential = await signInWithEmailAndPassword(
    auth,
    "clinic-pets@example.test",
    "Example-pass-123!",
  );
  const header = `Bearer ${await credential.user.getIdToken(true)}`;
  assert.equal(
    (await request(app).get("/v1/pets").set("Authorization", header)).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/v1/pets")
        .set("Authorization", header)
        .send({ name: "Dog", species: "Dog" })
    ).status,
    403,
  );
});
