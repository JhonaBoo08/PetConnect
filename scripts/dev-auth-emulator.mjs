import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const require = createRequire(path.join(repoRoot, "package.json"));
const firebaseCli = require.resolve("firebase-tools/lib/bin/firebase.js");

const exportDir = path.join(repoRoot, ".firebase", "emulators");
const exportMetadata = path.join(exportDir, "firebase-export-metadata.json");

const args = [
  firebaseCli,
  "--config",
  "backend/firebase.json",
  "emulators:start",
  "--project",
  "demo-petconnect",
  "--only",
  "auth",
];

if (existsSync(exportMetadata)) {
  args.push("--import=.firebase/emulators");
}

args.push("--export-on-exit=.firebase/emulators");

const child = spawn(process.execPath, args, {
  cwd: repoRoot,
  env: process.env,
  stdio: "inherit",
  windowsHide: false,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (!child.killed) child.kill(signal);
  });
}

child.once("error", (error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "PetConnect Auth emulator could not start.",
  );
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.exitCode = 0;
    return;
  }
  process.exitCode = code ?? 1;
});
