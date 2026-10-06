import { spawn, spawnSync } from "node:child_process";
import concurrently from "concurrently";
import net from "node:net";

const tunnel = process.argv.includes("--tunnel");
const warmRecovery = process.argv.includes("--warm-recovery");
const npmCliPath = process.env.npm_execpath;

function run(command, args, options = {}) {
  return spawn(command, args, {
    cwd: process.cwd(),
    env: process.env,
    shell: false,
    windowsHide: false,
    ...options,
  });
}

function runNpm(args, options = {}) {
  if (!npmCliPath) {
    throw new Error(
      "npm CLI path is unavailable. Start PetConnect with `npm run dev` or `npm run dev:tunnel`.",
    );
  }

  return run(process.execPath, [npmCliPath, ...args], options);
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

async function warmRecoveryWeb() {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (shuttingDown || (frontend && frontend.exitCode !== null)) return;
    if (await isListening(8081)) break;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  if (!(await isListening(8081))) {
    console.warn(
      "Pitch demo warning: Expo did not open port 8081, so the recovery web route could not be pre-warmed.",
    );
    return;
  }

  const token = `${"a".repeat(32)}.${"B".repeat(43)}`;
  const recoveryUrl = `http://127.0.0.1:8081/recover?token=${token}`;

  console.log("Preparing the browser recovery flow for the first QR scan...");
  try {
    const response = await fetch(recoveryUrl, {
      headers: {
        accept: "text/html",
        "user-agent": "PetConnect-demo-warmup",
      },
      signal: AbortSignal.timeout(90_000),
    });

    if (!response.ok) {
      console.warn(
        `Pitch demo warning: recovery web warm-up returned HTTP ${response.status}.`,
      );
      return;
    }

    await response.text();
    console.log(
      "Pitch demo ready: Expo Go, API/Auth proxy, and browser recovery are warmed.",
    );
  } catch (error) {
    console.warn(
      `Pitch demo warning: recovery web warm-up failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
  }
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

async function authReady() {
  try {
    const response = await fetch(
      "http://127.0.0.1:9099/emulator/v1/projects/demo-petconnect/config",
      { signal: AbortSignal.timeout(1200) },
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForLocalServices() {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (servicesExitCode !== null) {
      throw new Error(
        "PetConnect local services stopped before development was ready.",
      );
    }
    if ((await authReady()) && (await apiReady())) return;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }
  throw new Error(
    "PetConnect local services did not become ready within 90 seconds.",
  );
}

let services;
let servicesExitCode = null;
let frontend;
let shuttingDown = false;
let requestedExitCode = 0;

function localServicesExited() {
  return (
    !services ||
    services.commands.every(
      (command) => command.exited || command.state === "errored",
    )
  );
}

function maybeExit() {
  if (
    shuttingDown &&
    (!frontend || frontend.exitCode !== null) &&
    localServicesExited()
  ) {
    process.exit(requestedExitCode);
  }
}

function stopLocalServices(signal = "SIGINT") {
  if (!services) return;
  for (const command of services.commands) {
    if (!command.exited) command.kill(signal);
  }
}

function forceStopFrontend() {
  if (!frontend || !frontend.pid) return;

  if (process.platform === "win32") {
    try {
      spawnSync(
        "taskkill",
        ["/PID", String(frontend.pid), "/T", "/F"],
        {
          stdio: "ignore",
          windowsHide: true,
        },
      );
    } catch {
      // Ignore if already terminated
    }
    return;
  }

  try {
    frontend.kill("SIGKILL");
  } catch {
    // Ignore if already terminated
  }
}

function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = exitCode;

  if (process.platform === "win32") {
    // On Windows, child processes spawned by npm (like expo CLI) form a process tree
    // that survives a plain SIGINT to the root npm process. Force-kill the tree immediately.
    forceStopFrontend();
  } else if (frontend && frontend.exitCode === null) {
    frontend.kill("SIGINT");
  }
  stopLocalServices("SIGINT");

  const timer = setTimeout(() => {
    forceStopFrontend();
    stopLocalServices("SIGKILL");
    const exitTimer = setTimeout(() => process.exit(requestedExitCode), 250);
    exitTimer.unref();
  }, 3000);
  timer.unref();

  maybeExit();
}

function serviceExitCode(events, fallback = 1) {
  if (!Array.isArray(events)) return fallback;
  const failure = events.find(
    (event) => !event.killed && event.exitCode !== 0,
  );
  if (!failure) return 0;
  return typeof failure.exitCode === "number" ? failure.exitCode : fallback;
}

function handleServicesExit(code) {
  servicesExitCode = code;
  if (!shuttingDown) {
    console.error(
      `PetConnect local services stopped unexpectedly (exit ${code || 1}).`,
    );
    shutdown(code || 1);
    return;
  }
  maybeExit();
}

function startLocalServices(commands) {
  const running = concurrently(commands, {
    cwd: process.cwd(),
    killOthersOn: ["failure"],
    prefix: "name",
  });

  running.result.then(
    (events) => handleServicesExit(serviceExitCode(events, 0)),
    (events) => handleServicesExit(serviceExitCode(events, 1)),
  );

  return running;
}

async function prepareLocalServices() {
  const apiIsReady = await apiReady();
  const authIsReady = await authReady();
  const commands = [];

  if (!authIsReady) {
    for (const port of [9099, 4000]) {
      if (await isListening(port)) {
        throw new Error(
          `Port ${port} is already in use, but the PetConnect Auth emulator is not ready. Stop the conflicting process and run npm run dev again.`,
        );
      }
    }

    commands.push({
      command: "npm run emulators",
      name: "auth",
    });
  }

  if (!apiIsReady) {
    if (await isListening(3000)) {
      throw new Error(
        "Port 3000 is already in use, but the PetConnect API is not ready. Stop the conflicting process and run npm run dev again.",
      );
    }
    commands.push({ command: "npm --prefix backend/api run dev", name: "api" });
  }

  if (commands.length) {
    services = startLocalServices(commands);
  } else {
    console.log("Reusing the healthy PetConnect API and Auth emulator.");
  }

  await waitForLocalServices();
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));
process.on("exit", () => {
  forceStopFrontend();
});

try {
  console.log("Starting PetConnect API and authentication...");
  await prepareLocalServices();
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
  frontend = runNpm(
    ["--prefix", "frontend", "run", tunnel ? "tunnel" : "start"],
    { stdio: "inherit" },
  );

  frontend.once("exit", (code) => {
    if (!shuttingDown) {
      shutdown(code ?? 0);
    } else {
      maybeExit();
    }
  });

  if (warmRecovery) {
    void warmRecoveryWeb();
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "PetConnect development failed.",
  );
  shutdown(1);
}
