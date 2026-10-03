import path from "node:path";

const placeholderPattern =
  /(change[-_ ]?(?:me|this)|placeholder|your[_ -]|example|demo-petconnect|replace[_ -]?with)/i;

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required in production.`);
  return value;
}

function productionUrl(value: string, key: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be an absolute URL in production.`);
  }
  if (url.protocol !== "https:") {
    throw new Error(`${key} must use HTTPS in production.`);
  }
  if (url.username || url.password) {
    throw new Error(`${key} must not contain URL credentials in production.`);
  }
  const host = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    /^127\./.test(host) ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host === "::"
  ) {
    throw new Error(`${key} cannot point to localhost in production.`);
  }
  return url;
}

export function assertProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;

  required(env, "MYSQL_HOST");
  const mysqlPort = Number(required(env, "MYSQL_PORT"));
  if (!Number.isInteger(mysqlPort) || mysqlPort < 1 || mysqlPort > 65535) {
    throw new Error("MYSQL_PORT must be a valid TCP port in production.");
  }

  const mysqlUser = required(env, "MYSQL_USER");
  if (mysqlUser.toLowerCase() === "root") {
    throw new Error("MYSQL_USER must not be root in production.");
  }

  const mysqlPassword = required(env, "MYSQL_PASSWORD");
  if (mysqlPassword.length < 12 || placeholderPattern.test(mysqlPassword)) {
    throw new Error(
      "MYSQL_PASSWORD must be a non-placeholder production password.",
    );
  }

  const mysqlDatabase = required(env, "MYSQL_DATABASE");
  if (/(_test|test_|development|dev_db)/i.test(mysqlDatabase)) {
    throw new Error("MYSQL_DATABASE must not be a test/development database.");
  }

  const firebaseProjectId = required(env, "FIREBASE_PROJECT_ID");
  if (placeholderPattern.test(firebaseProjectId)) {
    throw new Error(
      "FIREBASE_PROJECT_ID must be the real production Firebase project ID.",
    );
  }
  if (env.FIREBASE_AUTH_EMULATOR_HOST?.trim()) {
    throw new Error(
      "FIREBASE_AUTH_EMULATOR_HOST must not be set in production.",
    );
  }
  if (
    !env.GOOGLE_APPLICATION_CREDENTIALS?.trim() &&
    !env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  ) {
    throw new Error(
      "Firebase Admin credentials are required in production. Configure GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON.",
    );
  }

  const corsOrigins = required(env, "CORS_ALLOWED_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (!corsOrigins.length) {
    throw new Error("CORS_ALLOWED_ORIGINS must contain at least one origin.");
  }
  for (const origin of corsOrigins) {
    const url = productionUrl(origin, "CORS_ALLOWED_ORIGINS");
    if (origin !== url.origin) {
      throw new Error(
        "CORS_ALLOWED_ORIGINS entries must be HTTPS origins without paths, queries or fragments.",
      );
    }
  }

  productionUrl(required(env, "PUBLIC_APP_BASE_URL"), "PUBLIC_APP_BASE_URL");

  const recoverySecret = required(env, "RECOVERY_TOKEN_SECRET");
  if (
    Buffer.byteLength(recoverySecret, "utf8") < 32 ||
    placeholderPattern.test(recoverySecret)
  ) {
    throw new Error(
      "RECOVERY_TOKEN_SECRET must be a non-placeholder secret of at least 32 bytes.",
    );
  }

  const uploadDir = required(env, "UPLOAD_DIR");
  if (!path.isAbsolute(uploadDir)) {
    throw new Error(
      "UPLOAD_DIR must be an absolute durable path in production.",
    );
  }
}
