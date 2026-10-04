import net from "node:net";

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

// Only Expo must be exclusively owned by this invocation. The dev launcher can
// safely reuse a healthy PetConnect API/Auth pair left behind by an interrupted
// terminal session, and it can start whichever backend service is missing.
if (await isListening(8081)) {
  console.error("");
  console.error(
    "PetConnect development cannot start because the Expo frontend is already running on port 8081.",
  );
  console.error(
    "Use the existing Expo session, or stop it with Ctrl+C before running npm run dev again.",
  );
  process.exit(1);
}

console.log("PetConnect frontend port is available.");
