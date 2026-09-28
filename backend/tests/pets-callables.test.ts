import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { initializeApp, deleteApp } from "firebase/app";
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { createRequire } from "node:module";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";

const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const {
  initializeApp: adminInitialize,
  deleteApp: adminDelete,
} = require("firebase-admin/app");
const { getAuth: adminAuth } = require("firebase-admin/auth");
const { getFirestore: adminFirestore } = require("firebase-admin/firestore");

const projectId = "demo-petconnect";
let env: RulesTestEnvironment;
const apps: ReturnType<typeof initializeApp>[] = [];
const admin = adminInitialize({ projectId }, "pets-callable-tests");
const auth = adminAuth(admin);
const db = adminFirestore(admin);
const petInput = {
  name: "Buddy",
  species: "Dog",
  identifyingDetails: "Brown collar",
};

function client(name: string) {
  const app = initializeApp(
    {
      projectId,
      apiKey: "demo-key",
      authDomain: `${projectId}.firebaseapp.com`,
    },
    name,
  );
  apps.push(app);
  const a = getAuth(app);
  connectAuthEmulator(a, "http://127.0.0.1:9099", { disableWarnings: true });
  const f = getFunctions(app, "asia-southeast1");
  connectFunctionsEmulator(f, "127.0.0.1", 5001);
  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, "127.0.0.1", 8080);
  return { auth: a, functions: f, db: fs };
}

before(async () => {
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST
  )
    throw new Error("Tests require emulators");
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: readFileSync(
        new URL("../firebase/firestore.rules", import.meta.url),
        "utf8",
      ),
    },
  });
  await env.clearFirestore();
});

after(async () => {
  await Promise.all(apps.map(deleteApp));
  await env?.cleanup();
  await adminDelete(admin);
});

async function ownerUser(uid: string, email: string) {
  await auth.createUser({ uid, email, password: "Example-pass-123!" });
  await auth.setCustomUserClaims(uid, { role: "OWNER" });
  await db.doc(`users/${uid}`).set({
    role: "OWNER",
    status: "ACTIVE",
    email,
    displayName: "Owner",
  });
}

async function signIn(name: string, email: string) {
  const c = client(name);
  await signInWithEmailAndPassword(c.auth, email, "Example-pass-123!");
  return c;
}

test("unauthenticated createPet is denied", async () => {
  const c = client("pet-guest");
  await assert.rejects(httpsCallable(c.functions, "createPet")(petInput), {
    code: "functions/unauthenticated",
  });
});

test("active owner creates a pet through the callable", async () => {
  await ownerUser("pet-owner", "pet-owner@example.test");
  const c = await signIn("pet-owner-client", "pet-owner@example.test");
  const result = await httpsCallable(c.functions, "createPet")({
    name: " Buddy ",
    species: " Dog ",
    identifyingDetails: " Brown collar ",
  });
  const petId = (result.data as { petId: string }).petId;
  assert.equal(typeof petId, "string");
  assert.ok(petId.length > 0);
  const pet = (await db.doc(`pets/${petId}`).get()).data();
  assert.equal(pet?.ownerId, "pet-owner");
  assert.equal(pet?.name, "Buddy");
  assert.equal(pet?.species, "Dog");
  assert.equal(pet?.identifyingDetails, "Brown collar");
  assert.equal(pet?.isLost, false);
  assert.ok(pet?.createdAt);
  assert.ok(pet?.updatedAt);
});

test("invalid or forged pet input is rejected before writing", async () => {
  const c = await signIn("pet-invalid-client", "pet-owner@example.test");
  for (const input of [
    "not-an-object",
    { ...petInput, ownerId: "someone-else" },
    { ...petInput, name: "" },
    { ...petInput, species: "A".repeat(51) },
    { ...petInput, identifyingDetails: undefined },
  ]) {
    await assert.rejects(httpsCallable(c.functions, "createPet")(input), {
      code: "functions/invalid-argument",
    });
  }
});

