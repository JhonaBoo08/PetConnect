import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const apiDir = path.join(root, "backend", "api");
const schema = readFileSync(path.join(root, "sql", "schema.sql"), "utf8");
const cli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");

function command(database: string, args: string[], uploadDirectory?: string) {
  return spawnSync(
    process.execPath,
    [cli, "scripts/db-maintenance.ts", ...args],
    {
      cwd: apiDir,
      env: {
        ...process.env,
        MYSQL_DATABASE: database,
        ...(uploadDirectory ? { UPLOAD_DIR: uploadDirectory } : {}),
      },
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 2_000_000,
    },
  );
}

function succeeds(result: ReturnType<typeof command>) {
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout || result.error?.message,
  );
}

async function isolatedDatabase(
  action: (connection: Connection, database: string) => Promise<void>,
) {
  assert.match(process.env.MYSQL_DATABASE || "", /(?:_test|_e2e)$/);
  const database =
    "petconnect_migration_test_" + randomUUID().replaceAll("-", "");
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    multipleStatements: true,
  });
  try {
    await connection.query("CREATE DATABASE " + database);
    await connection.changeUser({ database });
    await action(connection, database);
  } finally {
    await connection.query("DROP DATABASE IF EXISTS " + database);
    await connection.end();
  }
}

test("empty bootstrap is repeatable and rejects altered migration history", async () => {
  await isolatedDatabase(async (connection, database) => {
    succeeds(command(database, ["bootstrap"]));
    succeeds(command(database, ["bootstrap"]));
    succeeds(command(database, ["migrate"]));
    const status = command(database, ["status", "--json"]);
    succeeds(status);
    const report = JSON.parse(status.stdout);
    assert.equal(report.applied, report.total);
    assert.deepEqual(report.pending, []);
    assert.deepEqual(report.drift, []);
    await connection.query(
      "UPDATE schema_migrations SET checksum = ? LIMIT 1",
      ["0".repeat(64)],
    );
    const drift = command(database, ["migrate"]);
    assert.equal(drift.status, 1);
    assert.match(drift.stderr, /drift/i);
  });
});

test("legacy bootstrap applies new migrations instead of baselining absent tables", async () => {
  await isolatedDatabase(async (connection, database) => {
    const previousSightings = `CREATE TABLE IF NOT EXISTS sightings (
  id VARCHAR(64) NOT NULL,
  report_id VARCHAR(64) NOT NULL,
  finder_user_id VARCHAR(128) NULL,
  finder_name VARCHAR(80) NULL,
  finder_contact VARCHAR(120) NULL,
  notes TEXT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_m DECIMAL(10,2) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY sightings_report_created_index (report_id, created_at),
  KEY sightings_finder_index (finder_user_id),
  CONSTRAINT sightings_report_fk
    FOREIGN KEY (report_id) REFERENCES lost_reports(id) ON DELETE CASCADE,
  CONSTRAINT sightings_finder_user_fk
    FOREIGN KEY (finder_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;
    const previousSchema = schema
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) =>
        /CREATE TABLE IF NOT EXISTS sightings\b/.test(statement)
          ? previousSightings
          : statement,
      )
      .filter(
        (statement) =>
          !/CREATE TABLE IF NOT EXISTS (?:expo_push_receipts|finder_sessions|finder_otp_challenges|recovery_contact_events|sighting_evidence)\b/.test(
            statement,
          ),
      )
      .join(";\n");
    await connection.query(previousSchema);
    succeeds(command(database, ["bootstrap"]));
    const [tables] = await connection.query<RowDataPacket[]>(
      "SHOW TABLES LIKE 'expo_push_receipts'",
    );
    assert.equal(
      tables.length,
      1,
      "the newly added receipts migration must execute",
    );
    const [finderTables] = await connection.query<RowDataPacket[]>(
      "SHOW TABLES LIKE 'finder_sessions'",
    );
    assert.equal(
      finderTables.length,
      1,
      "the finder recovery migration must execute on a pre-finder database",
    );
    const [finderColumns] = await connection.query<RowDataPacket[]>(
      "SHOW COLUMNS FROM sightings LIKE 'encounter_type'",
    );
    assert.equal(finderColumns.length, 1);
    const status = command(database, ["status", "--json"]);
    succeeds(status);
    assert.deepEqual(JSON.parse(status.stdout).pending, []);
  });
});

test("backup and restore preserve disposable database and photo bytes, and reject corruption", async () => {
  await isolatedDatabase(async (connection, database) => {
    const fixture = mkdtempSync(
      path.join(os.tmpdir(), "petconnect-backup-test-"),
    );
    const uploads = path.join(fixture, "source-uploads");
    const restoredUploads = path.join(fixture, "restored-uploads");
    const backup = path.join(fixture, "backup");
    mkdirSync(uploads);
    const photo = Buffer.from("disposable-photo-fixture");
    writeFileSync(path.join(uploads, "pet.webp"), photo);
    try {
      succeeds(command(database, ["bootstrap"]));
      await connection.query(
        "INSERT INTO users (id, email, display_name, role, status) VALUES ('backup-owner', 'backup@example.test', 'Backup Owner', 'OWNER', 'ACTIVE')",
      );
      succeeds(command(database, ["backup", "--output", backup], uploads));
      await connection.query("DELETE FROM users WHERE id = 'backup-owner'");
      succeeds(
        command(
          database,
          [
            "restore",
            "--backup",
            backup,
            "--confirm-db",
            database,
            "--skip-safety-backup",
          ],
          restoredUploads,
        ),
      );
      const [users] = await connection.query<RowDataPacket[]>(
        "SELECT display_name FROM users WHERE id = 'backup-owner'",
      );
      assert.equal(users[0].display_name, "Backup Owner");
      assert.deepEqual(
        readFileSync(path.join(restoredUploads, "pet.webp")),
        photo,
      );
      writeFileSync(path.join(backup, "uploads", "pet.webp"), "corrupt");
      const corrupted = command(
        database,
        [
          "restore",
          "--backup",
          backup,
          "--confirm-db",
          database,
          "--skip-safety-backup",
        ],
        restoredUploads,
      );
      assert.equal(corrupted.status, 1);
      assert.match(corrupted.stderr, /integrity/i);
      assert.deepEqual(
        readFileSync(path.join(restoredUploads, "pet.webp")),
        photo,
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
});
