import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const sensitiveQueryKeys = new Set([
  "token",
  "access_token",
  "id_token",
  "refresh_token",
  "finderContact",
  "finderName",
]);

export interface RequestWithId extends Request {
  requestId?: string;
  user?: { uid?: string };
}

function safeRequestId(value: unknown): string | null {
  const text = String(value || "");
  return /^[A-Za-z0-9._:-]{8,100}$/.test(text) ? text : null;
}

export function sanitizedPath(req: Request): string {
  const raw = req.originalUrl || req.url || "/";
  try {
    const url = new URL(raw, "http://petconnect.local");
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveQueryKeys.has(key)) url.searchParams.set(key, "[redacted]");
    }
    const pathname = url.pathname
      .replace(/(\/v1\/recovery\/)[^/]+/g, "$1[redacted]")
      .replace(/(\/v1\/clinic\/patients\/recovery\/)[^/]+/g, "$1[redacted]");
    const query = url.searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  } catch {
    return raw.replace(
      /(\/v1\/(?:clinic\/patients\/)?recovery\/)[^/?]+/g,
      "$1[redacted]",
    );
  }
}

export function requestObservability(
  req: RequestWithId,
  res: Response,
  next: NextFunction,
) {
  const started = process.hrtime.bigint();
  const requestId = safeRequestId(req.headers["x-request-id"]) || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
    const userId = req.user?.uid;
    process.stdout.write(
      JSON.stringify({
        ts: new Date().toISOString(),
        level: "info",
        event: "http_request",
        requestId,
        method: req.method,
        path: sanitizedPath(req),
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        ...(userId ? { userId } : {}),
      }) + "\n",
    );
  });

  next();
}

export function logError(
  error: unknown,
  req?: RequestWithId,
  event = "api_error",
) {
  const err = error instanceof Error ? error : new Error(String(error));
  process.stderr.write(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      event,
      ...(req?.requestId ? { requestId: req.requestId } : {}),
      ...(req ? { method: req.method, path: sanitizedPath(req) } : {}),
      errorName: err.name,
      message: err.message,
      ...(process.env.NODE_ENV !== "production" && err.stack
        ? { stack: err.stack }
        : {}),
    }) + "\n",
  );
}
