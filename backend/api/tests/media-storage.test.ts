import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { createMediaStorage, MediaStorageError } from "../src/media-storage.js";
import { sanitizeFinderPhoto, sanitizePetPhoto } from "../src/uploads.js";

const env = {
  UPLOAD_STORAGE_PROVIDER: "cloudinary",
  CLOUDINARY_CLOUD_NAME: "mock-cloud",
  CLOUDINARY_API_KEY: "12345",
  CLOUDINARY_API_SECRET: "mock-secret",
};
async function inputImage() {
  return sharp({
    create: { width: 120, height: 80, channels: 3, background: "#53874c" },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
}
function checkSignature(form: FormData | URLSearchParams) {
  const params = [...form.entries()]
    .filter(([k]) => !["file", "api_key", "signature"].includes(k))
    .map(([k, v]) => [k, String(v)])
    .sort(([a], [b]) => a.localeCompare(b));
  const expected = createHash("sha256")
    .update(
      params.map(([k, v]) => k + "=" + v).join("&") + env.CLOUDINARY_API_SECRET,
    )
    .digest("hex");
  assert.equal(form.get("signature"), expected);
  assert.equal(form.get("api_key"), "12345");
}
test("Cloudinary receives only rotated normalized WebP without EXIF/ICC and a signed server upload", async () => {
  let reserved = "";
  const storage = createMediaStorage("unused", env, async (url, init) => {
    assert.match(
      String(url),
      /^https:\/\/api\.cloudinary\.com\/v1_1\/mock-cloud\/image\/upload$/,
    );
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    const form = init?.body as FormData;
    checkSignature(form);
    assert.equal(form.get("type"), "upload");
    assert.equal(form.get("overwrite"), "false");
    const file = form.get("file") as Blob;
    assert.equal(file.type, "image/webp");
    const metadata = await sharp(
      Buffer.from(await file.arrayBuffer()),
    ).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 80);
    assert.equal(metadata.height, 120);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
    assert.ok(reserved, "orphan cleanup is reserved before provider mutation");
    return Response.json({
      public_id: form.get("public_id"),
      format: "webp",
      type: "upload",
    });
  });
  const result = await sanitizePetPhoto(
    await inputImage(),
    storage,
    async (ref) => {
      reserved = ref;
    },
  );
  assert.equal(result.relativeUrl, reserved);
  assert.match(
    result.relativeUrl,
    /^https:\/\/res\.cloudinary\.com\/mock-cloud\/image\/upload\/petconnect\/pets\/[0-9a-f-]+\.webp$/,
  );
  assert.equal(result.absolutePath, undefined);
});
test("finder media is authenticated; retrieval stays server-side and uses an expiring signed URL", async () => {
  const image = await sharp(await inputImage())
    .webp()
    .toBuffer();
  const storage = createMediaStorage("unused", env, async (url, init) => {
    if (init?.method === "POST") {
      const form = init.body as FormData;
      assert.equal(form.get("type"), "authenticated");
      assert.match(String(form.get("public_id")), /^petconnect\/finder\//);
      checkSignature(form);
      return Response.json({
        public_id: form.get("public_id"),
        type: "authenticated",
        format: "webp",
      });
    }
    const parsed = new URL(String(url));
    assert.equal(parsed.origin, "https://api.cloudinary.com");
    assert.equal(parsed.pathname, "/v1_1/mock-cloud/image/download");
    assert.equal(parsed.searchParams.get("type"), "authenticated");
    assert.equal(parsed.searchParams.get("format"), "webp");
    assert.ok(
      Number(parsed.searchParams.get("expires_at")) -
        Math.floor(Date.now() / 1000) <=
        60,
    );
    checkSignature(parsed.searchParams);
    return new Response(new Uint8Array(image), {
      headers: { "Content-Type": "image/webp" },
    });
  });
  const result = await sanitizeFinderPhoto(await inputImage(), storage);
  assert.match(
    result.relativeUrl,
    /^cloudinary:authenticated:petconnect\/finder\/[0-9a-f-]+$/,
  );
  assert.equal(result.absolutePath, undefined);
  assert.deepEqual(await storage.read(result.relativeUrl), image);
});
test("Cloudinary removal uses the correct delivery type and invalidates caches; missing is idempotent", async () => {
  const calls: string[] = [];
  const storage = createMediaStorage("unused", env, async (_url, init) => {
    const form = init?.body as URLSearchParams;
    checkSignature(form);
    assert.equal(form.get("invalidate"), "true");
    calls.push(String(form.get("type")));
    return Response.json({ result: calls.length === 1 ? "ok" : "not found" });
  });
  const id = "12345678-1234-4123-8123-123456789abc";
  await storage.remove(
    "https://res.cloudinary.com/mock-cloud/image/upload/petconnect/pets/" +
      id +
      ".webp",
  );
  await storage.remove("cloudinary:authenticated:petconnect/finder/" + id);
  assert.deepEqual(calls, ["upload", "authenticated"]);
});
test("storage rejects forged external paths and unsupported providers before any network call", async () => {
  let called = false;
  const storage = createMediaStorage("unused", env, async () => {
    called = true;
    throw new Error();
  });
  for (const ref of [
    "https://evil.test/image.webp",
    "https://res.cloudinary.com/another-cloud/image/upload/petconnect/pets/a.webp",
    "cloudinary:authenticated:../../file",
  ]) {
    await assert.rejects(() => storage.read(ref), MediaStorageError);
    await assert.rejects(() => storage.remove(ref), MediaStorageError);
  }
  assert.equal(called, false);
  assert.throws(
    () => createMediaStorage("unused", { UPLOAD_STORAGE_PROVIDER: "unknown" }),
    /UPLOAD_STORAGE_PROVIDER/,
  );
});
test("provider failures are generic and keep failed deletion retryable", async () => {
  const awaitedImage = await inputImage();
  for (const mock of [
    async () => new Response("mock-secret provider details", { status: 401 }),
    async () => Response.json({ unexpected: true }),
    async () => {
      throw new Error("mock-secret network failure");
    },
  ]) {
    const storage = createMediaStorage("unused", env, mock);
    await assert.rejects(
      () => sanitizePetPhoto(Buffer.from("bad image"), storage),
      /valid image/,
    );
    await assert.rejects(
      () => sanitizePetPhoto(awaitedImage, storage),
      (e: Error) =>
        e instanceof MediaStorageError && !e.message.includes("mock-secret"),
    );
    await assert.rejects(
      () =>
        storage.remove(
          "cloudinary:authenticated:petconnect/finder/12345678-1234-4123-8123-123456789abc",
        ),
      MediaStorageError,
    );
  }
});
