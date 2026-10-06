import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (!process.env.npm_execpath)
  throw new Error("Run npm install from the repository root.");
for (const directory of ["backend/api", "frontend"]) {
  console.log(`Installing ${directory} from its tracked lockfile...`);
  const result = spawnSync(
    process.execPath,
    [process.env.npm_execpath, "ci", "--no-audit", "--no-fund"],
    {
      cwd: path.join(root, directory),
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error || result.status !== 0) {
    console.error(
      `Installation failed in ${directory}. Check Internet/disk space, then rerun npm install at the root.`,
    );
    process.exit(result.status || 1);
  }
}
