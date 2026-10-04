import net from "node:net";
import { spawnSync } from "node:child_process";

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
