import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { productionWebEnvironment } from "./production-web.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromBackend = createRequire(
  path.join(root, "backend", "api", "package.json"),
);
const dotenv = requireFromBackend("dotenv");

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(name + " requires a value.");
  }
  return value;
}

export function unsafeTrackedPath(file) {
  const normalized = file.replaceAll("\\", "/");
  const base = path.posix.basename(normalized).toLowerCase();

  if (
    normalized.startsWith(".deployment/") ||
    normalized.startsWith("backups/") ||
    normalized.startsWith("uploads/") ||
    normalized.includes("/uploads/")
  ) {
    return true;
  }

  if (/^\.env(?:\.|$)/i.test(base) && !base.endsWith(".example")) {
    return true;
  }

  if (
    /(?:firebase-admin|firebase-adminsdk|service-account).*\.json$/i.test(
      base,
    ) ||
    /\.(?:pem|key|p8|p12|jks)$/i.test(base)
  ) {
    return true;
  }

  return false;
}

export function trackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output.split("\0").filter(Boolean);
  } catch {
    // A packaged release may intentionally omit .git. The deployment assets
    // are still validated; tracked-file leakage can only be checked in a clone.
    return [];
  }
}

export function assertSourceTreeSafe(files = trackedFiles()) {
  const unsafe = files.filter(unsafeTrackedPath);
  if (unsafe.length) {
    throw new Error(
      "Refusing production deployment because secret/private runtime paths are tracked: " +
        unsafe.join(", "),
    );
  }

  for (const file of [
    "deploy/api.env.example",
    "deploy/frontend.env.example",
    "deploy/db-maintenance.env.example",
    "deploy/petconnect.service",
    "deploy/Caddyfile.example",
    "deploy/petconnect-backup.service",
    "deploy/petconnect-backup.timer",
    "deploy/run-backup.sh",
  ]) {
    if (!existsSync(path.join(root, file))) {
      throw new Error("Missing deployment asset: " + file);
    }
  }
}

function readEnv(file) {
  if (!existsSync(file)) {
    throw new Error(
      "Missing environment file: " +
        file +
        ". Copy the matching deploy/*.env.example into an ignored private location.",
    );
  }
  return dotenv.parse(readFileSync(file, "utf8"));
}

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function runBackendPreflight(apiEnv, connectivity) {
  const args = [
    "--prefix",
    "backend/api",
    "run",
    "production:check",
    "--",
    "--env",
    apiEnv,
  ];
  if (connectivity) args.push("--connectivity");
  const result = spawnSync(npmExecutable(), args, {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Production API preflight failed.");
  }
}

export function validateEnvironmentPair(apiValues, frontendValues) {
  productionWebEnvironment(frontendValues);

  if (apiValues.NODE_ENV !== "production") {
    throw new Error("API NODE_ENV must be production.");
  }

  const backendProject = apiValues.FIREBASE_PROJECT_ID?.trim();
  const frontendProject =
    frontendValues.EXPO_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  if (!backendProject || backendProject !== frontendProject) {
    throw new Error(
      "Frontend and backend Firebase project IDs must match in production.",
    );
  }
}

async function main() {
  assertSourceTreeSafe();

  if (process.argv.includes("--source-only")) {
    process.stdout.write("Production source-tree check passed.\n");
    return;
  }

  const apiEnv = path.resolve(
    option("--api-env") ||
      process.env.PETCONNECT_API_ENV_FILE ||
      path.join(root, ".deployment", "production.env"),
  );
  const frontendEnv = path.resolve(
    option("--frontend-env") ||
      process.env.PETCONNECT_FRONTEND_ENV_FILE ||
      path.join(root, ".deployment", "frontend.env"),
  );

  const apiValues = readEnv(apiEnv);
  const frontendValues = readEnv(frontendEnv);
  validateEnvironmentPair(apiValues, frontendValues);
  runBackendPreflight(apiEnv, process.argv.includes("--connectivity"));

  process.stdout.write(
    "Production deployment preflight passed without exposing secret values.\n",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((error) => {
    process.stderr.write(
      "Production deployment preflight failed: " +
        (error instanceof Error ? error.message : String(error)) +
        "\n",
    );
    process.exitCode = 1;
  });
}
