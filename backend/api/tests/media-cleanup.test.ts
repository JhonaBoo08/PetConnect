import "dotenv/config";
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import mysql from "mysql2/promise";
import { MediaCleanup } from "../src/media-cleanup.js";
import type { MediaStorage } from "../src/media-storage.js";

test("media cleanup survives restart, retries provider failure, and protects live references", async () => {
  assert.equal(process.env.NODE_ENV, "test");
  assert.match(process.env.MYSQL_DATABASE || "", /_test$/);
  assert.ok(
    ["127.0.0.1", "localhost"].includes(process.env.MYSQL_HOST || "127.0.0.1"),
  );
  const database = "petconnect_media_test_" + randomUUID().replaceAll("-", "");
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
  });
  await connection.query("CREATE DATABASE " + database);
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database,
  });
  const removed: string[] = [];
  let failed = true;
  const storage: MediaStorage = {
    owns: () => true,
    save: async () => {
      throw new Error("unused");
    },
    read: async () => {
      throw new Error("unused");
    },
    remove: async (ref) => {
      if (ref === "retry" && failed) throw new Error("temporary");
      removed.push(ref);
    },
  };
  try {
    await pool.query("CREATE TABLE pets (photo_url VARCHAR(512))");
    await pool.query(
      "CREATE TABLE sighting_evidence (pet_id VARCHAR(64), storage_url VARCHAR(512), status VARCHAR(20))",
    );
    await pool.query(
      readFileSync(
        new URL(
          "../../../sql/migrations/20261004_media_cleanup.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const initial = new MediaCleanup(pool, storage);
    await initial.schedule("orphan");
    await initial.schedule("retry");
    await initial.schedule("current-pet");
    await initial.schedule("private-attached");
    await initial.schedule("in-flight", 24 * 60 * 60);
    await pool.query("INSERT INTO pets VALUES ('current-pet')");
    await pool.query(
      "INSERT INTO sighting_evidence VALUES ('PET-1','private-attached','ATTACHED')",
    );
    const restarted = new MediaCleanup(pool, storage);
    await restarted.drain();
    assert.deepEqual(removed, ["orphan"]);
    const [pending] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT storage_url, attempts FROM media_cleanup_jobs ORDER BY storage_url",
    );
    assert.deepEqual(
      pending.map((row) => row.storage_url),
      ["current-pet", "in-flight", "private-attached", "retry"],
    );
    assert.equal(
      pending.find((row) => row.storage_url === "retry")?.attempts,
      1,
    );
    failed = false;
    await pool.query(
      "UPDATE media_cleanup_jobs SET not_before = UTC_TIMESTAMP() WHERE storage_url = 'retry'",
    );
    await new MediaCleanup(pool, storage).drain();
    assert.deepEqual(removed, ["orphan", "retry"]);
    await restarted.schedulePetEvidence("PET-1");
    await pool.query("DELETE FROM sighting_evidence WHERE pet_id = 'PET-1'");
    await restarted.drain();
    assert.ok(removed.includes("private-attached"));
    assert.ok(!removed.includes("current-pet"));
    assert.ok(!removed.includes("in-flight"));
  } finally {
    await pool.end();
    await connection.query("DROP DATABASE " + database);
    await connection.end();
  }
});
