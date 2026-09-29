import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_INPUT_PIXELS = 25_000_000;
const MAX_DIMENSION = 8_000;
const OUTPUT_DIMENSION = 1_600;
const acceptedFormats = new Set(["jpeg", "png", "webp"]);

export class UploadValidationError extends Error {}

export async function sanitizePetPhoto(
  input: Buffer,
  uploadDir: string,
): Promise<{ relativeUrl: string; absolutePath: string }> {
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

  await fs.mkdir(uploadDir, { recursive: true, mode: 0o750 });
  const filename = `${randomUUID()}.webp`;
  const absolutePath = path.join(uploadDir, filename);
  const temporaryPath = `${absolutePath}.tmp`;

  try {
    const output = await image
      .rotate()
      .resize({
        width: OUTPUT_DIMENSION,
        height: OUTPUT_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();

    await fs.writeFile(temporaryPath, output, {
      flag: "wx",
      mode: 0o640,
    });
    await fs.rename(temporaryPath, absolutePath);
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => {});
    if (error instanceof UploadValidationError) throw error;
    throw new UploadValidationError("The image could not be processed safely.");
  }

  return {
    relativeUrl: `/uploads/${filename}`,
    absolutePath,
  };
}
