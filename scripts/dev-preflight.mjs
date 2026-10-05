import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readFileSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const backendDir = path.join(repoRoot, "backend", "api");
const frontendDir = path.join(repoRoot, "frontend");

function isListening(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    let settled = false;

    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };

    socket.setTimeout(300);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

function fail(message, details = []) {
  console.error("");
  console.error(message);
  for (const detail of details) console.error(detail);
  process.exit(1);
}

function npmCommand(args, cwd = repoRoot, options = {}) {
  const npmCliPath = process.env.npm_execpath;
  if (npmCliPath) {
    return spawnSync(process.execPath, [npmCliPath, ...args], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      ...options,
    });
  }

  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    ...options,
  });
}

function dependenciesMissing(cwd, sentinels) {
  return !sentinels.every((entry) => existsSync(path.join(cwd, entry)));
}

function ensureInstallDiskSpace(groups) {
  if (!groups.some(({ cwd, sentinels }) => dependenciesMissing(cwd, sentinels))) {
    return;
  }

  try {
    const stats = statfsSync(repoRoot);
    const availableBytes = Number(stats.bavail) * Number(stats.bsize);
    const minimumBytes = 2 * 1024 * 1024 * 1024;
    if (availableBytes < minimumBytes) {
      const availableGb = (availableBytes / 1024 ** 3).toFixed(2);
      fail("PetConnect needs more free disk space before first-run dependency installation.", [
        `Available: ${availableGb} GB. Free at least 2 GB, then run npm run dev again.`,
        "No project files or database data were changed by this check.",
      ]);
    }
  } catch {
    // Disk availability checks are advisory when the host filesystem does not
    // expose statfs information. npm will still report any install failure.
  }
}

