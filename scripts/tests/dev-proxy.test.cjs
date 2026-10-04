const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const proxyPath = path.resolve(__dirname, "../../frontend/dev-proxy.cjs");
const createDevProxy = fs.existsSync(proxyPath)
  ? require(proxyPath).createDevProxy
  : () => (_req, _res, next) => next();

async function server(t, handler) {
  const value = http.createServer(handler);
  await new Promise((resolve) => value.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        value.closeAllConnections();
        value.close(resolve);
      }),
  );
  return {
    port: value.address().port,
    url: "http://127.0.0.1:" + value.address().port,
  };
}
async function proxy(t, options) {
  const middleware = createDevProxy(options);
  return server(t, (req, res) =>
    middleware(req, res, () => {
      res.statusCode = 404;
      res.end("Expo route");
    }),
  );
}

test("forwards API bodies, query strings and authentication", async (t) => {
  const upstream = await server(t, async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        path: req.url,
        method: req.method,
        token: req.headers.authorization,
        body,
      }),
    );
  });
  const dev = await proxy(t, { apiPort: upstream.port });
  const response = await fetch(dev.url + "/petconnect-api/v1/pets?test=1", {
    method: "POST",
    headers: {
      Authorization: "Bearer test-token",
      "Content-Type": "application/json",
    },
    body: '{"name":"Mochi"}',
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    path: "/v1/pets?test=1",
    method: "POST",
    token: "Bearer test-token",
    body: '{"name":"Mochi"}',
  });
});

test("forwards Firebase email signup and refresh requests at the SDK paths", async (t) => {
  const upstream = await server(t, (req, res) => {
    res.end(req.url);
  });
  const dev = await proxy(t, { authPort: upstream.port });
  for (const route of [
    "/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key",
    "/securetoken.googleapis.com/v1/token?key=demo-key",
  ]) {
    const response = await fetch(dev.url + route, {
      method: "POST",
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), route);
  }
});

test("streams photos and keeps the upstream status and content type", async (t) => {
  const upstream = await server(t, (_req, res) => {
    res.statusCode = 201;
    res.setHeader("Content-Type", "image/webp");
    res.end(Buffer.from([1, 2, 3]));
  });
  const dev = await proxy(t, { apiPort: upstream.port });
  const response = await fetch(dev.url + "/petconnect-api/uploads/pet.webp");
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("content-type"), "image/webp");
  assert.deepEqual(
    Buffer.from(await response.arrayBuffer()),
    Buffer.from([1, 2, 3]),
  );
});

test("leaves Metro routes and emulator administration unproxied", async (t) => {
  const dev = await proxy(t, {});
  for (const route of [
    "/",
    "/status",
    "/emulator/v1/projects/demo-petconnect/accounts",
    "/identitytoolkit.googleapis.com/v1/projects/demo-petconnect/accounts:batchGet",
    "/petconnect-api/emulator/v1/projects/demo-petconnect/accounts",
  ]) {
    assert.equal(await (await fetch(dev.url + route)).text(), "Expo route");
  }
});

test("disabled middleware does not expose development services", async (t) => {
  const dev = await proxy(t, { enabled: false });
  assert.equal(
    await (await fetch(dev.url + "/petconnect-api/v1/health")).text(),
    "Expo route",
  );
});

test("reports an unavailable service with a bounded gateway error", async (t) => {
  const upstream = http.createServer();
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const port = upstream.address().port;
  await new Promise((resolve) => upstream.close(resolve));
  const dev = await proxy(t, { apiPort: port });
  const response = await fetch(dev.url + "/petconnect-api/v1/health");
  assert.equal(response.status, 502);
  assert.match((await response.json()).message, /start/i);
});
