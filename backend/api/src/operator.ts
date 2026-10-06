import dotenv from "dotenv";
import {
  initializeApp,
  getApps,
  cert,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createPool } from "./db.js";
import { Accounts } from "./accounts.js";

dotenv.config();

function firebaseServiceAccount(): ServiceAccount | undefined {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.");
  }
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const projectId = args[1]?.trim();

  if (!command || !projectId) {
    console.log(
      "Usage: npm run operator -- disable <project-id> <operator-id> <uid>",
    );
    process.exit(1);
  }

  const configuredProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (configuredProjectId && configuredProjectId !== projectId) {
    throw new Error(
      `Refusing operator action: CLI project "${projectId}" does not match FIREBASE_PROJECT_ID "${configuredProjectId}".`,
    );
  }
  if (getApps().length === 0) {
    const serviceAccount = firebaseServiceAccount();
    initializeApp({
      projectId,
      ...(serviceAccount ? { credential: cert(serviceAccount) } : {}),
    });
  } else if (getApps()[0].options.projectId !== projectId) {
    throw new Error(
      `Refusing operator action: initialized Firebase project "${getApps()[0].options.projectId}" does not match "${projectId}".`,
    );
  }

  const auth = getAuth();
  const pool = createPool();
  const accounts = new Accounts(auth, pool);

  try {
    if (command === "disable") {
      const operatorId = args[2];
      const uid = args[3];
      if (!operatorId || !uid) {
        console.error("Usage: disable <project-id> <operator-id> <uid>");
        process.exit(1);
      }
      await accounts.disable(uid, operatorId);
      console.log(`Account ${uid} disabled successfully.`);
    } else {
      console.error(`Unknown command: ${command}`);
      process.exit(1);
    }
  } catch (err) {
    console.error("Operator command failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
