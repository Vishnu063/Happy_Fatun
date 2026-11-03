import {
  mkdir,
  open,
  rename,
  unlink,
  readFile,
  stat,
  realpath,
} from "node:fs/promises";
import { constants } from "node:fs";
import { resolve, dirname, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
export interface MediaStore {
  get(key: string): Promise<{ body: Uint8Array; httpEtag: string } | null>;
  put(
    key: string,
    body: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ): Promise<void>;
  delete(key: string): Promise<void>;
  close?(): void;
}
const max = 5 * 1024 * 1024;
export function safeKey(key: string) {
  if (
    !/^[\w./-]{1,240}$/.test(key) ||
    key.startsWith("/") ||
    key.split("/").some((v) => !v || v === "." || v === "..")
  )
    throw new Error("Invalid storage key");
  return key;
}
export class FileMedia implements MediaStore {
  readonly root: string;
  constructor(root: string) {
    this.root = resolve(root);
  }
  private async path(key: string) {
    const path = resolve(this.root, safeKey(key));
    if (!path.startsWith(this.root + sep))
      throw new Error("Storage traversal rejected");
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const base = await realpath(this.root);
    let ancestor = dirname(path);
    for (;;) {
      try {
        const actual = await realpath(ancestor);
        if (actual !== base && !actual.startsWith(base + sep))
          throw new Error("Storage symlink rejected");
        break;
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        ancestor = dirname(ancestor);
      }
    }
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    return path;
  }
  async put(key: string, body: Uint8Array) {
    if (body.byteLength > max) throw new Error("Media exceeds limit");
    const target = await this.path(key),
      temp = target + "." + randomUUID() + ".tmp";
    try {
      const f = await open(temp, "wx", 0o600);
      try {
        await f.writeFile(body);
      } finally {
        await f.close();
      }
      await rename(temp, target);
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  async get(key: string) {
    const path = await this.path(key);
    try {
      const f = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        if ((await f.stat()).size > max) throw new Error("Media exceeds limit");
        const body = await f.readFile();
        return {
          body,
          httpEtag: '"' + createHash("sha256").update(body).digest("hex") + '"',
        };
      } finally {
        await f.close();
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  }
  async delete(key: string) {
    await unlink(await this.path(key)).catch((e) => {
      if (e.code !== "ENOENT") throw e;
    });
  }
}
export class S3Media implements MediaStore {
  constructor(
    readonly client: S3Client,
    readonly bucket: string,
  ) {}
  async put(
    key: string,
    body: Uint8Array,
    options: { httpMetadata: { contentType: string } },
  ) {
    if (body.byteLength > max) throw new Error("Media exceeds limit");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: safeKey(key),
        Body: body,
        ContentType: options.httpMetadata.contentType,
      }),
    );
  }
  async get(key: string) {
    try {
      const result = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }),
      );
      if (!result.Body) return null;
      if ((result.ContentLength ?? 0) > max)
        throw new Error("Media exceeds limit");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
        size += chunk.length;
        if (size > max) throw new Error("Media exceeds limit");
        chunks.push(chunk);
      }
      return {
        body: Buffer.concat(chunks),
        httpEtag: result.ETag || '"unavailable"',
      };
    } catch (e) {
      if ((e as { name: string }).name === "NoSuchKey") return null;
      throw e;
    }
  }
  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: safeKey(key) }),
    );
  }
  close() {
    this.client.destroy();
  }
}
export function mediaStore(env: NodeJS.ProcessEnv): MediaStore | undefined {
  if (env.MEDIA_DRIVER === "disabled") return undefined;
  if (env.MEDIA_DRIVER === "filesystem")
    return new FileMedia(env.MEDIA_ROOT || "/data/media");
  if (env.MEDIA_DRIVER === "s3") {
    if (!env.S3_BUCKET || !env.AWS_REGION)
      throw new Error("S3_BUCKET and AWS_REGION are required");
    if (env.S3_ENDPOINT) {
      let endpoint: URL;
      try {
        endpoint = new URL(env.S3_ENDPOINT);
      } catch {
        throw new Error("Invalid S3 endpoint; value redacted");
      }
      if (
        endpoint.username ||
        endpoint.password ||
        endpoint.search ||
        endpoint.hash ||
        (endpoint.protocol !== "https:" && env.ENVIRONMENT !== "development")
      )
        throw new Error(
          "S3 requires TLS in production and an endpoint without embedded credentials",
        );
    }
    return new S3Media(
      new S3Client({
        region: env.AWS_REGION,
        endpoint: env.S3_ENDPOINT,
        forcePathStyle: env.S3_FORCE_PATH_STYLE === "true",
        maxAttempts: 2,
        requestHandler: { connectionTimeout: 2000, requestTimeout: 5000 },
      }),
      env.S3_BUCKET,
    );
  }
  throw new Error(
    "Explicit MEDIA_DRIVER=filesystem, s3 or disabled is required",
  );
}
