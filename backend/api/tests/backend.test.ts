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
  assert.equal(sessionRes.status, 401);
});

async function createOwnerAuth(label: string, email: string) {
  const auth = client(label);
  const credential = await createUserWithEmailAndPassword(
    auth,
    email,
    "Example-pass-123!",
  );
  const token = await credential.user.getIdToken();
  const initRes = await request(app)
    .post("/v1/account/initialize")
    .set("Authorization", `Bearer ${token}`)
    .send({ displayName: "Pet Owner" });
  assert.equal(initRes.status, 200);
  return { uid: credential.user.uid, token };
}

test("POST /v1/pets requires authentication", async () => {
  const res = await request(app)
    .post("/v1/pets")
    .send({ name: "Buddy", species: "Dog" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthenticated");
});

test("authenticated owner can create a pet and receives the pet fields", async () => {
  const { uid, token } = await createOwnerAuth(
    "pet-create",
    "pet-create@example.test",
  );
  const res = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: " Buddy ", species: " Dog " });
  assert.equal(res.status, 201);
  assert.equal(typeof res.body.id, "string");
  assert.ok(res.body.id.length > 0);
  assert.equal(res.body.ownerId, uid);
  assert.equal(res.body.name, "Buddy");
  assert.equal(res.body.species, "Dog");
  assert.equal(typeof res.body.createdAt, "string");
  assert.equal(typeof res.body.updatedAt, "string");
});

test("POST /v1/pets rejects invalid pet input", async () => {
  const { token } = await createOwnerAuth(
    "pet-invalid",
    "pet-invalid@example.test",
  );
  const post = (body: Record<string, unknown>) =>
    request(app)
      .post("/v1/pets")
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const missingName = await post({ species: "Dog" });
  assert.equal(missingName.status, 400);
  assert.equal(missingName.body.error, "invalid-argument");

  const invalidName = await post({ name: 123, species: "Dog" });
  assert.equal(invalidName.status, 400);

  const blankName = await post({ name: "   ", species: "Dog" });
  assert.equal(blankName.status, 400);

  const missingSpecies = await post({ name: "Buddy" });
  assert.equal(missingSpecies.status, 400);
  assert.equal(missingSpecies.body.error, "invalid-argument");

  const invalidSpecies = await post({ name: "Buddy", species: 42 });
  assert.equal(invalidSpecies.status, 400);

  const unexpectedField = await post({
    name: "Buddy",
    species: "Dog",
    nickname: "Bud",
  });
  assert.equal(unexpectedField.status, 400);
  assert.equal(unexpectedField.body.error, "invalid-argument");
});

test("POST /v1/pets does not honor a client-supplied ownerId", async () => {
  const { uid, token } = await createOwnerAuth(
    "pet-hijack",
    "pet-hijack@example.test",
  );
  const forged = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Buddy", species: "Dog", ownerId: "attacker-chosen-uid" });
  // The unexpected ownerId field is rejected outright.
  assert.equal(forged.status, 400);
  const [stolen] = await pool.query<RowDataPacket[]>(
    "SELECT id FROM pets WHERE owner_id = ?",
    ["attacker-chosen-uid"],
  );
  assert.equal(stolen.length, 0);

  const clean = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Buddy", species: "Dog" });
  assert.equal(clean.status, 201);
  assert.equal(clean.body.ownerId, uid);
});

test("GET /v1/pets requires authentication", async () => {
  const res = await request(app).get("/v1/pets");
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthenticated");
});

