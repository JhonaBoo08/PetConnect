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
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from "firebase/functions";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  serverTimestamp,
} from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
import { createRequire } from "node:module";

const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const {
  initializeApp: adminInitialize,
  deleteApp: adminDelete,
} = require("firebase-admin/app");
const { getAuth: adminAuth } = require("firebase-admin/auth");
const { getFirestore: adminFirestore } = require("firebase-admin/firestore");
const { Accounts } = require("../functions/lib/accounts.js");
const projectId = "demo-petconnect";
let env: RulesTestEnvironment;
const apps: ReturnType<typeof initializeApp>[] = [];
const admin = adminInitialize({ projectId }, "backend-tests");
const auth = adminAuth(admin);
const db = adminFirestore(admin);
const accounts = new Accounts(auth, db);
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
  return { auth: a, functions: f };
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
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: readFileSync(
        new URL("../firebase/storage.rules", import.meta.url),
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

test("owner callable initializes once, refreshes claims and returns session", async () => {
  const c = client("owner");
  const { user } = await createUserWithEmailAndPassword(
    c.auth,
    "owner@example.test",
    "Example-pass-123!",
  );
  const initialize = httpsCallable(c.functions, "initializeOwnerProfile");
  await assert.rejects(initialize({ displayName: "Owner", role: "CLINIC" }), {
    code: "functions/invalid-argument",
  });
  await initialize({ displayName: " Owner ", phone: "123" });
  await user.getIdToken(true);
  const session = await httpsCallable(c.functions, "getSession")();
  assert.equal((session.data as { role: string }).role, "OWNER");
  const original = (await db.doc(`users/${user.uid}`).get()).data();
  await initialize({ displayName: "Do not overwrite" });
  const retry = (await db.doc(`users/${user.uid}`).get()).data();
  assert.equal(retry.displayName, "Owner");
  assert.equal(retry.createdAt.toMillis(), original.createdAt.toMillis());
  assert.equal(
    (await db.collection("auditLogs").where("entityId", "==", user.uid).get())
      .size,
    1,
  );
});
test("unauthenticated callable access is denied", async () => {
  const c = client("guest");
  await assert.rejects(
    httpsCallable(
      c.functions,
      "initializeOwnerProfile",
    )({ displayName: "Guest" }),
    { code: "functions/unauthenticated" },
  );
  await assert.rejects(httpsCallable(c.functions, "getSession")(), {
    code: "functions/unauthenticated",
  });
});
test("pending owner setup repairs failure after Firestore creation", async () => {
  const user = await auth.createUser({
    email: "pending@example.test",
    password: "Example-pass-123!",
  });
  await db.doc(`users/${user.uid}`).set({
    role: "OWNER",
    status: "PENDING",
    email: user.email,
    displayName: "Preserved",
  });
  await accounts.initializeOwner(user.uid, { displayName: "Retry" });
  assert.equal(
    (await db.doc(`users/${user.uid}`).get()).get("status"),
    "ACTIVE",
  );
  assert.equal((await auth.getUser(user.uid)).customClaims.role, "OWNER");
});
test("rules enforce ownership, immutable authority, timestamps and validation", async () => {
  const now = new Date();
  await db.doc("users/alice").set({
    role: "OWNER",
    status: "ACTIVE",
    email: "alice@example.test",
    displayName: "Alice",
    createdAt: now,
    updatedAt: now,
  });
  const alice = env
    .authenticatedContext("alice", { role: "OWNER" })
    .firestore();
  const bob = env.authenticatedContext("bob", { role: "OWNER" }).firestore();
  await assertSucceeds(getDoc(doc(alice, "users/alice")));
  await assertSucceeds(
    updateDoc(doc(alice, "users/alice"), {
      displayName: "Updated",
      phone: "123",
      updatedAt: serverTimestamp(),
    }),
  );
  await assertFails(getDoc(doc(bob, "users/alice")));
  await assertFails(getDocs(collection(alice, "users")));
  for (const patch of [
    { role: "CLINIC" },
    { status: "DISABLED" },
    { clinicId: "clinic" },
    { email: "other@example.test" },
    { createdAt: new Date(0) },
    { displayName: "   " },
    { phone: 123 },
    { displayName: "x".repeat(81) },
  ]) {
    await assertFails(
      updateDoc(doc(alice, "users/alice"), {
        ...patch,
        updatedAt: serverTimestamp(),
      }),
    );
  }
  await assertFails(
    updateDoc(doc(alice, "users/alice"), {
      displayName: "No timestamp",
      updatedAt: new Date(0),
    }),
  );
  await assertFails(deleteDoc(doc(alice, "users/alice")));
  await assertFails(
    setDoc(doc(bob, "users/bob"), { role: "OWNER", status: "ACTIVE" }),
  );
  await assertFails(
    getDoc(doc(env.authenticatedContext("alice").firestore(), "users/alice")),
  );
});
test("guests, future collections, audit logs and Storage stay denied", async () => {
  for (const context of [
    env.unauthenticatedContext(),
    env.authenticatedContext("alice", { role: "OWNER" }),
  ]) {
    for (const path of [
      "users/private",
      "pets/pet",
      "healthRecords/record",
      "clinics/clinic",
      "auditLogs/event",
    ]) {
      await assertFails(getDoc(doc(context.firestore(), path)));
      await assertFails(
        setDoc(doc(context.firestore(), path), { value: "forged" }),
      );
    }
    await assertFails(
      uploadBytes(
        ref(context.storage(), "pets/photo.jpg"),
        new Uint8Array([1]),
        { contentType: "image/jpeg" },
      ),
    );
    await assertFails(getBytes(ref(context.storage(), "pets/photo.jpg")));
  }
});
test("clinic provisioning rejects malformed input before reserving records", async () => {
  const valid = {
    uid: "invalid-clinic-input",
    email: "invalid-input@example.test",
    clinicId: "invalid-input-clinic",
    name: "Test Clinic",
    address: "Tagum",
  };
  for (const input of [
    null,
    [],
    ...Object.keys(valid).flatMap((key) => [
      { ...valid, [key]: undefined },
      { ...valid, [key]: 123 },
    ]),
  ]) {
    await assert.rejects(
      accounts.provisionClinic(input, "test-operator"),
      /Invalid clinic input/,
    );
  }
  assert.equal((await db.doc(`users/${valid.uid}`).get()).exists, false);
  assert.equal((await db.doc(`clinics/${valid.clinicId}`).get()).exists, false);
  assert.equal((await db.doc("clinics/undefined").get()).exists, false);
});

test("clinic can log in; owner initialization and missing membership fail", async () => {
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
  const c = client("clinic");
  await auth.updateUser("vet-one", { password: "Example-pass-123!" });
  await signInWithEmailAndPassword(
    c.auth,
    "vet@example.test",
    "Example-pass-123!",
  );
  const result = await httpsCallable(c.functions, "getSession")();
  assert.equal((result.data as { role: string }).role, "CLINIC");
  await assert.rejects(
    httpsCallable(
      c.functions,
      "initializeOwnerProfile",
    )({ displayName: "Overwrite" }),
    { code: "functions/permission-denied" },
  );
  const clinicClient = env
    .authenticatedContext("vet-one", { role: "CLINIC", clinicId: "clinic-one" })
    .firestore();
  await assertSucceeds(getDoc(doc(clinicClient, "users/vet-one")));
  await db.doc("clinics/clinic-one").update({ provisionedUserIds: [] });
  await assertFails(getDoc(doc(clinicClient, "users/vet-one")));
  await assert.rejects(httpsCallable(c.functions, "getSession")(), {
    code: "functions/permission-denied",
  });
});
test("disable denies existing tokens, preserves history and cannot be undone by initialization", async () => {
  const c = client("disabled");
  const { user } = await createUserWithEmailAndPassword(
    c.auth,
    "disabled@example.test",
    "Example-pass-123!",
  );
  await accounts.initializeOwner(user.uid, { displayName: "Disabled" });
  await user.getIdToken(true);
  await accounts.disable(user.uid, "test-operator");
  await accounts.disable(user.uid, "test-operator");
  await assert.rejects(httpsCallable(c.functions, "getSession")(), {
    code: "functions/unauthenticated",
  });
  await assert.rejects(
    accounts.initializeOwner(user.uid, { displayName: "Restore" }),
  );
  await assertFails(
    getDoc(
      doc(
        env.authenticatedContext(user.uid, { role: "OWNER" }).firestore(),
        `users/${user.uid}`,
      ),
    ),
  );
  assert.equal(
    (await db.doc(`users/${user.uid}`).get()).get("status"),
    "DISABLED",
  );
  assert.equal((await auth.getUser(user.uid)).disabled, true);
  assert.equal(
    (await db.doc(`auditLogs/account-disabled-${user.uid}`).get()).exists,
    true,
  );
});
