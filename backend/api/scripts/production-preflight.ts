import { constants } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import mysql from "mysql2/promise";

import { assertProductionEnvironment } from "../src/config.js";
import { mysqlConnectionOptions } from "../src/db-config.js";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

async function readableFile(file: string, label: string) {
  const resolved = path.resolve(file);
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error(`${label} must point to a file.`);
  await access(resolved, constants.R_OK);
}

async function writableDirectory(directory: string, label: string) {
  const resolved = path.resolve(directory);
  const info = await stat(resolved);
  if (!info.isDirectory()) {
    throw new Error(`${label} must point to a directory.`);
  }
  await access(resolved, constants.R_OK | constants.W_OK);
}

export async function productionApiPreflight(
  env: NodeJS.ProcessEnv,
  options: { connectivity?: boolean } = {},
) {
  if (env.NODE_ENV !== "production") {
    throw new Error("NODE_ENV must be production for deployment preflight.");
  }

  assertProductionEnvironment(env);

  if (env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
    await readableFile(
      env.GOOGLE_APPLICATION_CREDENTIALS,
      "GOOGLE_APPLICATION_CREDENTIALS",
    );
  }
  if (env.MYSQL_SSL_CA_PATH?.trim()) {
    await readableFile(env.MYSQL_SSL_CA_PATH, "MYSQL_SSL_CA_PATH");
  }

  if ((env.UPLOAD_STORAGE_PROVIDER || "").toLowerCase() === "local") {
    await writableDirectory(env.UPLOAD_DIR!, "UPLOAD_DIR");
  }

  if (options.connectivity) {
    const pool = mysql.createPool(mysqlConnectionOptions(env));
    try {
      await pool.query({ sql: "SELECT 1", timeout: 5000 });
      for (const table of [
        "schema_migrations",
        "users",
        "pets",
        "pet_recovery_tags",
        "media_cleanup_jobs",
      ]) {
        await pool.query({
          sql: `SELECT 1 FROM \`${table}\` LIMIT 0`,
          timeout: 5000,
        });
      }
    } finally {
      await pool.end();
    }
  }
}

async function main() {
  const envFile = option("--env");
  const fileValues = envFile
    ? dotenv.parse(await readFile(path.resolve(envFile), "utf8"))
    : {};
  const env: NodeJS.ProcessEnv = { ...process.env, ...fileValues };
  const connectivity = process.argv.includes("--connectivity");

  await productionApiPreflight(env, { connectivity });

  process.stdout.write(
    `Production API preflight passed${connectivity ? " with database connectivity" : ""}.\n`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(
      `Production API preflight failed: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
