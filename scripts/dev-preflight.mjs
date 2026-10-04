import net from "node:net";

const requiredPorts = [
  [3000, "PetConnect API"],
  [8081, "Expo frontend"],
  [9099, "Firebase Auth emulator"],
  [4000, "Firebase Emulator UI"],
  [4400, "Firebase Emulator Hub"],
  [4500, "Firebase reserved port"],
];

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

const busy = [];
for (const [port, label] of requiredPorts) {
  if (await isListening(port)) busy.push({ port, label });
}

if (busy.length) {
  console.error("");
  console.error(
    "PetConnect development cannot start because required local ports are already in use:",
  );
  for (const { port, label } of busy) {
    console.error(`  - ${port}: ${label}`);
  }
  console.error("");
  console.error(
    "A previous PetConnect development session may still be running. Stop it with Ctrl+C in its terminal, then run npm run dev again.",
  );
  process.exit(1);
}

console.log("PetConnect development ports are available.");