test("GET /v1/pets returns only the authenticated owner's pets", async () => {
  const ownerA = await createOwnerAuth("pet-list-a", "pet-list-a@example.test");
  const ownerB = await createOwnerAuth("pet-list-b", "pet-list-b@example.test");

  const firstA = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${ownerA.token}`)
    .send({ name: "Buddy", species: "Dog" });
  assert.equal(firstA.status, 201);
  const secondA = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${ownerA.token}`)
    .send({ name: "Milo", species: "Cat" });
  assert.equal(secondA.status, 201);
  const createdB = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${ownerB.token}`)
    .send({ name: "Rex", species: "Dog" });
  assert.equal(createdB.status, 201);

  const listA = await request(app)
    .get("/v1/pets")
    .set("Authorization", `Bearer ${ownerA.token}`);
  assert.equal(listA.status, 200);
  assert.equal(listA.body.length, 2);
  const namesA = listA.body.map((pet: { name: string }) => pet.name).sort();
  assert.deepEqual(namesA, ["Buddy", "Milo"]);
  for (const pet of listA.body) {
    assert.equal(pet.ownerId, ownerA.uid);
  }

  const listB = await request(app)
    .get("/v1/pets")
    .set("Authorization", `Bearer ${ownerB.token}`);
  assert.equal(listB.status, 200);
  assert.equal(listB.body.length, 1);
  assert.equal(listB.body[0].name, "Rex");
  assert.equal(listB.body[0].ownerId, ownerB.uid);
});

test("PATCH /v1/pets/:petId requires authentication", async () => {
  const res = await request(app)
    .patch("/v1/pets/some-pet-id")
    .send({ name: "Buddy", species: "Dog" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, "unauthenticated");
});

test("authenticated owner can update their own pet", async () => {
  const { uid, token } = await createOwnerAuth(
    "pet-update",
    "pet-update@example.test",
  );
  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Buddy", species: "Dog", birthDate: "2020-01-01" });
  assert.equal(created.status, 201);
  const petId = created.body.id;

  const res = await request(app)
    .patch(`/v1/pets/${petId}`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      name: "Buddy Jr",
      species: "Dog",
      breed: "Beagle",
      birthDate: "2021-02-03",
      photoUrl: "/uploads/x.jpg",
    });
  assert.equal(res.status, 200);
  assert.equal(res.body.id, petId);
  assert.equal(res.body.ownerId, uid);
  assert.equal(res.body.name, "Buddy Jr");
  assert.equal(res.body.species, "Dog");
  assert.equal(res.body.breed, "Beagle");
  assert.equal(res.body.birthDate, "2021-02-03");
  assert.equal(res.body.photoUrl, "/uploads/x.jpg");
  assert.ok(res.body.updatedAt >= created.body.createdAt);

  // Persistence check directly against the database.
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT name, breed, birth_date, photo_url FROM pets WHERE id = ?",
    [petId],
  );
  assert.equal(rows[0].name, "Buddy Jr");
  assert.equal(rows[0].breed, "Beagle");
  assert.equal(String(rows[0].birth_date), "2021-02-03");
  assert.equal(rows[0].photo_url, "/uploads/x.jpg");
});

test("PATCH /v1/pets/:petId rejects invalid and unexpected input", async () => {
  const { token } = await createOwnerAuth(
    "pet-update-invalid",
    "pet-update-invalid@example.test",
  );
  const created = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${token}`)
    .send({ name: "Buddy", species: "Dog" });
  assert.equal(created.status, 201);
  const petId = created.body.id;

  const patch = (body: Record<string, unknown>) =>
    request(app)
      .patch(`/v1/pets/${petId}`)
      .set("Authorization", `Bearer ${token}`)
      .send(body);

  const missingName = await patch({ species: "Dog" });
  assert.equal(missingName.status, 400);
  assert.equal(missingName.body.error, "invalid-argument");

  const missingSpecies = await patch({ name: "Buddy" });
  assert.equal(missingSpecies.status, 400);

  const badDate = await patch({
    name: "Buddy",
    species: "Dog",
    birthDate: "01-01-2020",
  });
  assert.equal(badDate.status, 400);

  const unexpected = await patch({
    name: "Buddy",
    species: "Dog",
    ownerId: "someone-else",
  });
  assert.equal(unexpected.status, 400);
  assert.equal(unexpected.body.error, "invalid-argument");

  // Rejected updates leave the pet unchanged.
  const unchanged = await request(app)
    .get("/v1/pets")
    .set("Authorization", `Bearer ${token}`);
  assert.equal(unchanged.body[0].name, "Buddy");
  assert.equal(unchanged.body[0].breed, undefined);
});

test("owner cannot update another owner's pet", async () => {
  const ownerA = await createOwnerAuth(
    "pet-update-a",
    "pet-update-a@example.test",
  );
  const ownerB = await createOwnerAuth(
    "pet-update-b",
    "pet-update-b@example.test",
  );

  const createdB = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${ownerB.token}`)
    .send({ name: "Rex", species: "Dog" });
  assert.equal(createdB.status, 201);
  const rexBid = createdB.body.id;

  const hijack = await request(app)
    .patch(`/v1/pets/${rexBid}`)
    .set("Authorization", `Bearer ${ownerA.token}`)
    .send({ name: "Stolen", species: "Dog" });
  assert.equal(hijack.status, 404);
  assert.equal(hijack.body.error, "not-found");

  // The foreign pet is untouched.
  const listB = await request(app)
    .get("/v1/pets")
    .set("Authorization", `Bearer ${ownerB.token}`);
  assert.equal(listB.body[0].name, "Rex");

  // And owner A's own pet still updates normally afterwards.
  const createdA = await request(app)
    .post("/v1/pets")
    .set("Authorization", `Bearer ${ownerA.token}`)
    .send({ name: "Buddy", species: "Dog" });
  assert.equal(createdA.status, 201);
  const ownUpdate = await request(app)
    .patch(`/v1/pets/${createdA.body.id}`)
    .set("Authorization", `Bearer ${ownerA.token}`)
    .send({ name: "Buddy Jr", species: "Dog" });
  assert.equal(ownUpdate.status, 200);
  assert.equal(ownUpdate.body.name, "Buddy Jr");
});
