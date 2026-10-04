import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export class MediaStorageError extends Error {
  constructor() {
    super("The image storage service is temporarily unavailable.");
  }
}
export type MediaKind = "pet" | "finder";
export type StoredMedia = { relativeUrl: string; absolutePath?: string };
export type BeforeMediaWrite = (reference: string) => Promise<void>;
export interface MediaStorage {
  save(
    buffer: Buffer,
    kind: MediaKind,
    beforeWrite?: BeforeMediaWrite,
  ): Promise<StoredMedia>;
  read(reference: string): Promise<Buffer>;
  remove(reference: string): Promise<void>;
  owns(reference: string): boolean;
}

export class LocalMediaStorage implements MediaStorage {
  constructor(private directory: string) {}
  owns(reference: string): boolean {
    return /^\/uploads\/(?:recovery\/)?[a-f0-9-]+\.(?:webp|png|jpg)$/i.test(
      reference,
    );
  }
  private file(reference: string): string {
    if (!this.owns(reference)) throw new MediaStorageError();
    return path.join(this.directory, reference.slice("/uploads/".length));
  }
  async save(
    buffer: Buffer,
    kind: MediaKind,
    beforeWrite?: BeforeMediaWrite,
  ): Promise<StoredMedia> {
    const relativeUrl =
      "/uploads/" +
      (kind === "finder" ? "recovery/" : "") +
      randomUUID() +
      ".webp";
    const absolutePath = this.file(relativeUrl);
    await beforeWrite?.(relativeUrl);
    const temporary = absolutePath + ".tmp";
    try {
      await fs.mkdir(path.dirname(absolutePath), {
        recursive: true,
        mode: 0o750,
      });
      await fs.writeFile(temporary, buffer, { flag: "wx", mode: 0o640 });
      await fs.rename(temporary, absolutePath);
    } catch {
      await fs.unlink(temporary).catch(() => {});
      throw new MediaStorageError();
    }
    return { relativeUrl, absolutePath };
  }
  async read(reference: string): Promise<Buffer> {
    try {
      return await fs.readFile(this.file(reference));
    } catch {
      throw new MediaStorageError();
    }
  }
  async remove(reference: string): Promise<void> {
    const file = this.file(reference);
    try {
      await fs.unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw new MediaStorageError();
    }
  }
}

async function boundedBytes(
  response: Response,
  maximum: number,
): Promise<Buffer> {
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new MediaStorageError();
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maximum) throw new MediaStorageError();
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    await reader.cancel();
  }
}

