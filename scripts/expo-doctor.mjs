import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const cli = require.resolve("expo-doctor/build/index.js");
const result = spawnSync(process.execPath, [cli], {
  cwd: path.join(root, "frontend"),
  stdio: "inherit",
  windowsHide: true,
});
process.exitCode = result.status ?? 1;
