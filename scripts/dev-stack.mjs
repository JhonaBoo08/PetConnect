import { spawn } from "node:child_process";
import net from "node:net";

const tunnel = process.argv.includes("--tunnel");
const shell = process.platform === "win32";

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell,
    windowsHide: false,
    ...options,
  });
}

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
    socket.setTimeout(400);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function apiReady() {
  try {
    const response = await fetch("http://127.0.0.1:3000/v1/ready", {
      signal: AbortSignal.timeout(1200),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForLocalServices(background) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (background.exitCode !== null) {
      throw new Error(
        "PetConnect local services stopped before development was ready.",
      );
    }
    if ((await isListening(9099)) && (await apiReady())) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(
    "PetConnect local services did not become ready within 60 seconds.",
  );
}

const background = run(
  "npx",
  [
    "concurrently",
    "--kill-others-on-fail",
    "--names",
    "auth,api",
    "npm run emulators",
    "npm --prefix backend/api run dev",
  ],
  { stdio: "inherit" },
);

let frontend;
let shuttingDown = false;

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  if (frontend && frontend.exitCode === null) frontend.kill("SIGINT");
  if (background.exitCode === null) background.kill("SIGINT");

  const timer = setTimeout(() => {
    if (frontend && frontend.exitCode === null) frontend.kill("SIGTERM");
    if (background.exitCode === null) background.kill("SIGTERM");
    process.exit(exitCode);
  }, 3000);
  timer.unref();

  if (
    (!frontend || frontend.exitCode !== null) &&
    background.exitCode !== null
  ) {
    process.exit(exitCode);
  }
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

background.once("exit", (code) => {
  if (!shuttingDown) {
    console.error(
      `PetConnect local services stopped unexpectedly (exit ${code ?? 1}).`,
    );
    shutdown(code ?? 1);
  } else if (!frontend || frontend.exitCode !== null) {
    process.exit(0);
  }
});

try {
  console.log("Starting PetConnect API and authentication...");
  await waitForLocalServices(background);
  console.log("");
  console.log("API and authentication are ready.");
  console.log(
    tunnel
      ? "Starting Expo in tunnel mode. The QR code will appear below."
      : "Starting Expo. The QR code will appear below.",
  );
  console.log("");

  // Expo gets the real terminal instead of being piped through concurrently.
  // This preserves its QR code and interactive keyboard controls.
  frontend = run(
    "npm",
    ["--prefix", "frontend", "run", tunnel ? "tunnel" : "start"],
    { stdio: "inherit" },
  );

  frontend.once("exit", (code) => {
    if (!shuttingDown) shutdown(code ?? 0);
  });
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "PetConnect development failed.",
  );
  shutdown(1);
}
