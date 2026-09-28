import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, test } from "node:test";
import { parsePet } from "../functions/src/contracts";
import { Pets } from "../functions/src/pets";

const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);

const {
  initializeApp: adminInitialize,
  deleteApp: adminDelete,
} = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = "demo-petconnect";
const admin = adminInitialize({ projectId }, "pets-tests");
const db = getFirestore(admin);

after(async () => {
  await adminDelete(admin);
});

test("parsePet accepts valid input and trims text", () => {
  const result = parsePet({
    name: "  Buddy  ",
    species: "  Dog  ",
    identifyingDetails: "  Brown collar  ",
  });

  assert.deepEqual(result, {
    name: "Buddy",
    species: "Dog",
    identifyingDetails: "Brown collar",
  });
});

test("parsePet rejects missing required fields", () => {
  assert.throws(
    () =>
      parsePet({
        name: "Buddy",
        species: "Dog",
      }),
    /Identifying details must contain 1–300 characters/,
  );

  assert.throws(
    () =>
      parsePet({
        name: "Buddy",
        identifyingDetails: "Brown collar",
      }),
    /Species must contain 1–50 characters/,
  );

  assert.throws(
    () =>
      parsePet({
        species: "Dog",
        identifyingDetails: "Brown collar",
      }),
    /Pet name must contain 1–80 characters/,
  );
});

test("parsePet rejects unexpected fields", () => {
  assert.throws(
    () =>
      parsePet({
        name: "Buddy",
        species: "Dog",
        identifyingDetails: "Brown collar",
        ownerId: "owner-123",
      }),
    /Unexpected pet field/,
  );
});

test("parsePet rejects values outside the allowed lengths", () => {
  assert.throws(
    () =>
      parsePet({
        name: "A".repeat(81),
        species: "Dog",
        identifyingDetails: "Brown collar",
      }),
    /Pet name must contain 1–80 characters/,
  );

  assert.throws(
    () =>
      parsePet({
        name: "Buddy",
        species: "A".repeat(51),
        identifyingDetails: "Brown collar",
      }),
    /Species must contain 1–50 characters/,
  );

  assert.throws(
    () =>
      parsePet({
        name: "Buddy",
        species: "Dog",
        identifyingDetails: "A".repeat(301),
      }),
    /Identifying details must contain 1–300 characters/,
  );
});

test("Pets.createPet creates a pet document for the owner", async () => {
  const pets = new Pets(db);

  const petId = await pets.createPet("owner-123", {
    name: "  Buddy  ",
    species: "  Dog  ",
    identifyingDetails: "  Brown collar  ",
  });

  const snapshot = await db.doc(`pets/${petId}`).get();

  assert.equal(snapshot.exists, true);
  assert.deepEqual(snapshot.data(), {
    ownerId: "owner-123",
    name: "Buddy",
    species: "Dog",
    identifyingDetails: "Brown collar",
    isLost: false,
    archivedAt: null,
    createdAt: snapshot.data()?.createdAt,
    updatedAt: snapshot.data()?.updatedAt,
  });
});
