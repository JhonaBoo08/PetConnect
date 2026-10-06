import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  writeFileSync,
  symlinkSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const candidates =
  process.platform === "win32"
    ? [
        process.env.MYSQLD_PATH,
        path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "MySQL/MySQL Server 8.0/bin/mysqld.exe",
        ),
        path.join(
          process.env.ProgramFiles || "C:\\Program Files",
          "MySQL/MySQL Server 8.4/bin/mysqld.exe",
        ),
      ]
    : [process.env.MYSQLD_PATH, "mysqld", "/usr/local/mysql/bin/mysqld"];
const mysqld = candidates
  .filter(Boolean)
  .find(
    (binary) =>
      spawnSync(binary, ["--version"], { windowsHide: true }).status === 0,
  );

test(
  "standalone local MySQL stays alive after readiness and stops cleanly with its launcher",
  { skip: !mysqld, timeout: 90000 },
  async (t) => {
    const net = await import("node:net");
    const listener = net.createServer();
    await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
    const port = listener.address().port;
    await new Promise((resolve) => listener.close(resolve));
    mkdirSync(path.join(root, ".petconnect-dev"), { recursive: true });
    const fixture = mkdtempSync(
      path.join(root, ".petconnect-dev/mysql-lifetime-test-"),
    );
    mkdirSync(path.join(fixture, "scripts"), { recursive: true });
    mkdirSync(path.join(fixture, "backend/api"), { recursive: true });
    for (const file of ["dev-mysql.mjs", "dev-mysql-runtime.mjs"]) {
      if (existsSync(path.join(root, "scripts", file)))
        copyFileSync(
          path.join(root, "scripts", file),
          path.join(fixture, "scripts", file),
        );
    }
    symlinkSync(
      path.join(root, "backend/api/node_modules"),
      path.join(fixture, "backend/api/node_modules"),
      process.platform === "win32" ? "junction" : "dir",
    );
    writeFileSync(
      path.join(fixture, "backend/api/.env"),
      [
        "NODE_ENV=development",
        "MYSQL_HOST=127.0.0.1",
        "MYSQL_PORT=" + port,
        "MYSQL_USER=root",
        "MYSQL_PASSWORD=",
        "MYSQL_DATABASE=petconnect_test",
      ].join("\n"),
    );
    const child = spawn(
      process.execPath,
      [path.join(fixture, "scripts/dev-mysql.mjs")],
      {
        env: { ...process.env, MYSQLD_PATH: mysqld },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    const closed = once(child, "close");
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const mysqladmin = path.join(
      path.dirname(mysqld),
      process.platform === "win32" ? "mysqladmin.exe" : "mysqladmin",
    );
    t.after(async () => {
      spawnSync(
        mysqladmin,
        [
          "--protocol=tcp",
          "--host=127.0.0.1",
          "--port=" + port,
          "--user=root",
          "shutdown",
        ],
        { windowsHide: true, timeout: 10000 },
      );
      if (child.exitCode === null && child.signalCode === null) child.kill();
      await closed;
      rmSync(fixture, { recursive: true, force: true });
    });
    const deadline = Date.now() + 60000;
    while (
      !output.includes("is ready") &&
      child.exitCode === null &&
      Date.now() < deadline
    )
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.match(output, /is ready/, output);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(
      child.exitCode,
      null,
      "MySQL launcher exited immediately after readiness; the stack has no database owner.",
    );
    child.send({ type: "shutdown" });
    await closed;
    assert.equal(
      spawnSync(
        mysqladmin,
        [
          "--protocol=tcp",
          "--host=127.0.0.1",
          "--port=" + port,
          "--user=root",
          "ping",
        ],
        { windowsHide: true, timeout: 5000 },
      ).status,
      1,
      "An owned database must stop with the launcher.",
    );
  },
);
