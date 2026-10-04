import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function productionWebEnvironment(values) {
  const required = ["EXPO_PUBLIC_FIREBASE_PROJECT_ID", "EXPO_PUBLIC_FIREBASE_API_KEY",
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN", "EXPO_PUBLIC_FIREBASE_APP_ID", "EXPO_PUBLIC_API_BASE_URL"];
  if (values.EXPO_PUBLIC_FIREBASE_ENV !== "production") throw new Error("EXPO_PUBLIC_FIREBASE_ENV must be production.");
  for (const key of required) {
    if (!values[key]?.trim() || /(?:replace|placeholder|your[_-]|demo-petconnect)/i.test(values[key])) throw new Error(key + " requires a real production value.");
  }
  const url = new URL(values.EXPO_PUBLIC_API_BASE_URL);
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== values.EXPO_PUBLIC_API_BASE_URL.replace(/\/$/, "") ||
      /^(localhost|127\.|10\.|192\.168\.|\[)/i.test(url.hostname) || url.hostname.endsWith(".exp.direct")) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a public HTTPS origin.");
  }
  if (values.EXPO_PUBLIC_EMULATOR_HOST || values.FIREBASE_AUTH_EMULATOR_HOST) throw new Error("Production web must not use an emulator.");
  for (const key of Object.keys(values)) {
    if (!key.startsWith("EXPO_PUBLIC_")) throw new Error("Frontend configuration may contain only EXPO_PUBLIC_* client values.");
    if (/SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN/i.test(key)) throw new Error("Server credentials must never be included in frontend configuration.");
  }
  return { ...values, EXPO_NO_DOTENV: "1", NODE_ENV: "production" };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const req = createRequire(resolve("backend/api/package.json"));
    const envFile = process.argv[2] || ".deployment/frontend.env";
    const fromFile = existsSync(envFile) ? req("dotenv").parse(readFileSync(envFile)) : {};
    const publicValues = Object.fromEntries(Object.entries(process.env).filter(([key]) => key.startsWith("EXPO_PUBLIC_")));
    const env = productionWebEnvironment({ ...fromFile, ...publicValues });
    const result = spawnSync("npm --prefix frontend run export:web", { shell: true, stdio: "inherit", env: { ...process.env, ...env } });
    process.exitCode = result.status || (result.error ? 1 : 0);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
