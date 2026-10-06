import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const backendEnvPath = path.join(repoRoot, "backend", "api", ".env");
const managedRoot = path.join(repoRoot, ".petconnect-dev");

function parseEnv(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equals = line.indexOf("=");
    if (equals <= 0) continue;
    const key = line.slice(0, equals).trim();
    let value = line.slice(equals + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function isListening(host, port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
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
  });
  return !result.error && result.status === 0;
}

function findMysqld() {
  const candidates = [];
  if (process.env.MYSQLD_PATH) candidates.push(process.env.MYSQLD_PATH);

  const lookup = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    ["mysqld"],
    { encoding: "utf8", windowsHide: true },
  );
  if (lookup.status === 0 && lookup.stdout) {
    candidates.push(
      ...lookup.stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    );
  }

  if (process.platform === "win32") {
    candidates.push(
      "C:\\Program Files\\MySQL\\MySQL Server 8.4\\bin\\mysqld.exe",
      "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld.exe",
    );
  } else {
    candidates.push("/usr/local/mysql/bin/mysqld", "/opt/homebrew/bin/mysqld");
  }

  return [...new Set(candidates)].find(usableMysqld);
}

function fail(message, detail) {
  console.error(message);
  if (detail) console.error(detail);
  process.exit(1);
}

const env = parseEnv(backendEnvPath);
const host = env.MYSQL_HOST || "127.0.0.1";
const port = Number(env.MYSQL_PORT || 3306);
const user = env.MYSQL_USER || "root";
const password = env.MYSQL_PASSWORD || "";

const localHost = host === "127.0.0.1" || host === "localhost";
const safeManagedConfig =
  localHost &&
  Number.isInteger(port) &&
  port > 0 &&
  port <= 65535 &&
  user === "root" &&
  password === "" &&
  !env.MYSQL_SOCKET_PATH &&
  (env.NODE_ENV || "development").toLowerCase() !== "production";

if (!safeManagedConfig) {
  console.log(
    "Using the configured MySQL service; managed local MySQL is not applicable.",
  );
  process.exit(0);
}

if (await isListening(host, port)) {
  console.log(`Local MySQL is already available at ${host}:${port}.`);
  process.exit(0);
}

const mysqld = findMysqld();
if (!mysqld) {
  console.log(
    "No local mysqld executable was found. PetConnect will use the normal MySQL preflight instructions.",
  );
  process.exit(0);
}

const dataDir = path.join(managedRoot, `mysql-${port}`);
const systemDb = path.join(dataDir, "mysql");
mkdirSync(dataDir, { recursive: true });

if (!existsSync(systemDb)) {
  console.log(`Preparing private PetConnect MySQL data on port ${port}...`);
  const initialized = spawnSync(
    mysqld,
    ["--no-defaults", "--initialize-insecure", `--datadir=${dataDir}`],
    {
      cwd: repoRoot,
      encoding: "utf8",
      windowsHide: true,
    },
  );
  if (initialized.error || initialized.status !== 0) {
    fail(
      "PetConnect could not initialize its private local MySQL data directory.",
      (initialized.stderr || initialized.stdout || initialized.error?.message || "").trim(),
    );
  }
}

console.log(`Starting private PetConnect MySQL at ${host}:${port}...`);
const child = spawn(
  mysqld,
  [
    "--no-defaults",
    `--datadir=${dataDir}`,
    `--port=${port}`,
    "--bind-address=127.0.0.1",
    "--mysqlx=0",
    `--pid-file=${path.join(dataDir, "petconnect.pid")}`,
    `--log-error=${path.join(dataDir, "petconnect-mysql.log")}`,
  ],
  {
    cwd: repoRoot,
    detached: true,
    windowsHide: true,
    stdio: "ignore",
  },
);
child.unref();

const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  if (await isListening(host, port)) {
    console.log(`Private PetConnect MySQL is ready at ${host}:${port}.`);
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
}

fail(
  "Private PetConnect MySQL did not become ready.",
  `Check ${path.relative(repoRoot, path.join(dataDir, "petconnect-mysql.log"))} for details.`,
);
