import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { sanitizePetPhoto, UploadValidationError } from "../src/uploads.js";

const tempDirs: string[] = [];

async function tempDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "petconnect-upload-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempDirs
      .splice(0)
      .map((dir) => fs.rm(dir, { recursive: true, force: true })),
  );
});

for (const format of ["jpeg", "png", "webp"] as const) {
  test(`sanitizePetPhoto accepts a real ${format.toUpperCase()} and re-encodes it as WebP`, async () => {
    const dir = await tempDir();
    const source = sharp({
      create: {
        width: 48,
        height: 32,
        channels: 4,
        background: { r: 30, g: 90, b: 120, alpha: 1 },
      },
    });
    const input =
      format === "jpeg"
        ? await source.jpeg().toBuffer()
        : format === "png"
          ? await source.png().toBuffer()
          : await source.webp().toBuffer();

    const result = await sanitizePetPhoto(input, dir);
    assert.match(result.relativeUrl, /^\/uploads\/[0-9a-f-]+\.webp$/i);
    assert.equal(path.dirname(result.absolutePath), dir);

    const storedBytes = await fs.readFile(result.absolutePath);
    const metadata = await sharp(storedBytes).metadata();
    assert.equal(metadata.format, "webp");
    assert.equal(metadata.width, 48);
    assert.equal(metadata.height, 32);
    assert.equal(metadata.exif, undefined);
    assert.equal(metadata.icc, undefined);
  });
}

test("sanitizePetPhoto rejects corrupt image bytes even when an HTTP MIME type could claim image/png", async () => {
  const dir = await tempDir();
  await assert.rejects(
    () => sanitizePetPhoto(Buffer.from("not a real png"), dir),
    (error: unknown) =>
      error instanceof UploadValidationError &&
      /valid image/i.test(error.message),
  );
});

test("sanitizePetPhoto rejects unsupported image formats", async () => {
  const dir = await tempDir();
  const gif = await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: { r: 1, g: 2, b: 3, alpha: 1 },
    },
  })
    .gif()
    .toBuffer();

  await assert.rejects(
    () => sanitizePetPhoto(gif, dir),
    (error: unknown) =>
      error instanceof UploadValidationError &&
      /JPEG, PNG, or WebP/i.test(error.message),
  );
});

test("sanitizePetPhoto rejects an accepted-format image beyond the dimension limit", async () => {
  const dir = await tempDir();
  const tooWide = await sharp({
    create: {
      width: 8001,
      height: 1,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
  })
    .png()
    .toBuffer();

  await assert.rejects(
    () => sanitizePetPhoto(tooWide, dir),
    (error: unknown) =>
      error instanceof UploadValidationError &&
      /at most 8000/i.test(error.message),
  );
});

test("sanitizePetPhoto rejects images that exceed the input pixel ceiling", async () => {
  const dir = await tempDir();
  const tooManyPixels = await sharp({
    create: {
      width: 5001,
      height: 5000,
      channels: 3,
      background: { r: 1, g: 2, b: 3 },
    },
    limitInputPixels: false,
  })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await assert.rejects(
    () => sanitizePetPhoto(tooManyPixels, dir),
    (error: unknown) =>
      error instanceof UploadValidationError &&
      /valid image/i.test(error.message),
  );
});