test("inactive and non-owner accounts cannot create pets", async () => {
  await ownerUser("pet-disabled", "pet-disabled@example.test");
  await db.doc("users/pet-disabled").update({ status: "DISABLED" });
  const disabled = await signIn("pet-disabled-client", "pet-disabled@example.test");
  await assert.rejects(
    httpsCallable(disabled.functions, "createPet")(petInput),
    { code: "functions/permission-denied" },
  );

  await auth.createUser({
    uid: "pet-clinic",
    email: "pet-clinic@example.test",
    password: "Example-pass-123!",
  });
  await auth.setCustomUserClaims("pet-clinic", {
    role: "CLINIC",
    clinicId: "clinic-x",
  });
  await db.doc("users/pet-clinic").set({
    role: "CLINIC",
    status: "ACTIVE",
    clinicId: "clinic-x",
    email: "pet-clinic@example.test",
    displayName: "Clinic",
  });
  const clinic = await signIn("pet-clinic-client", "pet-clinic@example.test");
  await assert.rejects(httpsCallable(clinic.functions, "createPet")(petInput), {
    code: "functions/permission-denied",
  });
});

test("rules allow owners to read only their own pets and deny client writes", async () => {
  await db.doc("pets/rule-pet").set({
    ownerId: "pet-owner",
    ...petInput,
    isLost: false,
    archivedAt: null,
  });
  const ownerFs = env
    .authenticatedContext("pet-owner", { role: "OWNER" })
    .firestore();
  await assertSucceeds(getDoc(doc(ownerFs, "pets/rule-pet")));
  const otherFs = env
    .authenticatedContext("pet-other", { role: "OWNER" })
    .firestore();
  await assertFails(getDoc(doc(otherFs, "pets/rule-pet")));
  await assertFails(
    getDoc(doc(env.unauthenticatedContext().firestore(), "pets/rule-pet")),
  );
  await assertFails(setDoc(doc(ownerFs, "pets/client-write"), petInput));
});

test("owner updates their pet through the callable", async () => {
  const c = await signIn("pet-update-client", "pet-owner@example.test");
  const created = await httpsCallable(c.functions, "createPet")({
    name: "Original",
    species: "Dog",
    identifyingDetails: "Original details",
  });
  const petId = (created.data as { petId: string }).petId;
  const before = (await db.doc(`pets/${petId}`).get()).data();

  await httpsCallable(c.functions, "updatePet")({
    petId,
    name: "Edited",
    species: "Cat",
    identifyingDetails: "Edited details",
  });

  const after = (await db.doc(`pets/${petId}`).get()).data();
  assert.equal(after?.name, "Edited");
  assert.equal(after?.species, "Cat");
  assert.equal(after?.identifyingDetails, "Edited details");
  // Ownership, lost flag, and creation time are immutable through updates.
  assert.equal(after?.ownerId, "pet-owner");
  assert.equal(after?.isLost, false);
  assert.equal(after?.createdAt?.toMillis(), before?.createdAt?.toMillis());
  assert.ok(after?.updatedAt?.toMillis() >= before?.updatedAt?.toMillis());
});