function installDependencies(label, cwd, sentinels) {
  if (!dependenciesMissing(cwd, sentinels)) return;
  console.log(label + " dependencies are missing. Installing from lockfile...");
  const result = npmCommand(["ci", "--no-audit", "--no-fund"], cwd, {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    fail(label + " dependencies could not be installed.", [
      "Check your internet connection and npm configuration, then run npm run dev again.",
    ]);
  }
}

function ensureFile(target, example) {
  if (existsSync(target)) return false;
  if (!existsSync(example)) {
    fail("Missing tracked template: " + path.relative(repoRoot, example));
  }
  copyFileSync(example, target);
  console.log(
    "Created " + path.relative(repoRoot, target) + " from the tracked template.",
  );
  return true;
}

function setEnvValue(file, key, value) {
  const source = readFileSync(file, "utf8");
  const expression = new RegExp(`^${key}=.*$`, "m");
  const next = expression.test(source)
    ? source.replace(expression, `${key}=${value}`)
    : source.replace(/\s*$/, `\n${key}=${value}\n`);
  writeFileSync(file, next);
}

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

function javaMajor() {
  const result = spawnSync("java", ["-version"], {
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return undefined;
  const output = (result.stdout || "") + "\n" + (result.stderr || "");
  const match = output.match(/version\s+"?(\d+)(?:\.(\d+))?/i);
  if (!match) return undefined;
  const first = Number(match[1]);
  return first === 1 ? Number(match[2]) : first;
}

function validateLocalConfiguration() {
  const backendEnvPath = path.join(backendDir, ".env");
  const frontendEnvPath = path.join(frontendDir, ".env.local");
  const backendEnv = parseEnv(backendEnvPath);
  const frontendEnv = parseEnv(frontendEnvPath);

  if ((backendEnv.NODE_ENV || "development").toLowerCase() === "production") {
    fail("npm run dev refuses to use a production backend configuration.", [
      "Use a local backend/api/.env with NODE_ENV=development.",
    ]);
  }

  const project = backendEnv.FIREBASE_PROJECT_ID || "demo-petconnect";
  const emulatorHost =
    backendEnv.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  if (
    project !== "demo-petconnect" ||
    !["127.0.0.1:9099", "localhost:9099"].includes(emulatorHost)
  ) {
    fail(
      "The local backend Firebase configuration does not match PetConnect development mode.",
      [
        "Set FIREBASE_PROJECT_ID=demo-petconnect",
        "Set FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099",
      ],
    );
  }

  if (
    (frontendEnv.EXPO_PUBLIC_FIREBASE_ENV || "emulator").toLowerCase() !==
    "emulator"
  ) {
    fail(
      "npm run dev refuses to start the frontend against a non-emulator Firebase environment.",
      ["Set EXPO_PUBLIC_FIREBASE_ENV=emulator in frontend/.env.local."],
    );
  }

  if (
    frontendEnv.EXPO_PUBLIC_API_BASE_URL ||
    frontendEnv.EXPO_PUBLIC_EMULATOR_HOST
  ) {
    console.warn(
      "Note: frontend/.env.local contains explicit endpoint overrides. Remove them if a physical device cannot reach those addresses.",
    );
  }

  return backendEnv;
}

async function bootstrapDatabase(
  backendEnv,
  backendEnvPath,
  backendEnvCreated,
) {
  console.log("Checking local MySQL database and migrations...");
  const result = npmCommand(["run", "db:bootstrap"], backendDir, {
    stdio: "inherit",
  });
  if (result.status === 0) return;

  const host = backendEnv.MYSQL_HOST || "127.0.0.1";
  const port = backendEnv.MYSQL_PORT || "3306";
  const user = backendEnv.MYSQL_USER || "root";
  const password = backendEnv.MYSQL_PASSWORD || "";
  const database = backendEnv.MYSQL_DATABASE || "petconnect_db";

  const localHost = ["127.0.0.1", "localhost"].includes(host);
  const untouchedDefault =
    backendEnvCreated &&
    localHost &&
    port === "3306" &&
    user === "root" &&
    password === "" &&
    !backendEnv.MYSQL_SOCKET_PATH;

  if (untouchedDefault) {
    for (const candidate of [3307, 3308]) {
      if (!(await isListening(candidate))) continue;
      console.log(
        `MySQL is not available on 3306. Trying detected local port ${candidate}...`,
      );
      const retry = npmCommand(["run", "db:bootstrap"], backendDir, {
        stdio: "inherit",
        env: { ...process.env, MYSQL_PORT: String(candidate) },
      });
      if (retry.status === 0) {
        setEnvValue(backendEnvPath, "MYSQL_PORT", String(candidate));
        console.log(
          `Updated backend/api/.env to use detected local MySQL port ${candidate}.`,
        );
        return;
      }
    }
  }

  fail("PetConnect could not prepare the local MySQL database.", [
    "Expected MySQL at " +
      host +
      ":" +
      port +
      ' using user "' +
      user +
      '" and database "' +
      database +
      '".',
    "Start MySQL 8 or correct backend/api/.env, then run npm run dev again.",
    "PetConnect will create/update the local database automatically once it can connect.",
  ]);
}

async function prepareProject() {
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 22) {
    fail(
      "PetConnect requires Node.js 22 or newer. Current: " + process.version + ".",
    );
  }

  const dependencyGroups = [
    {
      label: "Root",
      cwd: repoRoot,
      sentinels: [
        "node_modules/concurrently/package.json",
        "node_modules/firebase-tools/package.json",
      ],
    },
    {
      label: "Backend",
      cwd: backendDir,
      sentinels: [
        "node_modules/mysql2/package.json",
        "node_modules/typescript/package.json",
      ],
    },
    {
      label: "Frontend",
      cwd: frontendDir,
      sentinels: [
        "node_modules/expo/package.json",
        "node_modules/react/package.json",
      ],
    },
  ];

  ensureInstallDiskSpace(dependencyGroups);
  for (const group of dependencyGroups) {
    installDependencies(group.label, group.cwd, group.sentinels);
  }

  const backendEnvPath = path.join(backendDir, ".env");
  const backendEnvCreated = ensureFile(
    backendEnvPath,
    path.join(backendDir, ".env.example"),
  );
  ensureFile(
    path.join(frontendDir, ".env.local"),
    path.join(frontendDir, ".env.example"),
  );

  const backendEnv = validateLocalConfiguration();
  const java = javaMajor();
  if (!java || java < 17) {
    fail("PetConnect requires Java 17 or newer for the Firebase Auth emulator.", [
      "Install a JDK 17+ and make sure java -version works, then run npm run dev again.",
    ]);
  }

  await bootstrapDatabase(backendEnv, backendEnvPath, backendEnvCreated);
}

function freePort(port) {
  if (process.platform === "win32") {
    try {
      const netstat = spawnSync("netstat", ["-ano", "-p", "tcp"], {
        encoding: "utf8",
        windowsHide: true,
      });
      if (!netstat.stdout) return;
      const lines = netstat.stdout.split(/\r?\n/);
      const pids = new Set();
      for (const line of lines) {
        if (
          line.includes(`:${port}`) &&
          line.toUpperCase().includes("LISTENING")
        ) {
          const parts = line.trim().split(/\s+/);
          const pid = parts[parts.length - 1];
          if (pid && !isNaN(Number(pid)) && Number(pid) > 0) {
            pids.add(pid);
          }
        }
      }
      for (const pid of pids) {
        spawnSync("taskkill", ["/PID", pid, "/T", "/F"], {
          stdio: "ignore",
          windowsHide: true,
        });
      }
    } catch {
      // Ignore cleanup errors
    }
  } else {
    try {
      spawnSync("sh", ["-c", `lsof -ti tcp:${port} | xargs kill -9`], {
        stdio: "ignore",
      });
    } catch {
      // Ignore cleanup errors
    }
  }
}

await prepareProject();

// Only Expo must be exclusively owned by this invocation. The dev launcher can
// safely reuse a healthy PetConnect API/Auth pair left behind by an interrupted
// terminal session, and it can start whichever backend service is missing.
if (await isListening(8081)) {
  console.log(
    "Port 8081 is in use by a previous Expo session. Automatically freeing port 8081...",
  );
  freePort(8081);

  const start = Date.now();
  while (await isListening(8081)) {
    if (Date.now() - start > 4000) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

if (await isListening(8081)) {
  console.error("");
  console.error(
    "PetConnect development cannot start because the Expo frontend port 8081 could not be released.",
  );
  console.error(
    "Please check running processes and stop any application using port 8081.",
  );
  process.exit(1);
}

console.log("PetConnect frontend port is available.");
