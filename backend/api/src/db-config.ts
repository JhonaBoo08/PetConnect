import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolOptions } from "mysql2/promise";

function integer(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  max: number,
): number {
  const value = env[key]?.trim();
  const parsed = value ? Number(value) : fallback;
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${key} must be an integer between 1 and ${max}.`);
  }
  return parsed;
}

export function mysqlTlsOptions(
  env: NodeJS.ProcessEnv = process.env,
): { ca: string; rejectUnauthorized: true } | undefined {
  const setting = env.MYSQL_SSL?.trim().toLowerCase() || "false";
  if (setting !== "true" && setting !== "false")
    throw new Error("MYSQL_SSL must be true or false.");
  const inline = env.MYSQL_SSL_CA?.trim();
  const file = env.MYSQL_SSL_CA_PATH?.trim();
  if (setting === "false") {
    if (inline || file)
      throw new Error("MYSQL_SSL must be true when a CA is configured.");
    return undefined;
  }
  if (!inline && !file)
    throw new Error(
      "MYSQL_SSL_CA or MYSQL_SSL_CA_PATH is required for verified MySQL TLS.",
    );
  if (inline && file)
    throw new Error(
      "Configure only one of MYSQL_SSL_CA and MYSQL_SSL_CA_PATH.",
    );
  let ca: string;
  try {
    ca = (inline || readFileSync(file!, "utf8")).replaceAll("\\n", "\n").trim();
    const certificates = ca.match(
      /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
    );
    if (
      !certificates?.length ||
      certificates.join("").replace(/\s/g, "") !== ca.replace(/\s/g, "")
    )
      throw new Error();
    for (const certificate of certificates) {
      if (!new X509Certificate(certificate).ca) throw new Error();
    }
  } catch {
    throw new Error(
      "MYSQL_SSL_CA / MYSQL_SSL_CA_PATH must contain readable PEM CA certificates.",
    );
  }
  return { ca, rejectUnauthorized: true };
}

/** Shared by the API and explicit migration tools; never mutates schema. */
export function mysqlConnectionOptions(
  env: NodeJS.ProcessEnv = process.env,
): PoolOptions {
  return {
    host: env.MYSQL_HOST || "127.0.0.1",
    user: env.MYSQL_USER || "root",
    password: env.MYSQL_PASSWORD || "",
    database: env.MYSQL_DATABASE || "petconnect_db",
    port: integer(env, "MYSQL_PORT", 3306, 65535),
    ssl: mysqlTlsOptions(env),
    waitForConnections: true,
    connectionLimit: integer(env, "MYSQL_CONNECTION_LIMIT", 4, 10),
    maxIdle: 2,
    idleTimeout: 60_000,
    queueLimit: 64,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    timezone: "Z",
  };
}