test("updatePet enforces ownership and rejects invalid input", async () => {
  const c = await signIn("pet-update-owner", "pet-owner@example.test");
  const own = await httpsCallable(c.functions, "createPet")({
    name: "Guard",
    species: "Dog",
    identifyingDetails: "Guard details",
  });
  const ownId = (own.data as { petId: string }).petId;

  await ownerUser("pet-editor-two", "pet-editor-two@example.test");
  const other = await signIn(
    "pet-editor-client",
    "pet-editor-two@example.test",
  );
  const foreign = await httpsCallable(other.functions, "createPet")({
    name: "Foreign",
    species: "Dog",
    identifyingDetails: "Foreign details",
  });
  const foreignId = (foreign.data as { petId: string }).petId;

  const update = (petId: unknown, input: Record<string, string>) =>
    httpsCallable(c.functions, "updatePet")({ petId, ...input });

  await assert.rejects(
    update(foreignId, {
      name: "Hijack",
      species: "Dog",
      identifyingDetails: "Hijack details",
    }),
    { code: "functions/permission-denied" },
  );
  await assert.rejects(
    update("missing-pet", {
      name: "Ghost",
      species: "Dog",
      identifyingDetails: "Ghost details",
    }),
    { code: "functions/permission-denied" },
  );
  await assert.rejects(
    update("../escape", {
      name: "Escape",
      species: "Dog",
      identifyingDetails: "Escape details",
    }),
    { code: "functions/permission-denied" },
  );
  await assert.rejects(
    update(123, {
      name: "Coerced",
      species: "Dog",
      identifyingDetails: "Coerced details",
    }),
    { code: "functions/invalid-argument" },
  );
  await assert.rejects(
    update(null, {
      name: "Null",
      species: "Dog",
      identifyingDetails: "Null details",
    }),
    { code: "functions/invalid-argument" },
  );
  await assert.rejects(
    update(ownId, {
      name: "",
      species: "Dog",
      identifyingDetails: "Empty name",
    }),
    { code: "functions/invalid-argument" },
  );
  await assert.rejects(
    update(ownId, {
      name: "Buddy",
      species: "Dog",
      identifyingDetails: "Details",
      ownerId: "someone-else",
    }),
    { code: "functions/invalid-argument" },
  );

  await assert.rejects(
    httpsCallable(client("pet-update-guest").functions, "updatePet")({
      petId: ownId,
      name: "Buddy",
      species: "Dog",
      identifyingDetails: "Details",
    }),
    { code: "functions/unauthenticated" },
  );

  const disabled = await signIn(
    "pet-disabled-update",
    "pet-disabled@example.test",
  );
  await assert.rejects(
    httpsCallable(disabled.functions, "updatePet")({
      petId: ownId,
      name: "Buddy",
      species: "Dog",
      identifyingDetails: "Details",
    }),
    { code: "functions/permission-denied" },
  );

  // Archived pets are read-only: updates are denied even by the owner.
  const archived = await httpsCallable(c.functions, "createPet")({
    name: "Frozen",
    species: "Dog",
    identifyingDetails: "Frozen details",
  });
  const archivedId = (archived.data as { petId: string }).petId;
  await httpsCallable(c.functions, "archivePet")({ petId: archivedId });
  await assert.rejects(
    update(archivedId, {
      name: "Thawed",
      species: "Dog",
      identifyingDetails: "Thawed details",
    }),
    { code: "functions/permission-denied" },
  );
  const frozen = (await db.doc(`pets/${archivedId}`).get()).data();
  assert.equal(frozen?.name, "Frozen");
  assert.ok(frozen?.archivedAt);

  // Denied attempts never modify the foreign pet.
  const untouched = (await db.doc(`pets/${foreignId}`).get()).data();
  assert.equal(untouched?.name, "Foreign");
});test("owner archives their pet and retries are idempotent", async () => {
  const c = await signIn("pet-archive-client", "pet-owner@example.test");
  const created = await httpsCallable(c.functions, "createPet")({
    name: "ArchiveTarget",
    species: "Dog",
  identifyingDetails: "Archive details",
  });
  const petId = (created.data as { petId: string }).petId;

  await httpsCallable(c.functions, "archivePet")({ petId });
  const first = (await db.doc(`pets/${petId}`).get()).data();
  assert.ok(first?.archivedAt);

  // Retrying the archive succeeds and does not move the timestamp.
  await httpsCallable(c.functions, "archivePet")({ petId });
  const second = (await db.doc(`pets/${petId}`).get()).data();
  assert.equal(
    second?.archivedAt?.toMillis(),
    first?.archivedAt?.toMillis(),
  );
});

