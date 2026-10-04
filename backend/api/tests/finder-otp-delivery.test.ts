import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deliverFinderOtp,
  FinderOtpDeliveryError,
} from "../src/finder-otp-delivery.js";
import { normalizeFinderPhone } from "../src/finder-verification.js";

const env = {
  NODE_ENV: "production",
  FINDER_OTP_PROVIDER: "smsgate",
  SMSGATE_BASE_URL: "https://api.sms-gate.app/3rdparty/v1/",
  SMSGATE_USERNAME: "mock-user",
  SMSGATE_PASSWORD: "mock-password",
};
test("SMSGate sends a normalized Philippine number, server-generated code, TTL and optional device with Basic auth", async () => {
  let calls = 0;
  const mockFetch: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(String(url), "https://api.sms-gate.app/3rdparty/v1/messages");
    assert.equal(init?.method, "POST");
    const headers = new Headers(init?.headers);
    assert.equal(
      headers.get("Authorization"),
      "Basic " + Buffer.from("mock-user:mock-password").toString("base64"),
    );
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.phoneNumbers, ["+639171234567"]);
    assert.match(body.textMessage.text, /123456/);
    assert.equal(body.ttl, 600);
    assert.equal(body.deviceId, "device-fixture");
    assert.equal(body.priority, undefined);
    assert.ok(init?.signal);
    assert.equal(init?.redirect, "error");
    return Response.json(
      { id: "provider-message", state: "Pending" },
      { status: 202 },
    );
  };
  await deliverFinderOtp(
    normalizeFinderPhone("0917 123 4567"),
    "123456",
    600,
    { ...env, SMSGATE_DEVICE_ID: "device-fixture" },
    mockFetch,
  );
  assert.equal(calls, 1);
});
for (const status of [401, 403, 429, 500, 503])
  test("SMSGate safely rejects HTTP " + status, async () => {
    await assert.rejects(
      () =>
        deliverFinderOtp(
          "+639171234567",
          "123456",
          600,
          env,
          async () =>
            new Response("provider echoed mock-password 123456 +639171234567", {
              status,
            }),
        ),
      safeError,
    );
  });
function safeError(error: Error) {
  assert.ok(error instanceof FinderOtpDeliveryError);
  assert.equal(
    error.message,
    "Could not send the verification code right now. Please try again later.",
  );
  return true;
}
for (const value of [null, {}, { id: "" }, { id: "x", state: "Failed" }])
  test(
    "SMSGate rejects malformed or failed receipt " + JSON.stringify(value),
    async () => {
      await assert.rejects(
        () =>
          deliverFinderOtp("+639171234567", "123456", 600, env, async () =>
            Response.json(value),
          ),
        safeError,
      );
    },
  );
test("SMSGate masks network and timeout errors without logging credentials, code or phone", async () => {
  for (const failure of [
    new TypeError("network secret"),
    new DOMException("timeout secret", "TimeoutError"),
  ]) {
    await assert.rejects(
      () =>
        deliverFinderOtp("+639171234567", "123456", 600, env, async () => {
          throw failure;
        }),
      safeError,
    );
  }
});
test("OTP transport uses an actual bounded timeout", async () => {
  let aborted = false;
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      () =>
        deliverFinderOtp(
          "+639171234567",
          "123456",
          600,
          env,
          async (_url, init) => {
            return new Promise((_resolve, reject) =>
              init?.signal?.addEventListener(
                "abort",
                () => {
                  aborted = true;
                  reject(init.signal?.reason);
                },
                { once: true },
              ),
            );
          },
          20,
        ),
      safeError,
    );
    assert.equal(aborted, true);
  } finally {
    clearTimeout(keepAlive);
  }
});
test("webhook transport remains available with a timeout and bearer token", async () => {
  await deliverFinderOtp(
    "+639171234567",
    "123456",
    600,
    {
      FINDER_OTP_PROVIDER: "webhook",
      FINDER_OTP_WEBHOOK_URL: "https://sms.test/send",
      FINDER_OTP_WEBHOOK_TOKEN: "mock-token",
    },
    async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.to, "+639171234567");
      assert.equal(body.purpose, "petconnect_finder_verification");
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        "Bearer mock-token",
      );
      assert.ok(init?.signal);
      return new Response(null, { status: 204 });
    },
  );
});
test("production transport refuses console even when called directly", async () => {
  await assert.rejects(
    () =>
      deliverFinderOtp("+639171234567", "123456", 600, {
        NODE_ENV: "production",
        FINDER_OTP_PROVIDER: "console",
      }),
    safeError,
  );
});
