import { spawn, spawnSync } from "node:child_process";
import { prepareProject, bootstrapDatabase } from "./dev-preflight.mjs";
import { startLocalMysql } from "./dev-mysql.mjs";
import net from "node:net";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  publicExpoOrigin,
  retryDemoStartup,
  verifyDemoServices,
  warmRecoveryBrowser,
  warmPublicExpo,
} from "./demo-readiness.mjs";

const tunnel = process.argv.includes("--tunnel");
const warmRecovery = process.argv.includes("--warm-recovery");
const npmCliPath = process.env.npm_execpath;
function configureEnvironment() {
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

async function waitForExpoPort(child, signal) {
  const deadline = Date.now() + 90_000;

  while (Date.now() < deadline) {
    signal.throwIfAborted();
    if (shuttingDown || child.exitCode !== null || child.signalCode !== null)
      return false;
    if (await isListening(8081)) return true;
    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  return isListening(8081);
}

async function warmExpoGoPlatform(platform, signal) {
  const label = platform === "ios" ? "iOS" : "Android";

  try {
    const manifestResponse = await fetch("http://127.0.0.1:8081", {
      headers: {
        accept: "application/expo+json",
        "expo-platform": platform,
        "user-agent": "PetConnect-demo-warmup",
      },
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
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
      signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
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
    signal.throwIfAborted();
    console.warn(
      `Pitch demo warning: Expo ${label} bundle warm-up failed: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return false;
  }
}

async function warmExpoGoBundles(signal) {
  console.log(
    "Preparing the Expo Go Android and iOS bundles for judge devices...",
  );

  const androidWarmed = await warmExpoGoPlatform("android", signal);
  const iosWarmed = await warmExpoGoPlatform("ios", signal);
  return androidWarmed && iosWarmed;
}

async function warmRecoveryWeb(child, signal) {
  if (!(await waitForExpoPort(child, signal)))
    throw new Error("Expo did not start on port 8081.");
  const deadline = Date.now() + 120_000;
  let origin;
  while (!origin && Date.now() < deadline && !shuttingDown) {
    signal.throwIfAborted();
    try {
      const response = await fetch("http://127.0.0.1:8081", {
        headers: {
          accept: "application/expo+json",
          "expo-platform": "android",
        },
        signal: AbortSignal.any([signal, AbortSignal.timeout(5_000)]),
      });
      origin = publicExpoOrigin(await response.json());
    } catch {
      signal.throwIfAborted();
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  if (!origin)
    throw new Error(
      "Expo Tunnel did not publish a public manifest. Check Internet access and rerun npm run demo.",
    );
  if (!(await warmExpoGoBundles(signal)))
    throw new Error("An Expo Go mobile bundle failed to build.");
  console.log(
    "Checking Android/iOS bundles, browser recovery and API/Auth through " +
      origin,
  );
  for (const platform of ["android", "ios"])
    await warmPublicExpo(origin, platform, signal);
  await warmRecoveryBrowser(origin, signal);
  await verifyDemoServices(origin, signal);
  signal.throwIfAborted();
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

let database;
let databaseStarting = false;
const startupAbort = new AbortController();
let databaseStopped = false;
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
    localServicesExited() &&
    (!database || databaseStopped) &&
    !databaseStarting
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

function forceStopFrontend(child = frontend) {
  if (!child || !child.pid) return;

  if (process.platform === "win32") {
    try {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } catch {
      // Ignore if already terminated
    }
    return;
  }

  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Ignore if already terminated
  }
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedExitCode = exitCode;
  startupAbort.abort(new Error("PetConnect startup was cancelled."));
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
  } else if (
    frontend?.pid &&
    frontend.exitCode === null &&
    frontend.signalCode === null
  ) {
    try {
      process.kill(-frontend.pid, "SIGINT");
    } catch (error) {
      // A cancelled warm-up may already have stopped this owned process group.
      if (error.code !== "ESRCH")
        console.warn("Could not stop Expo: " + error.message);
    }
  }
  stopLocalServices("SIGINT");
  await database?.stop();
  databaseStopped = true;

  const timer = setTimeout(() => {
    forceStopFrontend();
    stopLocalServices("SIGKILL");
    const exitTimer = setTimeout(() => {
      // The pending worker owns a bounded cancellation timer. Keep this parent
      // alive until that worker has closed, including synchronous MySQL setup.
      if (!databaseStarting && (!database || databaseStopped))
        process.exit(requestedExitCode);
    }, 250);
    exitTimer.unref();
  }, 3000);
  timer.unref();

  maybeExit();
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
  const running = { commands: [] };
  for (const spec of commands) {
    const child = runNpm(spec.args, {
      stdio: ["ignore", "pipe", "pipe"],
      // Keep Windows services outside the interactive console's Ctrl+C group
      // so Auth can be exported before terminating the owned process trees.
      detached: process.platform === "win32",
      windowsHide: true,
    });
    const command = {
      exited: false,
      state: "running",
      kill(signal) {
        if (command.exited) return;
        if (process.platform === "win32") {
          spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
            stdio: "ignore",
            windowsHide: true,
          });
        } else child.kill(signal);
      },
    };
    running.commands.push(command);
    for (const stream of [child.stdout, child.stderr]) {
      let pending = "";
      stream.on("data", (chunk) => {
        pending += chunk.toString();
        const lines = pending.split(/\r?\n/);
        pending = lines.pop();
        for (const line of lines) console.log("[" + spec.name + "] " + line);
      });
      stream.on("end", () => {
        if (pending) console.log("[" + spec.name + "] " + pending);
      });
    }
    child.once("error", (error) => {
      command.state = "errored";
      console.error(spec.name + " could not start: " + error.message);
      handleServicesExit(1);
    });
    child.once("close", (code) => {
      command.exited = true;
      command.state = "exited";
      if (!shuttingDown) {
        console.error(spec.name + " stopped unexpectedly.");
        handleServicesExit(code || 1);
      } else maybeExit();
    });
  }
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
      args: ["run", "emulators"],
      name: "auth",
    });
  }

  if (!apiIsReady) {
    if (await isListening(3000)) {
      throw new Error(
        "Port 3000 is already in use, but the PetConnect API is not ready. Stop the conflicting process and run npm run dev again.",
      );
    }
    commands.push({
      args: ["--prefix", "backend/api", "run", "dev"],
      name: "api",
    });
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
  const prepared = await prepareProject();
  if (shuttingDown) throw new Error("PetConnect startup was cancelled.");
  databaseStarting = true;
  try {
    database = await startLocalMysql({
      configureNew: prepared.backendEnvCreated,
      signal: startupAbort.signal,
      onExit(error) {
        console.error(error.message);
        void shutdown(1);
      },
    });
  } finally {
    databaseStarting = false;
    maybeExit();
  }
  if (shuttingDown) {
    await database.stop();
    throw new Error("PetConnect startup was cancelled.");
  }
  configureEnvironment();
  await bootstrapDatabase(process.env);
  console.log(
    "PetConnect prerequisites, database migrations and development ports are ready.",
  );
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

  const startFrontend = () => {
    // Preserve Expo's QR code and interactive keyboard controls.
    frontend = runNpm(
      ["--prefix", "frontend", "run", tunnel ? "tunnel" : "start"],
      { stdio: "inherit", detached: process.platform !== "win32" },
    );
    return frontend;
  };
  if (warmRecovery) {
    await retryDemoStartup(
      async () => {
        const child = startFrontend();
        const closed = new Promise((resolve) => child.once("close", resolve));
        const attemptAbort = new AbortController();
        const signal = AbortSignal.any([
          startupAbort.signal,
          attemptAbort.signal,
        ]);
        let fail;
        const failed = new Promise((_resolve, reject) => {
          fail = reject;
        });
        const onExit = (code, exitSignal) => {
          if (code === 0 || ["SIGINT", "SIGTERM"].includes(exitSignal))
            void shutdown(0);
          const error = new Error(
            "Expo stopped before public readiness (exit " + code + ").",
          );
          attemptAbort.abort(error);
          fail(error);
        };
        const onError = (error) => {
          attemptAbort.abort(error);
          fail(error);
        };
        child.once("exit", onExit);
        child.once("error", onError);
        try {
          await Promise.race([warmRecoveryWeb(child, signal), failed]);
          signal.throwIfAborted();
        } catch (error) {
          attemptAbort.abort(error);
          forceStopFrontend(child);
          await closed;
          throw error;
        } finally {
          child.removeListener("exit", onExit);
          child.removeListener("error", onError);
        }
      },
      {
        signal: startupAbort.signal,
        onRetry(error, attempt) {
          console.warn(
            "Expo tunnel attempt " + attempt + "/3 failed: " + error.message,
          );
          console.log(
            "Retrying Expo automatically; MySQL, API and Auth remain running...",
          );
        },
      },
    );
  } else startFrontend();

  frontend.once("error", (error) => {
    console.error("Expo could not start: " + error.message);
    void shutdown(1);
  });
  frontend.once("exit", (code) => {
    if (!shuttingDown) void shutdown(code ?? 0);
    else maybeExit();
  });
} catch (error) {
  if (!shuttingDown) {
    console.error(
      error instanceof Error ? error.message : "PetConnect development failed.",
    );
    void shutdown(1);
  }
}
