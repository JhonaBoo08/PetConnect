import process from "node:process";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(name + " requires a value.");
  }
  return value;
}

function httpsOrigin(value, label) {
  if (!value) throw new Error(label + " is required.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.origin !== value.replace(/\/$/, "")
  ) {
    throw new Error(label + " must be a public HTTPS origin.");
  }
  return url.origin;
}

async function response(url, expectedContentType) {
  const result = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "User-Agent": "PetConnect-Deployment-Smoke/1.0" },
  });
  if (!result.ok) {
    throw new Error(url + " returned HTTP " + result.status + ".");
  }
  if (
    expectedContentType &&
    !result.headers
      .get("content-type")
      ?.toLowerCase()
      .includes(expectedContentType)
  ) {
    throw new Error(url + " returned an unexpected content type.");
  }
  return result;
}

async function main() {
  const web = httpsOrigin(
    option("--web-url") || process.env.PETCONNECT_PUBLIC_URL,
    "--web-url / PETCONNECT_PUBLIC_URL",
  );
  const api = httpsOrigin(
    option("--api-url") || process.env.PETCONNECT_API_URL || web,
    "--api-url / PETCONNECT_API_URL",
  );

  const health = await response(api + "/v1/health", "application/json");
  const healthBody = await health.json();
  if (healthBody.status !== "ok")
    throw new Error("API health check is not ok.");

  const ready = await response(api + "/v1/ready", "application/json");
  const readyBody = await ready.json();
  if (readyBody.status !== "ready")
    throw new Error("API readiness check failed.");

  await response(web + "/", "text/html");
  await response(web + "/recover", "text/html");

  process.stdout.write(
    "Production smoke check passed for web, public recovery, health and readiness.\n",
  );
}

main().catch((error) => {
  process.stderr.write(
    "Production smoke check failed: " +
      (error instanceof Error ? error.message : String(error)) +
      "\n",
  );
  process.exitCode = 1;
});
