import assert from "node:assert/strict";
import test from "node:test";
import { webQrUrl } from "../web-qr.mjs";

const wifi = {
  WiFi: [{ address: "172.20.10.3", family: "IPv4", internal: false }],
  Loopback: [{ address: "127.0.0.1", family: "IPv4", internal: true }],
};
test("phone web QR uses the LAN address and actual web port", () => {
  assert.equal(webQrUrl({ interfaces: wifi }), "http://172.20.10.3:8081/");
  assert.equal(
    webQrUrl({ interfaces: wifi, port: 8083 }),
    "http://172.20.10.3:8083/",
  );
});
test("Expo links are rejected instead of being presented as browser links", () => {
  assert.throws(
    () => webQrUrl({ url: "exp://172.20.10.3:8082" }),
    /browser QR/,
  );
});
test("phone QR rejects loopback URLs", () => {
  for (const host of ["localhost", "127.0.0.1", "[::1]"]) {
    assert.throws(() => webQrUrl({ url: `http://${host}:8081` }), /Localhost/);
  }
});
test("ambiguous or unavailable LAN interfaces require an explicit reachable URL", () => {
  assert.throws(() => webQrUrl({ interfaces: {} }), /choose one LAN address/);
  assert.throws(
    () =>
      webQrUrl({
        interfaces: {
          ...wifi,
          Ethernet: [
            { address: "192.168.1.2", family: "IPv4", internal: false },
          ],
        },
      }),
    /choose one LAN address/,
  );
  assert.equal(
    webQrUrl({ url: "https://example.org/", interfaces: {} }),
    "https://example.org/",
  );
});
test("invalid ports and URLs containing credentials are rejected", () => {
  assert.throws(() => webQrUrl({ interfaces: wifi, port: 0 }), /web port/);
  assert.throws(
    () => webQrUrl({ url: "http://user:password@172.20.10.3:8081/" }),
    /credentials/,
  );
});
