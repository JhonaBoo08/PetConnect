import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile, writeFile, rm, access } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const helloSha256 =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
async function setup(t, handler) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "petconnect-download-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }),
  );
  return {
    url: "http://127.0.0.1:" + server.address().port + "/runtime.zip",
    file: path.join(dir, "runtime.zip"),
  };
}

test("verified downloads are cached and a corrupt cache is replaced", async (t) => {
  const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
  let requests = 0;
  const { url, file } = await setup(t, (_req, res) => {
    requests++;
    res.end("hello");
  });
  await downloadVerified({
    urls: [url],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(await readFile(file, "utf8"), "hello");
  await downloadVerified({
    urls: [url],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(requests, 1);
  await writeFile(file, "corrupt");
  await downloadVerified({
    urls: [url],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(await readFile(file, "utf8"), "hello");
  assert.equal(requests, 2);
});
test("interrupted downloads resume from the existing bytes", async (t) => {
  const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
  const { url, file } = await setup(t, (req, res) => {
    assert.equal(req.headers.range, "bytes=2-");
    res.writeHead(206, {
      "content-range": "bytes 2-4/5",
      "content-length": "3",
    });
    res.end("llo");
  });
  await writeFile(file + ".partial", "he");
  await downloadVerified({
    urls: [url],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(await readFile(file, "utf8"), "hello");
});
test("checksum failure cannot install or cache a runtime", async (t) => {
  const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
  const { url, file } = await setup(t, (_req, res) => res.end("broken"));
  await assert.rejects(
    () =>
      downloadVerified({
        urls: [url],
        destination: file,
        checksum: helloSha256,
      }),
    /checksum/i,
  );
  await assert.rejects(() => access(file));
  await assert.rejects(() => access(file + ".partial"));
});
test("a failed primary download tries the official fallback", async (t) => {
  const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
  const { url, file } = await setup(t, (req, res) => {
    if (req.url === "/runtime.zip") {
      res.statusCode = 404;
      res.end("retired");
    } else res.end("hello");
  });
  await downloadVerified({
    urls: [url, url.replace("runtime.zip", "archive.zip")],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(await readFile(file, "utf8"), "hello");
});

test("a complete verified partial download is promoted without requesting an invalid range", async (t) => {
  const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
  let requests = 0;
  const { url, file } = await setup(t, (_req, res) => {
    requests++;
    res.writeHead(416);
    res.end();
  });
  await writeFile(file + ".partial", "hello");
  await downloadVerified({
    urls: [url],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(await readFile(file, "utf8"), "hello");
  assert.equal(requests, 0);
});
test("an unsatisfiable stale partial restarts the download", async (t) => {
  const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
  const { url, file } = await setup(t, (req, res) => {
    if (req.headers.range) {
      res.writeHead(416);
      res.end();
    } else res.end("hello");
  });
  await writeFile(file + ".partial", "old-longer-file");
  await downloadVerified({
    urls: [url],
    destination: file,
    checksum: helloSha256,
  });
  assert.equal(await readFile(file, "utf8"), "hello");
});
test(
  "cancelling a stalled transfer stops setup and preserves resumable bytes",
  { timeout: 2000 },
  async (t) => {
    const { downloadVerified } = await import("../dev-mysql-runtime.mjs");
    const controller = new AbortController();
    const { url, file } = await setup(t, (_req, res) => {
      res.write("he");
      setTimeout(() => controller.abort(), 50);
    });
    await assert.rejects(
      () =>
        downloadVerified({
          urls: [url],
          destination: file,
          checksum: helloSha256,
          signal: controller.signal,
        }),
      /abort/i,
    );
    assert.equal(await readFile(file + ".partial", "utf8"), "he");
    await assert.rejects(() => access(file));
  },
);
