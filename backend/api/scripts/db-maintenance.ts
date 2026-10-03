import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import dotenv from "dotenv";

const apiDir = path.resolve(process.cwd());
const repoRoot = path.resolve(apiDir, "../..");
dotenv.config({ path: path.join(apiDir, ".env") });

const migrationDir = path.join(repoRoot, "sql", "migrations");
const schemaPath = path.join(repoRoot, "sql", "schema.sql");
const defaultBackupRoot = path.join(repoRoot, "backups");

type Migration = {
  filename: string;
  checksum: string;
  sql: string;
};

type AppliedMigration = RowDataPacket & {
  filename: string;
  checksum: string;
  applied_at: Date;
};

type BackupManifest = {
  formatVersion: 1;
  createdAt: string;
  database: string;
  dumpFile: string;
  dumpSha256: string;
  uploadDirectory: string;
  uploadCount: number;
  uploadFiles: { path: string; sha256: string; bytes: number }[];
  migrations: { filename: string; checksum: string }[];
};

function dbName(): string {
  const value = process.env.MYSQL_DATABASE || "petconnect_db";
  if (!/^[A-Za-z0-9_]+$/.test(value)) {
    throw new Error(
      "MYSQL_DATABASE may contain only letters, numbers, and underscores.",
    );
  }
  return value;
}

function sqlConfig(database?: string) {
  return {
    host: process.env.MYSQL_HOST || "127.0.0.1",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    port: Number(process.env.MYSQL_PORT) || 3306,
    ...(database ? { database } : {}),
    multipleStatements: true,
    timezone: "Z",
  } as const;
}

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function migrations(): Migration[] {
  if (!existsSync(migrationDir)) return [];
  return readdirSync(migrationDir)
    .filter((name) => /^\d+_[A-Za-z0-9._-]+\.sql$/.test(name))
    .sort()
    .map((filename) => {
      const fullPath = path.join(migrationDir, filename);
      const sql = readFileSync(fullPath, "utf8");
      return {
        filename,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    });
}

async function ensureHistory(pool: Pool) {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      filename VARCHAR(255) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (filename)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
}

async function applied(pool: Pool): Promise<AppliedMigration[]> {
  await ensureHistory(pool);
  const [rows] = await pool.query<AppliedMigration[]>(
    "SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename",
  );
  return rows;
}

async function tableCount(pool: Pool): Promise<number> {
  const [rows] = await pool.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_type = 'BASE TABLE'
        AND table_name <> 'schema_migrations'`,
    [dbName()],
  );
  return Number(rows[0]?.count || 0);
}

async function withMigrationLock<T>(
  pool: Pool,
  action: () => Promise<T>,
): Promise<T> {
  // Keep the namespaced lock within MySQL's 64-character limit.
  const lockName = createHash("sha256")
    .update(`petconnect:migrate:${dbName()}`)
    .digest("hex");
  const connection = await pool.getConnection();
  try {
    const [lockRows] = await connection.query<
      (RowDataPacket & { acquired: number | null })[]
    >("SELECT GET_LOCK(?, 30) AS acquired", [lockName]);
    if (Number(lockRows[0]?.acquired) !== 1) {
      throw new Error("Could not acquire the PetConnect migration lock.");
    }
    return await action();
  } finally {
    await connection
      .query("SELECT RELEASE_LOCK(?)", [lockName])
      .catch(() => {});
    connection.release();
  }
}

function compareMigrations(
  known: Migration[],
  history: AppliedMigration[],
): {
  pending: Migration[];
  drift: string[];
  unknownApplied: string[];
} {
  const byName = new Map(history.map((row) => [row.filename, row]));
  const pending: Migration[] = [];
  const drift: string[] = [];
  for (const migration of known) {
    const row = byName.get(migration.filename);
    if (!row) pending.push(migration);
    else if (row.checksum !== migration.checksum)
      drift.push(migration.filename);
  }
  const knownNames = new Set(known.map((migration) => migration.filename));
  return {
    pending,
    drift,
    unknownApplied: history
      .map((row) => row.filename)
      .filter((name) => !knownNames.has(name)),
  };
}

async function status(pool: Pool, json = false) {
  const known = migrations();
  const history = await applied(pool);
  const comparison = compareMigrations(known, history);
  const result = {
    database: dbName(),
    applied: history.length,
    total: known.length,
    pending: comparison.pending.map((item) => item.filename),
    drift: comparison.drift,
    unknownApplied: comparison.unknownApplied,
  };
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Database: ${result.database}`);
    console.log(`Migrations: ${result.applied}/${result.total} recorded`);
    console.log(
      `Pending: ${result.pending.length ? result.pending.join(", ") : "none"}`,
    );
    console.log(
      `Checksum drift: ${result.drift.length ? result.drift.join(", ") : "none"}`,
    );
    console.log(
      `Unknown history rows: ${result.unknownApplied.length ? result.unknownApplied.join(", ") : "none"}`,
    );
  }
  if (comparison.drift.length || comparison.unknownApplied.length) {
    process.exitCode = 2;
  }
  return result;
}

