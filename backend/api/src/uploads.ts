import { createHash } from "node:crypto";
import {
  LocalMediaStorage,
  type MediaStorage,
  type BeforeMediaWrite,
  type StoredMedia,
} from "./media-storage.js";
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

async function storePhoto(
  input: Buffer,
  destination: string | MediaStorage,
  kind: "pet" | "finder",
  beforeWrite?: BeforeMediaWrite,
) {
  const normalized = await normalizePhoto(input);
  const storage =
    typeof destination === "string"
      ? new LocalMediaStorage(destination)
      : destination;
  const stored = await storage.save(normalized.buffer, kind, beforeWrite);
  return {
    ...stored,
    byteSize: normalized.buffer.length,
    width: normalized.width,
    height: normalized.height,
    sha256: createHash("sha256").update(normalized.buffer).digest("hex"),
  };
}

export async function sanitizePetPhoto(
  input: Buffer,
  destination: string | MediaStorage,
  beforeWrite?: BeforeMediaWrite,
): Promise<StoredMedia> {
  return storePhoto(input, destination, "pet", beforeWrite);
}

export async function sanitizeFinderPhoto(
  input: Buffer,
  destination: string | MediaStorage,
  beforeWrite?: BeforeMediaWrite,
) {
  return {
    ...(await storePhoto(input, destination, "finder", beforeWrite)),
    mimeType: "image/webp" as const,
  };
}
