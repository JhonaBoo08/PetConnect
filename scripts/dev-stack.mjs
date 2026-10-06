import { spawn, spawnSync } from "node:child_process";
import concurrently from "concurrently";
import net from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  publicExpoOrigin,
  verifyDemoServices,
  warmRecoveryBrowser,
  warmPublicExpo,
} from "./demo-readiness.mjs";

const tunnel = process.argv.includes("--tunnel");
const warmRecovery = process.argv.includes("--warm-recovery");
const npmCliPath = process.env.npm_execpath;
const require = createRequire(
  new URL("../backend/api/package.json", import.meta.url),
);
const { parse } = require("dotenv");
Object.assign(process.env, parse(readFileSync("backend/api/.env")));
for (const key of [
  "GOOGLE_APPLICATION_CREDENTIALS",
  "FIREBASE_SERVICE_ACCOUNT_JSON",
])
  delete process.env[key];
if (warmRecovery) {
  Object.assign(process.env, {
    EXPO_PUBLIC_FIREBASE_ENV: "emulator",
    EXPO_PUBLIC_API_BASE_URL: "",
    EXPO_PUBLIC_EMULATOR_HOST: "",
    FINDER_OTP_PROVIDER: "console",
    FINDER_OTP_EXPOSE_CODE: "true",
    // The loopback Expo proxy forwards the tunnel client address for rate limits.
    TRUST_PROXY_HOPS: "1",
    PETCONNECT_DEV_API_PORT: "3000",
    PETCONNECT_DEV_AUTH_PORT: "9099",
  });
  for (const key of [
    "EXPO_TOKEN",
    "EXPO_TUNNEL_SUBDOMAIN",
    "REACT_NATIVE_PACKAGER_HOSTNAME",
    "EXPO_PACKAGER_PROXY_URL",
  ])
    delete process.env[key];
}

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

async function waitForExpoPort() {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    if (shuttingDown || (frontend && frontend.exitCode !== null)) return false;
    if (await isListening(8081)) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return isListening(8081);
}

async function warmExpoGoPlatform(platform) {
  const label = platform === "ios" ? "iOS" : "Android";

  try {
    const manifestResponse = await fetch("http://127.0.0.1:8081", {
      headers: {
        accept: "application/expo+json",
        "expo-platform": platform,
        "user-agent": "PetConnect-demo-warmup",
      },
      signal: AbortSignal.timeout(30_000),
    });

    if (!manifestResponse.ok) {
      console.warn(
        `Pitch demo warning: Expo ${label} manifest warm-up returned HTTP ${manifestResponse.status}.`,
      );
      return false;
    }

    const manifest = await manifestResponse.json();
    const launchUrl = manifest?.launchAsset?.url;
    if (typeof launchUrl !== "string" || !launchUrl) {
      console.warn(
        `Pitch demo warning: Expo ${label} manifest did not include a launch bundle URL.`,
      );
      return false;
    }

    const bundleUrl = new URL(launchUrl);
    bundleUrl.protocol = "http:";
    bundleUrl.hostname = "127.0.0.1";
    bundleUrl.port = "8081";

    const bundleResponse = await fetch(bundleUrl, {
      headers: {
        "expo-platform": platform,
        "user-agent": "PetConnect-demo-warmup",
      },
      signal: AbortSignal.timeout(180_000),
    });

    if (!bundleResponse.ok) {
      console.warn(
        `Pitch demo warning: Expo ${label} bundle warm-up returned HTTP ${bundleResponse.status}.`,
      );
      return false;
    }

    await bundleResponse.arrayBuffer();
    console.log(`Expo Go ${label} bundle is warmed.`);
    return true;
  } catch (error) {
    console.warn(
      `Pitch demo warning: Expo ${label} bundle warm-up failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return false;
  }
}

async function warmExpoGoBundles() {
  console.log(
    "Preparing the Expo Go Android and iOS bundles for judge devices...",
  );

  const androidWarmed = await warmExpoGoPlatform("android");
  const iosWarmed = await warmExpoGoPlatform("ios");
  return androidWarmed && iosWarmed;
}

async function warmRecoveryWeb() {
  if (!(await waitForExpoPort()))
    throw new Error("Expo did not start on port 8081.");
  const deadline = Date.now() + 120_000;
  let origin;
  while (!origin && Date.now() < deadline && !shuttingDown) {
    try {
      const response = await fetch("http://127.0.0.1:8081", {
        headers: {
          accept: "application/expo+json",
          "expo-platform": "android",
        },
        signal: AbortSignal.timeout(5_000),
      });
      origin = publicExpoOrigin(await response.json());
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!origin)
    throw new Error(
      "Expo Tunnel did not publish a public manifest. Check Internet access and rerun npm run demo.",
    );
  if (!(await warmExpoGoBundles()))
    throw new Error("An Expo Go mobile bundle failed to build.");
  console.log(
    "Checking Android/iOS bundles, browser recovery and API/Auth through " +
      origin,
  );
  for (const platform of ["android", "ios"])
    await warmPublicExpo(origin, platform);
  await warmRecoveryBrowser(origin);
  await verifyDemoServices(origin);
  if (shuttingDown) return;
  console.log("Public recovery: " + origin + "/recover");
  console.log(
    "Pitch demo ready: Expo Go Android/iOS bundles, API/Auth proxy, and browser recovery are warmed.",
  );
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
      spawnSync("taskkill", ["/PID", String(frontend.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
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

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = exitCode;
  // Export before Windows tree termination; otherwise MySQL owners would
  // survive while their Auth emulator accounts disappeared on the next launch.
  try {
    if (await authReady()) {
      const response = await fetch("http://127.0.0.1:4400/_admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: path.resolve(".firebase/emulators"),
          initiatedBy: "cli",
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      console.log("Local Auth accounts saved.");
    }
  } catch (error) {
    console.warn(
      "Could not save Auth accounts: " +
        error.message +
        ". Use npm run emulators:save before a forced stop.",
    );
  }

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
  const failure = events.find((event) => !event.killed && event.exitCode !== 0);
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
    void warmRecoveryWeb().catch((error) => {
      console.error("Pitch demo startup failed: " + error.message);
      shutdown(1);
    });
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "PetConnect development failed.",
  );
  shutdown(1);
}
