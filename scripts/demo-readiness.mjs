import { setTimeout as delay } from "node:timers/promises";

// Pitch readiness is earned by responsive services through the current public tunnel.
export function publicExpoOrigin(manifest) {
  const host = manifest?.extra?.expoClient?.hostUri;
  const launch = new URL(manifest?.launchAsset?.url);
  if (
    typeof host !== "string" ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:exp\.direct|ngrok\.io|ngrok-free\.app|ngrok\.app)$/i.test(
      host,
    ) ||
    launch.hostname !== host ||
    !["http:", "https:"].includes(launch.protocol)
  ) {
    throw new Error("Expo has not published a public tunnel manifest yet.");
  }
  return `https://${host}`;
}

async function checkedFetch(url, options = {}, timeout = 180_000, signal) {
  const response = await fetch(url, {
    ...options,
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
      : AbortSignal.timeout(timeout),
  });
  if (!response.ok)
    throw new Error(
      `${new URL(url).pathname} returned HTTP ${response.status}.`,
    );
  return response;
}

async function verifyDemoServicesOnce(origin, signal) {
  const ready = await (
    await checkedFetch(origin + "/petconnect-api/v1/ready", {}, 30_000, signal)
  ).json();
  if (ready.status !== "ready")
    throw new Error("API/database proxy is not ready.");
  // An intentionally invalid login checks the real Firebase SDK route without
  // creating disposable accounts or requiring previously imported emulator data.
  const response = await fetch(
    origin +
      "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-petconnect-api-key",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "readiness-probe@example.test",
        password: "invalid-readiness-password",
        returnSecureToken: true,
      }),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    },
  );
  const data = await response.json();
  if (
    response.status !== 400 ||
    ![
      "EMAIL_NOT_FOUND",
      "INVALID_PASSWORD",
      "INVALID_LOGIN_CREDENTIALS",
    ].includes(data?.error?.message)
  ) {
    throw new Error(
      "Firebase Auth proxy did not respond as the local emulator.",
    );
  }
}

function requireJavaScript(response) {
  if (!/(?:java|ecma)script/i.test(response.headers.get("content-type") || ""))
    throw new Error("Expo did not serve a JavaScript bundle.");
}

export async function warmRecoveryBrowser(origin, signal) {
  const html = await (
    await checkedFetch(
      origin + "/recover",
      {
        headers: { accept: "text/html" },
      },
      180_000,
      signal,
    )
  ).text();
  const scripts = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi),
  ].map((match) => match[1].replaceAll("&amp;", "&"));
  if (!scripts.length)
    throw new Error("Browser recovery did not serve an Expo entry script.");
  for (const script of scripts) {
    const url = new URL(script, origin);
    if (url.origin !== origin)
      throw new Error("Recovery entry script uses a different origin.");
    const response = await checkedFetch(url, {}, 180_000, signal);
    requireJavaScript(response);
    if (!(await response.arrayBuffer()).byteLength)
      throw new Error("Browser recovery bundle is empty.");
  }
}

export async function warmPublicExpo(origin, platform, signal) {
  const response = await checkedFetch(
    origin,
    {
      headers: { accept: "application/expo+json", "expo-platform": platform },
    },
    180_000,
    signal,
  );
  const manifest = await response.json();
  if (publicExpoOrigin(manifest) !== origin)
    throw new Error("Expo tunnel changed during warm-up.");
  const bundle = new URL(manifest.launchAsset.url);
  bundle.protocol = "https:";
  const result = await checkedFetch(
    bundle,
    {
      headers: { "expo-platform": platform },
    },
    180_000,
    signal,
  );
  requireJavaScript(result);
  if ((await result.arrayBuffer()).byteLength < 1024)
    throw new Error(`Expo Go ${platform} bundle is empty.`);
}

export async function verifyDemoServices(origin, signal) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      signal?.throwIfAborted();
      await verifyDemoServicesOnce(origin, signal);
      return;
    } catch (error) {
      signal?.throwIfAborted();
      lastError = error;
      if (attempt < 2) await delay(500, undefined, { signal });
    }
  }
  throw lastError;
}

export async function retryDemoStartup(
  operation,
  { signal, maxAttempts = 3, delayMs = 1500, onRetry } = {},
) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    signal?.throwIfAborted();
    try {
      return await operation();
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt === maxAttempts) throw error;
      onRetry?.(error, attempt);
      await delay(delayMs, undefined, { signal });
    }
  }
}
