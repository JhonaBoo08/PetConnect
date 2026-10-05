import "dotenv/config";
import mysql from "mysql2/promise";

import { mysqlConnectionOptions } from "../src/db-config.js";

async function main() {
  const database = process.env.MYSQL_DATABASE || "";
  if (!/^[A-Za-z0-9_]+$/.test(database) || !/(?:_test|_e2e)$/.test(database)) {
    throw new Error(
      "Refusing to reset a non-test database. MYSQL_DATABASE must end in _test or _e2e.",
    );
  }

  const options = mysqlConnectionOptions();
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
