import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function parseEnv(file) {
  if (!existsSync(file)) return {};
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .flatMap((raw) => {
        const line = raw.trim();
        if (!line || line.startsWith("#") || !line.includes("=")) return [];
        const index = line.indexOf("=");
        return [
          [
            line.slice(0, index).trim(),
            line
              .slice(index + 1)
              .trim()
              .replace(/^(['"])(.*)\1$/, "$2"),
          ],
        ];
      }),
  );
}
function isListening(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(350);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}
function usableMysqld(candidate) {
  if (!candidate) return false;
  const result = spawnSync(candidate, ["--version"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10000,
  });
  return (
    !result.error &&
    result.status === 0 &&
    /(?:Ver\s+|mysqld\s+)8\.(?:0|4)\./i.test(result.stdout || "")
  );
}
async function findMysqld(dataDir, env, signal) {
  const record = path.join(dataDir, "petconnect-runtime.json");
  if (existsSync(record)) {
    const saved = JSON.parse(readFileSync(record, "utf8")).binary;
    const candidate = path.resolve(repoRoot, saved);
    if (!usableMysqld(candidate))
      throw new Error(
        "The MySQL binary used by this data directory is unavailable: " +
          candidate +
          ". Restore it; existing data will not be upgraded automatically.",
      );
    return candidate;
  }
  const override = process.env.MYSQLD_PATH || env.MYSQLD_PATH;
  if (override) {
    if (!usableMysqld(override))
      throw new Error(
        "MYSQLD_PATH must point to a working MySQL 8.0 or 8.4 server.",
      );
    return override;
  }
  const candidates = [];
  const lookup = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    ["mysqld"],
    { encoding: "utf8", windowsHide: true },
  );
  if (lookup.status === 0)
    candidates.push(...lookup.stdout.split(/\r?\n/).filter(Boolean));
  if (process.platform === "win32") {
    const programs = process.env.ProgramFiles || "C:\\Program Files";
    candidates.push(
      path.join(programs, "MySQL/MySQL Server 8.0/bin/mysqld.exe"),
      path.join(programs, "MySQL/MySQL Server 8.4/bin/mysqld.exe"),
    );
  } else
    candidates.push("/usr/local/mysql/bin/mysqld", "/opt/homebrew/bin/mysqld");
  if (
    (env.PETCONNECT_MYSQL_RUNTIME || process.env.PETCONNECT_MYSQL_RUNTIME) !==
    "portable"
  ) {
    const installed = [...new Set(candidates)].find(usableMysqld);
    if (installed) return installed;
  }
  const { ensurePortableMysql } = await import("./dev-mysql-runtime.mjs");
  return ensurePortableMysql({ repoRoot, signal });
}

// The stack owns this worker for its entire lifetime. Never detach/unref a
// short-lived preflight child and assume that the database will survive it.
export function startLocalMysql({ configureNew = false, onExit, signal } = {}) {
  return new Promise((resolve, reject) => {
    const worker = spawn(
      process.execPath,
      [
        fileURLToPath(import.meta.url),
        ...(configureNew ? ["--configure-new"] : []),
      ],
      {
        cwd: repoRoot,
        env: process.env,
        windowsHide: true,
        detached: true,
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      },
    );
    worker.stdout.pipe(process.stdout, { end: false });
    worker.stderr.pipe(process.stderr, { end: false });
    let ready = false;
    let stopping = false;
    let settled = false;
    const closed = new Promise((done) =>
      worker.once("close", (code, exitSignal) =>
        done({ code, signal: exitSignal }),
      ),
    );
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };
    const forceStop = () => {
      if (process.platform === "win32")
        spawnSync("taskkill", ["/PID", String(worker.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      else {
        try {
          process.kill(-worker.pid, "SIGKILL");
        } catch {}
      }
    };
    const cancel = () => {
      stopping = true;
      if (worker.connected) worker.send({ type: "shutdown" }, () => {});
      const timer = setTimeout(forceStop, 15000);
      timer.unref();
      void closed.then(() => clearTimeout(timer));
    };
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();
    void closed.then(({ code, signal: exitSignal }) => {
      signal?.removeEventListener("abort", cancel);
      if (!ready)
        fail(
          signal?.aborted
            ? signal.reason
            : new Error(
                "MySQL setup stopped before readiness (exit " +
                  (code ?? exitSignal) +
                  ").",
              ),
        );
    });
    worker.once("error", fail);
    worker.once("exit", (code, signal) => {
      if (ready && !stopping)
        onExit?.(
          new Error(
            "PetConnect MySQL stopped unexpectedly (exit " +
              (code ?? signal) +
              ").",
          ),
        );
    });
    worker.on("message", (message) => {
      if (message?.type !== "ready" || settled || stopping) return;
      settled = true;
      ready = true;
      resolve({
        port: message.port,
        owned: message.owned,
        process: worker,
        closed,
        async stop() {
          if (stopping) return closed;
          stopping = true;
          if (worker.connected) worker.send({ type: "shutdown" }, () => {});
          const timer = setTimeout(() => {
            if (worker.exitCode === null && worker.signalCode === null)
              forceStop();
          }, 15000);
          timer.unref();
          const result = await closed;
          clearTimeout(timer);
          return result;
        },
      });
    });
  });
}

async function runWorker() {
  const envPath = path.join(repoRoot, "backend/api/.env");
  const env = parseEnv(envPath);
  const host = env.MYSQL_HOST || "127.0.0.1";
  let port = Number(env.MYSQL_PORT || 3307);
  if (process.argv.includes("--configure-new")) {
    while (port < 3340 && (await isListening(host, port))) port++;
    if (port >= 3340)
      throw new Error("No free private MySQL port between 3307 and 3339.");
    writeFileSync(
      envPath,
      readFileSync(envPath, "utf8").replace(
        /^MYSQL_PORT=.*$/m,
        "MYSQL_PORT=" + port,
      ),
    );
  }
  if (
    !["127.0.0.1", "localhost"].includes(host) ||
    !Number.isInteger(port) ||
    port <= 0 ||
    port > 65535 ||
    (env.NODE_ENV || "development").toLowerCase() === "production"
  )
    throw new Error(
      "Managed MySQL requires a valid loopback development configuration.",
    );
  const require = createRequire(
    path.join(repoRoot, "backend/api/package.json"),
  );
  const mysql = require("mysql2/promise");
  const credentials = {
    host,
    port,
    user: env.MYSQL_USER || "root",
    password: env.MYSQL_PASSWORD || "",
    connectTimeout: 1500,
    ...(env.MYSQL_SOCKET_PATH ? { socketPath: env.MYSQL_SOCKET_PATH } : {}),
  };
  const dataDir = path.join(repoRoot, ".petconnect-dev", "mysql-" + port);
  const logPath = path.join(dataDir, "petconnect-mysql.log");
  let child;
  let stopping = false;
  const setupAbort = new AbortController();
  const normalize = (value) =>
    path
      .resolve(value)
      .replace(/[\\/]+$/, "")
      .toLowerCase();
  const query = async (sql) => {
    const connection = await mysql.createConnection(credentials);
    try {
      return await connection.query(sql);
    } finally {
      await connection.end().catch(() => {});
    }
  };
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    setupAbort.abort();
    if (child && child.exitCode === null && child.signalCode === null) {
      const deadline = Date.now() + 10000;
      try {
        const [rows] = await query("SELECT @@datadir AS dataDir");
        if (normalize(rows[0].dataDir) !== normalize(dataDir))
          throw new Error(
            "Database data directory changed; refusing to shut down a different server.",
          );
        await query("SHUTDOWN");
      } catch (error) {
        if (
          !["ECONNRESET", "PROTOCOL_CONNECTION_LOST", "ECONNREFUSED"].includes(
            error.code,
          )
        )
          console.warn("MySQL shutdown: " + error.message);
      }
      while (
        child.exitCode === null &&
        child.signalCode === null &&
        Date.now() < deadline
      )
        await new Promise((done) => setTimeout(done, 100));
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    if (process.connected) process.disconnect();
  };
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      void stop();
    });
  process.on("message", (message) => {
    if (message?.type === "shutdown") void stop();
  });
  // A crashed supervisor must not leave a database behind.
  process.once("disconnect", () => {
    void stop();
  });

  if (await isListening(host, port)) {
    const [rows] = await query(
      "SELECT @@datadir AS dataDir, VERSION() AS version",
    );
    if (!/^8\.(0|4)\./.test(rows[0].version))
      throw new Error("PetConnect requires MySQL 8.0 or 8.4.");
    const privateConfig =
      credentials.user === "root" &&
      !credentials.password &&
      !credentials.socketPath &&
      (env.PETCONNECT_MYSQL_RUNTIME || "auto") !== "external";
    if (privateConfig && normalize(rows[0].dataDir) !== normalize(dataDir))
      throw new Error(
        "Configured MySQL port belongs to another data directory. Select the correct local service or a free private port.",
      );
    console.log(
      "Using the healthy local MySQL service at " + host + ":" + port + ".",
    );
    if (stopping) return;
    if (process.connected) process.send({ type: "ready", port, owned: false });
    return;
  }
  if (
    credentials.user !== "root" ||
    credentials.password ||
    credentials.socketPath
  )
    throw new Error(
      "The configured external MySQL service is unavailable. Start it or use the generated private MySQL configuration.",
    );

  const mysqld = await findMysqld(dataDir, env, setupAbort.signal);
  if (stopping) return;
  mkdirSync(path.dirname(dataDir), { recursive: true });
  if (!existsSync(path.join(dataDir, "mysql"))) {
    if (existsSync(dataDir) && readdirSync(dataDir).length)
      throw new Error(
        "The existing MySQL directory is incomplete. Preserve it and choose a new private port; it will not be deleted.",
      );
    const staging = dataDir + ".initializing-" + randomUUID();
    mkdirSync(staging);
    console.log(
      "Preparing private PetConnect MySQL data on port " + port + "...",
    );
    const rootUser =
      process.platform !== "win32" && process.getuid?.() === 0
        ? ["--user=root"]
        : [];
    const initialized = spawnSync(
      mysqld,
      [
        "--no-defaults",
        "--initialize-insecure",
        "--datadir=" + staging,
        ...rootUser,
      ],
      {
        cwd: repoRoot,
        encoding: "utf8",
        windowsHide: true,
        timeout: 120000,
      },
    );
    if (initialized.error || initialized.status !== 0) {
      rmSync(staging, { recursive: true, force: true });
      throw new Error(
        "Private MySQL initialization failed: " +
          (initialized.stderr || initialized.error?.message || "").trim(),
      );
    }
    if (existsSync(dataDir)) rmSync(dataDir); // proven empty above
    renameSync(staging, dataDir);
  }
  writeFileSync(
    path.join(dataDir, "petconnect-runtime.json"),
    JSON.stringify({ binary: path.relative(repoRoot, mysqld) }),
  );
  console.log(
    "Starting private PetConnect MySQL at " + host + ":" + port + "...",
  );
  child = spawn(
    mysqld,
    [
      "--no-defaults",
      "--datadir=" + dataDir,
      "--port=" + port,
      "--bind-address=127.0.0.1",
      "--mysqlx=0",
      "--skip-log-bin",
      "--innodb-buffer-pool-size=64M",
      ...(process.platform === "win32"
        ? []
        : ["--socket=" + path.join(dataDir, "mysql.sock")]),
      ...(process.platform !== "win32" && process.getuid?.() === 0
        ? ["--user=root"]
        : []),
      "--pid-file=" + path.join(dataDir, "petconnect.pid"),
      "--log-error=" + logPath,
    ],
    { cwd: repoRoot, windowsHide: true, stdio: "ignore" },
  );
  let startupError;
  child.once("error", (error) => {
    startupError = error;
  });
  child.once("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        "Private MySQL exited unexpectedly (" +
          (code ?? signal) +
          "). Check " +
          logPath,
      );
      process.exitCode = 1;
      if (process.connected) process.disconnect();
    }
  });
  const deadline = Date.now() + 60000;
  let lastError;
  while (!stopping && Date.now() < deadline) {
    if (startupError || child.exitCode !== null || child.signalCode !== null)
      break;
    try {
      const [rows] = await query("SELECT @@datadir AS dataDir");
      if (stopping) return;
      if (normalize(rows[0].dataDir) !== normalize(dataDir))
        throw new Error("MySQL port belongs to a different data directory.");
      if (child.exitCode !== null || child.signalCode !== null) break;
      console.log(
        "Private PetConnect MySQL is ready at " + host + ":" + port + ".",
      );
      if (process.connected) process.send({ type: "ready", port, owned: true });
      return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  await stop();
  const tail = existsSync(logPath)
    ? readFileSync(logPath, "utf8").split(/\r?\n/).slice(-12).join("\n")
    : "";
  throw new Error(
    "Private MySQL did not become ready: " +
      (startupError || lastError)?.message +
      "\n" +
      tail,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  runWorker().catch((error) => {
    console.error(error.message);
    process.exitCode = error.name === "AbortError" ? 0 : 1;
    if (process.connected) process.disconnect();
  });
}
