import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";
import { Accounts } from "./accounts";

async function main() {
  const [action, projectId, actorId, argument] = process.argv.slice(2);
  if (
    !["provision-clinic", "disable"].includes(action) ||
    !projectId ||
    !actorId ||
    !argument
  )
    throw new Error(
      "Usage: operator <provision-clinic|disable> <project-id> <operator-id> <input.json|uid>",
    );
  if (
    ![
      "demo-petconnect",
      "petconnect-8e685",
      "petconnect-staging-4069d",
    ].includes(projectId)
  )
    throw new Error("Unknown target project");
  const emulated = Boolean(
    process.env.FIREBASE_AUTH_EMULATOR_HOST &&
    process.env.FIRESTORE_EMULATOR_HOST,
  );
  if (
    projectId.startsWith("demo-") !== emulated ||
    (!emulated &&
      (process.env.FIREBASE_AUTH_EMULATOR_HOST ||
        process.env.FIRESTORE_EMULATOR_HOST))
  )
    throw new Error("Project and emulator configuration do not match");
  initializeApp({
    projectId,
    ...(!emulated ? { credential: applicationDefault() } : {}),
  });
  const accounts = new Accounts(getAuth(), getFirestore());
  if (action === "provision-clinic")
    await accounts.provisionClinic(
      JSON.parse(readFileSync(argument, "utf8")),
      actorId,
    );
  else await accounts.disable(argument, actorId);
  console.log(`Completed ${action} in ${projectId}.`);
}
main().catch(() => {
  console.error(
    "Operator action failed. Verify inputs, credentials, and account state; retry with the same UID.",
  );
  process.exitCode = 1;
});
