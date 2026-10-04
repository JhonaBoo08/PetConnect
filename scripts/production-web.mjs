import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function unsafePublicHost(hostname) {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "::" ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^(fc|fd|fe80):/i.test(host) ||
    host.endsWith(".local") ||
    host.endsWith(".exp.direct") ||
    host.endsWith(".exp.host") ||
    host === "example.com" ||
    host.endsWith(".example.com") ||
    host === "example.org" ||
    host.endsWith(".example.org") ||
    host === "example.net" ||
    host.endsWith(".example.net") ||
    host.endsWith(".example") ||
    host.endsWith(".test") ||
    host.endsWith(".invalid")
  );
}

export function productionWebEnvironment(values) {
  const required = [
    "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
    "EXPO_PUBLIC_FIREBASE_API_KEY",
    "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "EXPO_PUBLIC_FIREBASE_APP_ID",
    "EXPO_PUBLIC_API_BASE_URL",
  ];
  if (values.EXPO_PUBLIC_FIREBASE_ENV !== "production") {
    throw new Error("EXPO_PUBLIC_FIREBASE_ENV must be production.");
  }
  for (const key of required) {
    if (
      !values[key]?.trim() ||
      /(?:replace|placeholder|your[_-]|demo-petconnect)/i.test(values[key])
    ) {
      throw new Error(key + " requires a real production value.");
    }
  }

  const url = new URL(values.EXPO_PUBLIC_API_BASE_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== values.EXPO_PUBLIC_API_BASE_URL.replace(/\/$/, "") ||
    unsafePublicHost(url.hostname)
  ) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL must be a public HTTPS origin.");
  }

  if (values.EXPO_PUBLIC_EMULATOR_HOST || values.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error("Production web must not use an emulator.");
  }
  for (const key of Object.keys(values)) {
    if (!key.startsWith("EXPO_PUBLIC_")) {
      throw new Error(
        "Frontend configuration may contain only EXPO_PUBLIC_* client values.",
      );
    }
    if (/SECRET|PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN/i.test(key)) {
      throw new Error(
        "Server credentials must never be included in frontend configuration.",
      );
    }
  }
  return { ...values, EXPO_NO_DOTENV: "1", NODE_ENV: "production" };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const req = createRequire(resolve("backend/api/package.json"));
    const envFile = process.argv[2] || ".deployment/frontend.env";
    const fromFile = existsSync(envFile)
      ? req("dotenv").parse(readFileSync(envFile))
      : {};
    const publicValues = Object.fromEntries(
      Object.entries(process.env).filter(([key]) =>
        key.startsWith("EXPO_PUBLIC_"),
      ),
    );
    const env = productionWebEnvironment({ ...fromFile, ...publicValues });
    const executable = process.platform === "win32" ? "npm.cmd" : "npm";
    const result = spawnSync(
      executable,
      ["--prefix", "frontend", "run", "export:web"],
      {
        stdio: "inherit",
        env: { ...process.env, ...env },
        windowsHide: true,
      },
    );
    process.exitCode = result.status || (result.error ? 1 : 0);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