async function recordBaseline(pool: Pool) {
  const known = migrations();
  const history = await applied(pool);
  if (history.length) {
    throw new Error("Migration history is not empty; baseline is not allowed.");
  }
  for (const migration of known) {
    await pool.query(
      "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
      [migration.filename, migration.checksum],
    );
  }
  console.log(`Baselined ${known.length} migration(s) without executing DDL.`);
}

async function migrate(pool: Pool) {
  await withMigrationLock(pool, async () => {
    const known = migrations();
    const history = await applied(pool);
    const comparison = compareMigrations(known, history);
    if (comparison.drift.length || comparison.unknownApplied.length) {
      throw new Error(
        `Migration history drift detected. Drift: ${comparison.drift.join(", ") || "none"}; unknown: ${comparison.unknownApplied.join(", ") || "none"}.`,
      );
    }
    for (const migration of comparison.pending) {
      console.log(`Applying ${migration.filename}...`);
      await pool.query(migration.sql);
      await pool.query(
        "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
        [migration.filename, migration.checksum],
      );
    }
    console.log(
      comparison.pending.length
        ? `Applied ${comparison.pending.length} migration(s).`
        : "Database is already current.",
    );
  });
}

async function columnExists(
  pool: Pool,
  table: string,
  column: string,
): Promise<boolean> {
  const [rows] = await pool.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.columns
      WHERE table_schema = ? AND table_name = ? AND column_name = ?`,
    [dbName(), table, column],
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function tableExists(pool: Pool, table: string): Promise<boolean> {
  const [rows] = await pool.query<(RowDataPacket & { count: number })[]>(
    `SELECT COUNT(*) AS count
       FROM information_schema.tables
      WHERE table_schema = ? AND table_name = ? AND table_type = 'BASE TABLE'`,
    [dbName(), table],
  );
  return Number(rows[0]?.count || 0) > 0;
}

async function inferLegacyBaseline(pool: Pool): Promise<boolean> {
  const previousReleaseShape =
    (await tableExists(pool, "pet_recovery_tokens")) &&
    (await tableExists(pool, "lost_reports")) &&
    (await tableExists(pool, "health_reminders")) &&
    (await tableExists(pool, "scheduled_notifications")) &&
    (await columnExists(pool, "pets", "age_label")) &&
    (await columnExists(pool, "appointments", "reminder_minutes_before")) &&
    (await columnExists(pool, "health_records", "next_due_at"));

  if (!previousReleaseShape) return false;

  const known = migrations();
  const privacyAlreadyPresent = await columnExists(
    pool,
    "users",
    "share_recovery_phone",
  );
  // Only migrations represented by this explicitly recognized legacy shape
  // can be baselined. Later migrations must execute even on old installations.
  const legacyFiles = new Set([
    "20260928_pet_profile_fields.sql",
    "20260929_health_clinic_ecosystem.sql",
    "20260929_pet_recovery_tokens.sql",
    "20260929_recovery_network.sql",
    "20260929_release_hardening.sql",
  ]);
  const legacyMigrations = known.filter((item) =>
    legacyFiles.has(item.filename),
  );
  const baseline = privacyAlreadyPresent
    ? legacyMigrations
    : legacyMigrations.filter(
        (item) => item.filename !== "20260929_release_hardening.sql",
      );

  for (const migration of baseline) {
    await pool.query(
      "INSERT INTO schema_migrations (filename, checksum) VALUES (?, ?)",
      [migration.filename, migration.checksum],
    );
  }
  console.log(
    `Detected a compatible pre-history PetConnect database and baselined ${baseline.length} migration(s).`,
  );
  return true;
}

async function bootstrap() {
  const database = dbName();
  const admin = mysql.createPool(sqlConfig());
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${database}\`
       CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
  } finally {
    await admin.end();
  }

  const pool = mysql.createPool(sqlConfig(database));
  try {
    await ensureHistory(pool);
    const count = await tableCount(pool);
    const history = await applied(pool);
    if (count === 0) {
      console.log("Empty database detected; loading current schema...");
      await pool.query(readFileSync(schemaPath, "utf8"));
      await recordBaseline(pool);
      console.log("Fresh PetConnect database is ready.");
      return;
    }
    if (history.length === 0) {
      if (!(await inferLegacyBaseline(pool))) {
        throw new Error(
          "Existing tables have no recognizable migration history. Create a backup, verify this database already matches the current schema, then run: npm run db:baseline -- --confirm-current-schema",
        );
      }
    }
    await migrate(pool);
  } finally {
    await pool.end();
  }
}

function uploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || path.join(apiDir, "uploads"));
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function backupFiles(
  root: string,
  current = root,
): { path: string; sha256: string; bytes: number }[] {
  if (!existsSync(current)) return [];
  const output: { path: string; sha256: string; bytes: number }[] = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      output.push(...backupFiles(root, fullPath));
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(root, fullPath).replaceAll("\\", "/");
    const bytes = readFileSync(fullPath);
    output.push({
      path: relativePath,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.byteLength,
    });
  }
  return output.sort((a, b) => a.path.localeCompare(b.path));
}

function runSqlBinary(
  binary: string,
  args: string[],
  options: { stdoutFile?: string; stdinFile?: string } = {},
) {
  const stdoutFd = options.stdoutFile
    ? openSync(options.stdoutFile, "w")
    : "inherit";
  const stdinFd = options.stdinFile
    ? openSync(options.stdinFile, "r")
    : "ignore";
  const result = spawnSync(binary, args, {
    env: {
      ...process.env,
      MYSQL_PWD: process.env.MYSQL_PASSWORD || "",
    },
    stdio: [stdinFd, stdoutFd, "inherit"],
  });
  if (typeof stdinFd === "number") {
    // The process owns the duplicated descriptor on Windows/Linux; no explicit
    // close is required after spawnSync returns.
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${binary} exited with code ${result.status}.`);
  }
}