class CloudinaryMediaStorage implements MediaStorage {
  private apiBase: string;
  private publicBase: string;
  constructor(
    private env: NodeJS.ProcessEnv,
    private fetcher: typeof fetch,
  ) {
    const cloud = env.CLOUDINARY_CLOUD_NAME;
    if (
      !cloud ||
      !/^[a-zA-Z0-9_-]+$/.test(cloud) ||
      !env.CLOUDINARY_API_KEY ||
      !env.CLOUDINARY_API_SECRET
    ) {
      throw new Error(
        "Cloudinary storage requires CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.",
      );
    }
    this.apiBase = "https://api.cloudinary.com/v1_1/" + cloud + "/image/";
    this.publicBase = "https://res.cloudinary.com/" + cloud + "/image/upload/";
  }
  private asset(reference: string): {
    publicId: string;
    type: "upload" | "authenticated";
  } {
    if (reference.startsWith("cloudinary:authenticated:")) {
      const publicId = reference.slice("cloudinary:authenticated:".length);
      if (/^petconnect\/finder\/[a-f0-9-]{36}$/.test(publicId))
        return { publicId, type: "authenticated" };
    }
    if (reference.startsWith(this.publicBase) && reference.endsWith(".webp")) {
      const publicId = reference.slice(this.publicBase.length, -".webp".length);
      if (/^petconnect\/pets\/[a-f0-9-]{36}$/.test(publicId))
        return { publicId, type: "upload" };
    }
    throw new MediaStorageError();
  }
  owns(reference: string): boolean {
    try {
      this.asset(reference);
      return true;
    } catch {
      return false;
    }
  }
  private signed(parameters: Record<string, string>): Record<string, string> {
    const values = {
      ...parameters,
      timestamp: String(Math.floor(Date.now() / 1000)),
    };
    const payload = Object.entries(values)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => key + "=" + value)
      .join("&");
    const signature = createHash("sha256")
      .update(payload + this.env.CLOUDINARY_API_SECRET)
      .digest("hex");
    return { ...values, api_key: this.env.CLOUDINARY_API_KEY!, signature };
  }
  private async json(
    operation: string,
    body: FormData | URLSearchParams,
  ): Promise<Record<string, unknown>> {
    const response = await this.fetcher(this.apiBase + operation, {
      method: "POST",
      body,
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    return JSON.parse(
      (await boundedBytes(response, 64 * 1024)).toString("utf8"),
    );
  }
  async save(
    buffer: Buffer,
    kind: MediaKind,
    beforeWrite?: BeforeMediaWrite,
  ): Promise<StoredMedia> {
    const publicId =
      "petconnect/" + (kind === "finder" ? "finder/" : "pets/") + randomUUID();
    const type = kind === "finder" ? "authenticated" : "upload";
    const relativeUrl =
      type === "authenticated"
        ? "cloudinary:authenticated:" + publicId
        : this.publicBase + publicId + ".webp";
    // Reserve retryable orphan cleanup before the provider sees a single byte.
    await beforeWrite?.(relativeUrl);
    try {
      const form = new FormData();
      for (const [key, value] of Object.entries(
        this.signed({ public_id: publicId, type, overwrite: "false" }),
      ))
        form.set(key, value);
      form.set(
        "file",
        new Blob([new Uint8Array(buffer)], { type: "image/webp" }),
        "normalized.webp",
      );
      const response = await this.json("upload", form);
      if (
        response.public_id !== publicId ||
        response.type !== type ||
        response.format !== "webp"
      )
        throw new Error();
      return { relativeUrl };
    } catch {
      throw new MediaStorageError();
    }
  }
  async read(reference: string): Promise<Buffer> {
    const asset = this.asset(reference);
    if (asset.type !== "authenticated") throw new MediaStorageError();
    try {
      // The signed URL never leaves the API. Authenticated assets protect originals
      // and transformations, and only the owner-authorized route calls this method.
      const query = new URLSearchParams(
        this.signed({
          public_id: asset.publicId,
          type: asset.type,
          format: "webp",
          expires_at: String(Math.floor(Date.now() / 1000) + 60),
        }),
      );
      const response = await this.fetcher(this.apiBase + "download?" + query, {
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.headers.get("content-type")?.startsWith("image/webp")) {
        await response.body?.cancel();
        throw new Error();
      }
      return await boundedBytes(response, 12 * 1024 * 1024);
    } catch {
      throw new MediaStorageError();
    }
  }
  async remove(reference: string): Promise<void> {
    const asset = this.asset(reference);
    try {
      const result = await this.json(
        "destroy",
        new URLSearchParams(
          this.signed({
            public_id: asset.publicId,
            type: asset.type,
            invalidate: "true",
          }),
        ),
      );
      if (result.result !== "ok" && result.result !== "not found")
        throw new Error();
    } catch {
      throw new MediaStorageError();
    }
  }
}

export function createMediaStorage(
  localDirectory: string,
  env: NodeJS.ProcessEnv = process.env,
  fetcher: typeof fetch = fetch,
): MediaStorage {
  const provider = (env.UPLOAD_STORAGE_PROVIDER || "local").toLowerCase();
  if (provider === "local") return new LocalMediaStorage(localDirectory);
  if (provider === "cloudinary")
    return new CloudinaryMediaStorage(env, fetcher);
  throw new Error("UPLOAD_STORAGE_PROVIDER must be local or cloudinary.");
}
