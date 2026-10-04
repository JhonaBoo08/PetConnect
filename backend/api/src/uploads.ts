import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_INPUT_PIXELS = 25_000_000;
const MAX_DIMENSION = 8_000;
const OUTPUT_DIMENSION = 1_600;
const acceptedFormats = new Set(["jpeg", "png", "webp"]);

export class UploadValidationError extends Error {}

async function inspectImage(input: Buffer): Promise<sharp.Metadata> {
  if (!input.length) throw new UploadValidationError("Photo is empty.");

  const image = sharp(input, {
    failOn: "warning",
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
  });

  let metadata: sharp.Metadata;
  try {
    metadata = await image.metadata();
  } catch {
    throw new UploadValidationError("The uploaded file is not a valid image.");
  }

  if (
    !metadata.format ||
    !acceptedFormats.has(metadata.format) ||
    !metadata.width ||
    !metadata.height
  ) {
    throw new UploadValidationError(
      "Only valid JPEG, PNG, or WebP images are accepted.",
    );
  }
  if ((metadata.pages || 1) !== 1) {
    throw new UploadValidationError(
      "Animated or multi-page images are not accepted.",
    );
  }
  if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
    throw new UploadValidationError(
      `Photo dimensions must be at most ${MAX_DIMENSION}×${MAX_DIMENSION} pixels.`,
    );
  }
  return metadata;
}

async function normalizePhoto(input: Buffer): Promise<{
  buffer: Buffer;
  width: number;
  height: number;
}> {
  await inspectImage(input);
  try {
    const { data, info } = await sharp(input, {
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: false,
    })
      .rotate()
      .resize({
        width: OUTPUT_DIMENSION,
        height: OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      // Sharp does not preserve source EXIF/ICC/GPS metadata unless explicitly
      // requested with withMetadata(). Re-encoding therefore strips it.
      .webp({ quality: 82, effort: 4 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch {
    throw new UploadValidationError("The image could not be processed safely.");
  }
}

async function persistNormalized(
  normalized: { buffer: Buffer; width: number; height: number },
  uploadDir: string,
): Promise<{
  relativeUrl: string;
  absolutePath: string;
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}> {
  await fs.mkdir(uploadDir, { recursive: true, mode: 0o750 });
  const filename = `${randomUUID()}.webp`;
  const absolutePath = path.join(uploadDir, filename);
  const temporaryPath = `${absolutePath}.tmp`;

  try {
    await fs.writeFile(temporaryPath, normalized.buffer, {
      flag: "wx",
      mode: 0o640,
    });
    await fs.rename(temporaryPath, absolutePath);
  } catch {
    await fs.unlink(temporaryPath).catch(() => {});
    throw new UploadValidationError("The image could not be stored safely.");
  }

  return {
    relativeUrl: `/uploads/${path.relative(path.dirname(uploadDir), absolutePath).replaceAll("\\", "/")}`,
    absolutePath,
    byteSize: normalized.buffer.length,
    width: normalized.width,
    height: normalized.height,
    sha256: createHash("sha256").update(normalized.buffer).digest("hex"),
  };
}

export async function sanitizePetPhoto(
  input: Buffer,
  uploadDir: string,
): Promise<{ relativeUrl: string; absolutePath: string }> {
  const normalized = await normalizePhoto(input);
  const stored = await persistNormalized(normalized, uploadDir);
  // Preserve the historic top-level /uploads/<file> URL for pet photos.
  return {
    relativeUrl: `/uploads/${path.basename(stored.absolutePath)}`,
    absolutePath: stored.absolutePath,
  };
}

export async function sanitizeFinderPhoto(
  input: Buffer,
  uploadDir: string,
): Promise<{
  relativeUrl: string;
  absolutePath: string;
  mimeType: "image/webp";
  byteSize: number;
  width: number;
  height: number;
  sha256: string;
}> {
  const recoveryDir = path.join(uploadDir, "recovery");
  const normalized = await normalizePhoto(input);
  const stored = await persistNormalized(normalized, recoveryDir);
  return {
    ...stored,
    relativeUrl: `/uploads/recovery/${path.basename(stored.absolutePath)}`,
    mimeType: "image/webp",
  };
}