async function createBackup(outputRoot?: string): Promise<string> {
  const pool = mysql.createPool(sqlConfig(dbName()));
  let migrationRows: AppliedMigration[] = [];
  try {
    migrationRows = await applied(pool);
  } finally {
    await pool.end();
  }

  const destination = outputRoot
    ? path.resolve(repoRoot, outputRoot)
    : path.join(defaultBackupRoot, timestamp());
  if (existsSync(destination)) {
    throw new Error(`Backup destination already exists: ${destination}`);
  }
  mkdirSync(destination, { recursive: true });

  const dumpFile = path.join(destination, "database.sql");
  const mysqldump = process.env.MYSQLDUMP_BIN || "mysqldump";
  runSqlBinary(
    mysqldump,
    [
      "--host",
      process.env.MYSQL_HOST || "127.0.0.1",
      "--port",
      String(Number(process.env.MYSQL_PORT) || 3306),
      "--user",
      process.env.MYSQL_USER || "root",
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      "--set-gtid-purged=OFF",
      "--no-tablespaces",
      "--default-character-set=utf8mb4",
      "--add-drop-table",
      dbName(),
    ],
    { stdoutFile: dumpFile },
  );

  const sourceUploads = uploadDir();
  const uploadBackup = path.join(destination, "uploads");
  if (existsSync(sourceUploads)) {
    cpSync(sourceUploads, uploadBackup, { recursive: true });
  } else {
    mkdirSync(uploadBackup, { recursive: true });
  }

  const uploadFiles = backupFiles(uploadBackup);
  const manifest: BackupManifest = {
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    database: dbName(),
    dumpFile: "database.sql",
    dumpSha256: sha256File(dumpFile),
    uploadDirectory: "uploads",
    uploadCount: uploadFiles.length,
    uploadFiles,
    migrations: migrationRows.map((row) => ({
      filename: row.filename,
      checksum: row.checksum,
    })),
  };
  writeFileSync(
    path.join(destination, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log(`Backup created: ${destination}`);
  return destination;
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function restoreBackup() {
  const backupArg = argValue("backup");
  const confirmation = argValue("confirm-db");
  if (!backupArg) throw new Error("Pass --backup <backup-directory>.");
  if (confirmation !== dbName()) {
    throw new Error(
      `Refusing restore. Pass --confirm-db ${dbName()} to confirm the target.`,
    );
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_PRODUCTION_RESTORE !== "YES"
  ) {
    throw new Error(
      "Production restore is locked. Set ALLOW_PRODUCTION_RESTORE=YES only for the restore operation.",
    );
  }

  const source = path.resolve(repoRoot, backupArg);
  const manifestPath = path.join(source, "manifest.json");
  const dumpPath = path.join(source, "database.sql");
  if (!existsSync(manifestPath) || !existsSync(dumpPath)) {
    throw new Error("Backup is missing manifest.json or database.sql.");
  }
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf8"),
  ) as BackupManifest;
  if (manifest.formatVersion !== 1) {
    throw new Error("Unsupported backup format.");
  }
  if (manifest.database !== dbName()) {
    throw new Error(
      `Backup database "${manifest.database}" does not match restore target "${dbName()}".`,
    );
  }
  if (sha256File(dumpPath) !== manifest.dumpSha256) {
    throw new Error("Backup database checksum does not match manifest.");
  }

  const targetUploads = uploadDir();
  const sourceUploads = path.join(
    source,
    manifest.uploadDirectory || "uploads",
  );
  if (manifest.uploadCount > 0 && !existsSync(sourceUploads)) {
    throw new Error(
      "Backup manifest expects uploads, but the uploads folder is missing.",
    );
  }
  const actualUploadFiles = backupFiles(sourceUploads);
  if (actualUploadFiles.length !== manifest.uploadFiles.length) {
    throw new Error("Backup upload file count does not match manifest.");
  }
  for (let index = 0; index < manifest.uploadFiles.length; index += 1) {
    const expected = manifest.uploadFiles[index];
    const actual = actualUploadFiles[index];
    if (
      !actual ||
      actual.path !== expected.path ||
      actual.sha256 !== expected.sha256 ||
      actual.bytes !== expected.bytes
    ) {
      throw new Error(
        `Backup upload integrity check failed for ${expected.path}.`,
      );
    }
  }

  if (!process.argv.includes("--skip-safety-backup")) {
    console.log("Creating automatic pre-restore safety backup...");
    await createBackup(
      path.join(defaultBackupRoot, `pre-restore-${timestamp()}`),
    );
  }

  const mysqlBin = process.env.MYSQL_BIN || "mysql";
  runSqlBinary(
    mysqlBin,
    [
      "--host",
      process.env.MYSQL_HOST || "127.0.0.1",
      "--port",
      String(Number(process.env.MYSQL_PORT) || 3306),
      "--user",
      process.env.MYSQL_USER || "root",
      "--default-character-set=utf8mb4",
      dbName(),
    ],
    { stdinFile: dumpPath },
  );

  rmSync(targetUploads, { recursive: true, force: true });
  mkdirSync(targetUploads, { recursive: true });
  if (existsSync(sourceUploads)) {
    cpSync(sourceUploads, targetUploads, { recursive: true });
  }
  console.log(`Restore completed into database ${dbName()}.`);
}

async function main() {
  const command = process.argv[2] || "status";
  if (command === "bootstrap") {
    await bootstrap();
    return;
  }

  const pool = mysql.createPool(sqlConfig(dbName()));
  try {
    if (command === "status") {
      await status(pool, process.argv.includes("--json"));
      return;
    }
    if (command === "migrate") {
      if ((await tableCount(pool)) > 0 && (await applied(pool)).length === 0) {
        throw new Error(
          "Existing database has no migration history. Back it up and baseline it explicitly before migrating.",
        );
      }
      await migrate(pool);
      return;
    }
    if (command === "baseline") {
      if (!process.argv.includes("--confirm-current-schema")) {
        throw new Error(
          "Baseline records migrations without running them. Re-run with --confirm-current-schema only after verifying the existing schema is current.",
        );
      }
      await recordBaseline(pool);
      return;
    }
  } finally {
    await pool.end();
  }

  if (command === "backup") {
    await createBackup(argValue("output"));
    return;
  }
  if (command === "restore") {
    await restoreBackup();
    return;
  }
  throw new Error(
    "Usage: db-maintenance <bootstrap|migrate|status|baseline|backup|restore>",
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
