import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { createPool } from "./db.js";
import { Accounts } from "./accounts.js";

dotenv.config();

if (getApps().length === 0) {
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || "demo-petconnect",
  });
}

const auth = getAuth();
const pool = createPool();
const accounts = new Accounts(auth, pool);

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(
      "Usage: node lib/operator.js <provision-clinic|disable> [args]",
    );
    process.exit(1);
  }

  try {
    if (command === "provision-clinic") {
      const operatorId = args[2];
      const jsonPath = args[3];
      if (!operatorId || !jsonPath) {
        console.error(
          "Usage: provision-clinic <project-id> <operator-id> <json-path>",
        );
        process.exit(1);
      }
      const raw = fs.readFileSync(path.resolve(jsonPath), "utf8");
      const data = JSON.parse(raw);
      await accounts.provisionClinic(data, operatorId);
      console.log(`Clinic ${data.clinicId} provisioned successfully.`);
    } else if (command === "disable") {
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