test("archivePet enforces ownership and input", async () => {
  const c = await signIn("pet-archive-owner", "pet-owner@example.test");
  const own = await httpsCallable(c.functions, "createPet")({
    name: "Keeper",
    species: "Dog",
    identifyingDetails: "Keeper details",
  });
  const ownId = (own.data as { petId: string }).petId;

  await ownerUser("pet-archiver-two", "pet-archiver-two@example.test");
  const other = await signIn(
    "pet-archiver-client",
    "pet-archiver-two@example.test",
  );
  const foreign = await httpsCallable(other.functions, "createPet")({
    name: "Foreign",
    species: "Bird",
    identifyingDetails: "Foreign details",
  });
  const foreignId = (foreign.data as { petId: string }).petId;

  const archive = (petId: unknown) =>
    httpsCallable(c.functions, "archivePet")({ petId });

  await assert.rejects(archive(foreignId), {
    code: "functions/permission-denied",
  });
  await assert.rejects(archive("missing-pet"), {
    code: "functions/permission-denied",
  });
  await assert.rejects(archive("../escape"), {
    code: "functions/permission-denied",
  });
  await assert.rejects(httpsCallable(c.functions, "archivePet")({}), {
    code: "functions/invalid-argument",
  });
  await assert.rejects(archive(123), {
    code: "functions/invalid-argument",
  });
  await assert.rejects(
    httpsCallable(client("pet-archive-guest").functions, "archivePet")({
      petId: ownId,
    }),
    { code: "functions/unauthenticated" },
  );
  const disabled = await signIn(
    "pet-disabled-archive",
    "pet-disabled@example.test",
  );
  await assert.rejects(
    httpsCallable(disabled.functions, "archivePet")({ petId: ownId }),
    { code: "functions/permission-denied" },
  );

  // Denied attempts never archive the foreign pet.
  const untouched = (await db.doc(`pets/${foreignId}`).get()).data();
  assert.equal(untouched?.archivedAt, null);
});

test("owner listing query returns only their pets", async () => {
  const c = await signIn("pet-list-client", "pet-owner@example.test");
  await httpsCallable(c.functions, "createPet")({
    name: "Milo",
    species: "Cat",
    identifyingDetails: "Gray tabby",
  });
  await ownerUser("pet-owner-two", "pet-owner-two@example.test");
  const other = await signIn("pet-list-other", "pet-owner-two@example.test");
  await httpsCallable(other.functions, "createPet")({
    name: "Rex",
    species: "Dog",
    identifyingDetails: "White patch",
  });

  const own = await getDocs(
    query(
      collection(c.db, "pets"),
      where("ownerId", "==", "pet-owner"),
      orderBy("createdAt", "desc"),
    ),
  );
  // pet-owner has accumulated pets from the earlier create/update tests.
  assert.ok(own.size >= 2);
  const names = own.docs.map((docSnap) => docSnap.data().name as string);
  assert.ok(names.includes("Milo"));
  for (const docSnap of own.docs)
    assert.equal(docSnap.data().ownerId, "pet-owner");

  // Dashboard shape: active pets only. Every pet archived in earlier tests
  // must be absent once the archivedAt filter is applied.
  const active = await getDocs(
    query(
      collection(c.db, "pets"),
      where("ownerId", "==", "pet-owner"),
      where("archivedAt", "==", null),
      orderBy("createdAt", "desc"),
    ),
  );
  const archivedCount = own.docs.filter(
    (docSnap) => docSnap.data().archivedAt,
  ).length;
  assert.ok(archivedCount >= 1);
  assert.equal(active.size, own.size - archivedCount);

  // Rules are not filters: a query without the ownership constraint is denied
  // outright rather than returning an empty page.
  await assertFails(getDocs(collection(c.db, "pets")));

  // A signed-in owner querying another owner's pets is denied, not filtered.
  await assertFails(
    getDocs(
      query(
        collection(other.db, "pets"),
        where("ownerId", "==", "pet-owner"),
        orderBy("createdAt", "desc"),
      ),
    ),
  );

  const otherOwn = await getDocs(
    query(
      collection(other.db, "pets"),
      where("ownerId", "==", "pet-owner-two"),
      orderBy("createdAt", "desc"),
    ),
  );
  assert.equal(otherOwn.size, 1);

  await assertFails(
    getDocs(
      query(
        collection(env.unauthenticatedContext().firestore(), "pets"),
        where("ownerId", "==", "pet-owner"),
      ),
    ),
  );
});
