import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  publicExpoOrigin,
  verifyDemoServices,
  warmRecoveryBrowser,
} from "../demo-readiness.mjs";

async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return `http://127.0.0.1:${server.address().port}`;
}
test("derives HTTPS recovery origin from the current tunnel manifest", () => {
  assert.equal(
    publicExpoOrigin({
      extra: { expoClient: { hostUri: "session-8081.exp.direct" } },
      launchAsset: { url: "http://session-8081.exp.direct/entry.bundle" },
    }),
    "https://session-8081.exp.direct",
  );
});
test("rejects phone loopback, LAN and mismatched launch hosts", () => {
  for (const host of ["localhost:8081", "127.0.0.1:8081", "192.168.1.20:8081"])
    assert.throws(() =>
      publicExpoOrigin({
        extra: { expoClient: { hostUri: host } },
        launchAsset: { url: `http://${host}/entry.bundle` },
      }),
    );
  assert.throws(() =>
    publicExpoOrigin({
      extra: { expoClient: { hostUri: "session.exp.direct" } },
      launchAsset: { url: "http://127.0.0.1:8081/entry.bundle" },
    }),
  );
});
test("readiness verifies API JSON and an actual Firebase proxy response", async (t) => {
  const origin = await serve(t, (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.url === "/petconnect-api/v1/ready")
      return res.end('{"status":"ready"}');
    if (
      req.url.startsWith(
        "/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword",
      )
    ) {
      res.statusCode = 400;
      return res.end('{"error":{"message":"EMAIL_NOT_FOUND"}}');
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await verifyDemoServices(origin);
});
test("does not accept a generic HTTP 200 page as readiness", async (t) => {
  const origin = await serve(t, (_req, res) =>
    res.end("<html>wrong service</html>"),
  );
  await assert.rejects(() => verifyDemoServices(origin));
});
test("does not accept an unavailable database as readiness", async (t) => {
  const origin = await serve(t, (_req, res) => {
    res.statusCode = 503;
    res.end('{"ready":false}');
  });
  await assert.rejects(() => verifyDemoServices(origin));
});
test("browser recovery warms its entry script", async (t) => {
  let scripts = 0;
  const origin = await serve(t, (req, res) => {
    if (req.url.startsWith("/recover")) {
      res.setHeader("content-type", "text/html");
      return res.end(
        '<html><script src="/entry.bundle?platform=web"></script></html>',
      );
    }
    scripts++;
    res.setHeader("content-type", "application/javascript");
    res.end("window.PetConnect = true;");
  });
  await warmRecoveryBrowser(origin);
  assert.equal(scripts, 1);
});
test("an HTML response cannot count as the browser JavaScript bundle", async (t) => {
  const origin = await serve(t, (req, res) => {
    if (req.url.startsWith("/recover"))
      return res.end('<script src="/entry.bundle"></script>');
    res.setHeader("content-type", "text/html");
    res.end("<html>Temporary tunnel page</html>");
  });
  await assert.rejects(() => warmRecoveryBrowser(origin), /JavaScript/);
});

test("bundle failures and tunnel interstitials cannot report readiness", async (t) => {
  const broken = await serve(t, (req, res) => {
    if (req.url.startsWith("/recover"))
      return res.end('<script src="/entry.bundle"></script>');
    res.statusCode = 500;
    res.end("bundle error");
  });
  await assert.rejects(() => warmRecoveryBrowser(broken));
  const interstitial = await serve(t, (_req, res) =>
    res.end("<html>Visit site</html>"),
  );
  await assert.rejects(() => warmRecoveryBrowser(interstitial));
});

test("readiness retries a transient tunnel HTML response and requires real Auth JSON", async (t) => {
  let attempts = 0;
  const origin = await serve(t, (req, res) => {
    if (req.url === "/petconnect-api/v1/ready")
      return res.end('{"status":"ready"}');
    attempts++;
    if (attempts === 1) return res.end("<html>tunnel starting</html>");
    res.statusCode = 400;
    res.setHeader("content-type", "application/json");
    res.end('{"error":{"message":"EMAIL_NOT_FOUND"}}');
  });
  await verifyDemoServices(origin);
  assert.equal(attempts, 2);
});
