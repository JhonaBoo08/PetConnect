import "dotenv/config";
import mysql from "mysql2/promise";

import { mysqlConnectionOptions } from "../src/db-config.js";
import { assertTestDatabase } from "../src/test-safety.js";

async function main() {
  const options = mysqlConnectionOptions();
  const database = options.database;
  assertTestDatabase(process.env, database);
  delete options.database;
  const connection = await mysql.createConnection({
    ...options,
    multipleStatements: false,
  });
  try {
    await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await connection.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
