import path from "node:path";
import { mysqlConnectionOptions } from "./db-config.js";
import { firebaseServiceAccount } from "./firebase-admin-config.js";

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
  ) {
    throw new Error(
      `${key} must use a routable public hostname in production.`,
    );
  }
  return url;
}

export function assertProductionEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.NODE_ENV !== "production") return;

  const mysqlSocketPath = env.MYSQL_SOCKET_PATH?.trim();
  if (mysqlSocketPath) {
    if (!path.isAbsolute(mysqlSocketPath)) {
      throw new Error(
        "MYSQL_SOCKET_PATH must be an absolute path in production.",
      );
    }
  } else {
    required(env, "MYSQL_HOST");
    if (env.MYSQL_SSL?.toLowerCase() !== "true") {
      throw new Error(
        "MYSQL_SSL=true is required for network MySQL connections in production.",
      );
    }
  }
  mysqlConnectionOptions(env);
  serverPort(env);
  const proxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (
    ![0, 1].includes(proxyHops) ||
    (env.RENDER === "true" && proxyHops !== 1)
  ) {
    throw new Error(
      "TRUST_PROXY_HOPS must be 0 or 1, and must be 1 behind the Render ingress.",
    );
  }
  if (!mysqlSocketPath) {
    const mysqlPort = Number(required(env, "MYSQL_PORT"));
    if (!Number.isInteger(mysqlPort) || mysqlPort < 1 || mysqlPort > 65535) {
      throw new Error("MYSQL_PORT must be a valid TCP port in production.");
    }
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

  firebaseServiceAccount(env);

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

  const publicAppBaseUrl = required(env, "PUBLIC_APP_BASE_URL");
  const publicAppUrl = productionUrl(publicAppBaseUrl, "PUBLIC_APP_BASE_URL");
  if (publicAppBaseUrl.replace(/\/$/, "") !== publicAppUrl.origin) {
    throw new Error(
      "PUBLIC_APP_BASE_URL must be an HTTPS origin without a path, query or fragment.",
    );
  }
  if (!corsOrigins.includes(publicAppUrl.origin)) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS must include the PUBLIC_APP_BASE_URL origin.",
    );
  }

  const recoverySecret = required(env, "RECOVERY_TOKEN_SECRET");
  if (
    Buffer.byteLength(recoverySecret, "utf8") < 32 ||
    placeholderPattern.test(recoverySecret)
  ) {
    throw new Error(
      "RECOVERY_TOKEN_SECRET must be a non-placeholder secret of at least 32 bytes.",
    );
  }

  for (const key of [
    "FINDER_SESSION_SECRET",
    "FINDER_IP_HASH_SECRET",
    "FINDER_OTP_SECRET",
  ]) {
    const secret = required(env, key);
    if (
      Buffer.byteLength(secret, "utf8") < 32 ||
      placeholderPattern.test(secret)
    ) {
      throw new Error(
        `${key} must be a non-placeholder secret of at least 32 bytes.`,
      );
    }
  }

  const otpProvider = required(env, "FINDER_OTP_PROVIDER").toLowerCase();
  if (otpProvider === "webhook") {
    productionUrl(
      required(env, "FINDER_OTP_WEBHOOK_URL"),
      "FINDER_OTP_WEBHOOK_URL",
    );
  } else if (otpProvider === "smsgate") {
    const url = productionUrl(
      required(env, "SMSGATE_BASE_URL"),
      "SMSGATE_BASE_URL",
    );
    if (url.search || url.hash)
      throw new Error("SMSGATE_BASE_URL must not contain a query or fragment.");
    required(env, "SMSGATE_USERNAME");
    required(env, "SMSGATE_PASSWORD");
  } else {
    throw new Error(
      "FINDER_OTP_PROVIDER must be smsgate or webhook in production.",
    );
  }
  if (env.FINDER_OTP_EXPOSE_CODE?.trim().toLowerCase() === "true") {
    throw new Error(
      "FINDER_OTP_EXPOSE_CODE must not be enabled in production.",
    );
  }

  const provider = required(env, "UPLOAD_STORAGE_PROVIDER").toLowerCase();
  if (provider === "cloudinary") {
    if (!/^[a-zA-Z0-9_-]+$/.test(required(env, "CLOUDINARY_CLOUD_NAME")))
      throw new Error("CLOUDINARY_CLOUD_NAME is invalid.");
    if (!/^\d+$/.test(required(env, "CLOUDINARY_API_KEY")))
      throw new Error("CLOUDINARY_API_KEY is invalid.");
    const secret = required(env, "CLOUDINARY_API_SECRET");
    if (placeholderPattern.test(secret))
      throw new Error("CLOUDINARY_API_SECRET must not be a placeholder.");
  } else if (provider === "local") {
    if (env.RENDER === "true" || env.UPLOAD_LOCAL_DURABLE !== "true") {
      throw new Error(
        "Local production uploads require UPLOAD_LOCAL_DURABLE=true and cannot be used on Render Free.",
      );
    }
    if (!path.isAbsolute(required(env, "UPLOAD_DIR")))
      throw new Error(
        "UPLOAD_DIR must be an absolute durable path in production.",
      );
  } else {
    throw new Error("UPLOAD_STORAGE_PROVIDER must be local or cloudinary.");
  }
}

export function serverPort(env: NodeJS.ProcessEnv = process.env): number {
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be a valid TCP port.");
  return port;
}
