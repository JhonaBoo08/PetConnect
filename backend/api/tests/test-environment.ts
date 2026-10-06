import "dotenv/config";
import { mysqlConnectionOptions } from "../src/db-config.js";
import { assertTestDatabase, assertTestAuth } from "../src/test-safety.js";
// This module must be the first import, before server.ts creates any services.
assertTestDatabase(process.env, mysqlConnectionOptions().database);
assertTestAuth(process.env);

// These guards permit only the dedicated local Auth emulator. Never load live credentials in that process.
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "";
process.env.GOOGLE_APPLICATION_CREDENTIALS = "";
