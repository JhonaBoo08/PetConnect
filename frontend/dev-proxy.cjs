const http = require("node:http");

const authAccountRoute =
  /^\/identitytoolkit\.googleapis\.com\/v1\/accounts:(signUp|signInWithPassword|lookup|update|delete|sendOobCode|resetPassword)(\?|$)/;
const refreshRoute = /^\/securetoken\.googleapis\.com\/v1\/token(\?|$)/;

function createDevProxy({
  enabled = true,
  apiPort = 3000,
  authPort = 9099,
  timeoutMs = 15000,
} = {}) {
  return (req, res, next) => {
    if (!enabled) return next();
    const original = req.url || "/";
    const apiPath = original.startsWith("/petconnect-api/")
      ? original.slice("/petconnect-api".length)
      : null;
    const api = apiPath && /^\/(v1|uploads)\//.test(apiPath);
    const auth = authAccountRoute.test(original) || refreshRoute.test(original);
    if (!api && !auth) return next();

    const port = api ? apiPort : authPort;
    const headers = { ...req.headers, host: `127.0.0.1:${port}` };
    // Expo checks the request origin before this same-origin/native proxy.
    delete headers.origin;
    delete headers.connection;
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: api ? apiPath : original,
        method: req.method,
        headers,
      },
      (response) => {
        res.writeHead(response.statusCode || 502, response.headers);
        response.on("error", () => res.destroy());
        response.pipe(res);
      },
    );
    upstream.setTimeout(timeoutMs, () =>
      upstream.destroy(new Error("timeout")),
    );
    upstream.on("error", (error) => {
      const target = api ? "PetConnect API" : "Firebase Auth emulator";
      console.error(
        `[dev-proxy] ${target} is unavailable on 127.0.0.1:${port}: ${error.message}`,
      );
      if (res.headersSent) return res.destroy();
      res.writeHead(502, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "development-service-unavailable",
          message:
            "PetConnect is temporarily unavailable. Please try again in a moment.",
        }),
      );
    });
    req.on("aborted", () => upstream.destroy());
    res.on("close", () => {
      if (!res.writableFinished) upstream.destroy();
    });
    req.pipe(upstream);
  };
}

module.exports = { createDevProxy };
