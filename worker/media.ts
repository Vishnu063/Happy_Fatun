import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import type { Env } from "./index";
import {
  queueRetiredMedia,
  flushMediaCleanup,
  mediaCleanupStatus,
} from "./media-cleanup";
type App = Hono<{ Bindings: Env; Variables: { session: string } }>;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const isImageUpload = (path: string, method: string) =>
  method === "POST" && /^\/api\/admin\/products\/[^/]+\/images$/.test(path);
/** Check signatures/container dimensions, rather than trusting filenames or MIME. */
export function imageType(bytes: Uint8Array): string | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (a: number, b: number) =>
    String.fromCharCode(...bytes.slice(a, b));
  const dimensions = (w: number, h: number) =>
    w > 0 && h > 0 && w <= 6000 && h <= 6000 && w * h <= 24000000;
  if (
    bytes.length >= 45 &&
    bytes[0] === 137 &&
    text(1, 4) === "PNG" &&
    view.getUint32(4) === 0x0d0a1a0a &&
    text(12, 16) === "IHDR" &&
    text(bytes.length - 8, bytes.length - 4) === "IEND"
  )
    return dimensions(view.getUint32(16), view.getUint32(20))
      ? "image/png"
      : null;
  if (
    bytes.length >= 30 &&
    text(0, 4) === "RIFF" &&
    text(8, 12) === "WEBP" &&
    view.getUint32(4, true) + 8 === bytes.length
  ) {
    const tag = text(12, 16);
    let w = 0,
      h = 0;
    if (tag === "VP8 " && text(23, 26) === "\x9d\x01\x2a") {
      w = view.getUint16(26, true) & 0x3fff;
      h = view.getUint16(28, true) & 0x3fff;
    } else if (tag === "VP8L" && bytes[20] === 0x2f) {
      const packed = view.getUint32(21, true);
      w = (packed & 0x3fff) + 1;
      h = ((packed >>> 14) & 0x3fff) + 1;
    } else if (tag === "VP8X") {
      w = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      h = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
    }
    return dimensions(w, h) ? "image/webp" : null;
  }
  if (
    bytes.length >= 20 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[bytes.length - 2] === 255 &&
    bytes[bytes.length - 1] === 217
  ) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 255) break;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if (length < 2) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker))
        return dimensions(
          view.getUint16(offset + 7),
          view.getUint16(offset + 5),
        )
          ? "image/jpeg"
          : null;
      offset += 2 + length;
    }
  }
  return null;
}
const changes = (r: unknown) =>
  Number(
    (r as { meta?: { changes?: number }; changes?: number }).meta?.changes ??
      (r as { changes?: number }).changes ??
      0,
  );
async function product(env: Env, id: string) {
  return env.DB.prepare("SELECT id,name,images,status FROM products WHERE id=?")
    .bind(id)
    .first<{ id: string; name: string; images: string; status: string }>();
}
async function gallery(env: Env, id: string) {
  const p = await product(env, id);
  if (!p) return null;
  const meta = await env.DB.prepare(
    "SELECT id,alt,kind,content_type,byte_size FROM media_objects WHERE product_id=?",
  )
    .bind(id)
    .all<{
      id: string;
      alt: string;
      kind: string;
      content_type: string;
      byte_size: number;
    }>();
  const overrides = await env.DB.prepare(
    "SELECT url,alt FROM product_image_text WHERE product_id=?",
  )
    .bind(id)
    .all<{ url: string; alt: string }>();
  return {
    status: p.status,
    images: (JSON.parse(p.images) as string[]).map((url, index) => {
      const m = meta.results.find((m) => url === `/media/${m.id}`);
      return {
        url,
        alt:
          overrides.results.find((t) => t.url === url)?.alt ||
          m?.alt ||
          `${p.name} — ${index === 0 ? "studio illustration" : index === 1 ? "room illustration" : `view ${index + 1}`}`,
        kind: m?.kind || (p.status === "concept" ? "illustrative" : "photo"),
        id: m?.id || null,
        content_type: m?.content_type || null,
        byte_size: m?.byte_size || null,
      };
    }),
  };
}
async function retire(env: Env, pid: string, url: string, key?: string) {
  await env.DB.prepare(
    `DELETE FROM product_image_text WHERE product_id=? AND url=? AND NOT EXISTS
    (SELECT 1 FROM products p,json_each(p.images) j WHERE p.id=? AND j.value=?)`,
  )
    .bind(pid, url, pid, url)
    .run();
  if (!url.startsWith("/media/")) return;
  if (key)
    await env.DB.prepare(
      `INSERT OR IGNORE INTO media_cleanup_queue(storage_key)
    SELECT ? WHERE NOT EXISTS (SELECT 1 FROM products p,json_each(p.images) j WHERE j.value=?)`,
    )
      .bind(key, url)
      .run();
  await queueRetiredMedia(env, url.slice(7));
  await flushMediaCleanup(env);
}
export function registerMedia(app: App) {
  app.get("/api/admin/media/cleanup", async (c) =>
    c.json(await mediaCleanupStatus(c.env)),
  );
  app.post("/api/admin/media/cleanup", async (c) => {
    if (!c.env.PRODUCT_IMAGES)
      return c.json({ error: "Image storage is not configured." }, 503);
    await queueRetiredMedia(c.env);
    await flushMediaCleanup(c.env);
    return c.json(await mediaCleanupStatus(c.env));
  });
  app.get("/api/products/:id/images", async (c) => {
    const result = await gallery(c.env, c.req.param("id"));
    return !result || result.status === "archived"
      ? c.json({ error: "Design not found." }, 404)
      : c.json({ images: result.images });
  });
  app.get("/api/admin/products/:id/images", async (c) => {
    const result = await gallery(c.env, c.req.param("id"));
    return result
      ? c.json({ images: result.images })
      : c.json({ error: "Design not found." }, 404);
  });
  app.get("/media/:id", async (c) => {
    if (!c.env.PRODUCT_IMAGES) return c.notFound();
    const meta = await c.env.DB.prepare(
      "SELECT m.storage_key,m.content_type FROM media_objects m JOIN products p ON p.id=m.product_id WHERE m.id=? AND EXISTS (SELECT 1 FROM json_each(p.images) WHERE value='/media/'||m.id)",
    )
      .bind(c.req.param("id"))
      .first<{ storage_key: string; content_type: string }>();
    if (!meta) return c.notFound();
    const object = await c.env.PRODUCT_IMAGES.get(meta.storage_key);
    if (!object) return c.notFound();
    return new Response(object.body, {
      headers: {
        "Content-Type": meta.content_type,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        ETag: object.httpEtag,
      },
    });
  });
  app.post(
    "/api/admin/products/:id/images",
    bodyLimit({
      maxSize: MAX_IMAGE_BYTES,
      onError: (c) => c.json({ error: "Images must be at most 5 MB." }, 413),
    }),
    async (c) => {
      if (!c.env.PRODUCT_IMAGES)
        return c.json({ error: "Image storage is not configured." }, 503);
      const p = await product(c.env, c.req.param("id"));
      if (!p) return c.json({ error: "Design not found." }, 404);
      const images = JSON.parse(p.images) as string[];
      const replacing = c.req.query("replace");
      const index = replacing === undefined ? images.length : Number(replacing);
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index > images.length ||
        (replacing !== undefined && index === images.length) ||
        index >= 12
      )
        return c.json(
          { error: "Choose a valid gallery position (up to 12 images)." },
          400,
        );
      let alt = "";
      try {
        alt = decodeURIComponent(c.req.header("X-Image-Alt") || "");
      } catch {
        return c.json({ error: "Invalid image description." }, 400);
      }
      const input = z
        .object({
          alt: z.string().trim().min(3).max(300),
          kind: z.enum(["illustrative", "photo"]),
        })
        .parse({ alt, kind: c.req.header("X-Image-Kind") });
      const bytes = new Uint8Array(await c.req.arrayBuffer());
      const mime = imageType(bytes);
      if (!mime || mime !== c.req.header("Content-Type")?.split(";")[0])
        return c.json(
          {
            error:
              "Upload a valid PNG, JPEG or WebP image, up to 6000px per side (24 megapixels). SVG and other file types are not accepted.",
          },
          400,
        );
      const id = crypto.randomUUID();
      const url = `/media/${id}`;
      const key = `products/${p.id}/${id}.${mime === "image/jpeg" ? "jpg" : mime.slice(6)}`;
      const old = images[index];
      images[index] = url;
      // Register before the external write so an interrupted upload is discoverable.
      // Staged entries are never public until the gallery CAS succeeds.
      await c.env.DB.prepare(
        "INSERT INTO media_objects (id,product_id,storage_key,content_type,byte_size,alt,kind) VALUES (?,?,?,?,?,?,?)",
      )
        .bind(id, p.id, key, mime, bytes.length, input.alt, input.kind)
        .run();
      try {
        await c.env.PRODUCT_IMAGES.put(key, bytes, {
          httpMetadata: { contentType: mime },
        });
        const result = await c.env.DB.batch([
          c.env.DB.prepare(
            "UPDATE products SET images=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND images=? AND EXISTS (SELECT 1 FROM media_objects WHERE id=?)",
          ).bind(JSON.stringify(images), p.id, p.images, id),
        ]);
        if (!changes(result[0])) {
          await retire(c.env, p.id, url, key);
          return c.json(
            { error: "Gallery changed in another session. Reload and retry." },
            409,
          );
        }
      } catch (error) {
        await retire(c.env, p.id, url, key);
        throw error;
      }
      if (old) await retire(c.env, p.id, old);
      return c.json({ url, id }, 201);
    },
  );
  app.put("/api/admin/products/:id/images/text", async (c) => {
    const { url, alt } = z
      .object({
        url: z.string().max(500),
        alt: z.string().trim().min(3).max(300),
      })
      .strict()
      .parse(await c.req.json());
    const p = await product(c.env, c.req.param("id"));
    if (!p) return c.json({ error: "Design not found." }, 404);
    if (!(JSON.parse(p.images) as string[]).includes(url))
      return c.json({ error: "Choose an existing gallery image." }, 400);
    await c.env.DB.prepare(
      `INSERT INTO product_image_text(product_id,url,alt) VALUES (?,?,?)
      ON CONFLICT(product_id,url) DO UPDATE SET alt=excluded.alt`,
    )
      .bind(p.id, url, alt)
      .run();
    return c.json({ ok: true });
  });
  app.put("/api/admin/products/:id/images/order", async (c) => {
    const input = z
      .object({ images: z.array(z.string()).min(1).max(12) })
      .parse(await c.req.json());
    const p = await product(c.env, c.req.param("id"));
    if (!p) return c.json({ error: "Design not found." }, 404);
    const current = JSON.parse(p.images) as string[];
    if (
      JSON.stringify([...input.images].sort()) !==
      JSON.stringify([...current].sort())
    )
      return c.json({ error: "Reorder the existing images only." }, 400);
    const result = await c.env.DB.prepare(
      "UPDATE products SET images=? WHERE id=? AND images=?",
    )
      .bind(JSON.stringify(input.images), p.id, p.images)
      .run();
    return changes(result)
      ? c.json({ ok: true })
      : c.json({ error: "Gallery changed. Reload and retry." }, 409);
  });
  app.delete("/api/admin/products/:id/images/:index", async (c) => {
    const p = await product(c.env, c.req.param("id"));
    if (!p) return c.json({ error: "Design not found." }, 404);
    const images = JSON.parse(p.images) as string[];
    const index = Number(c.req.param("index"));
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= images.length ||
      images.length <= 1
    )
      return c.json(
        { error: "Keep at least one image. Replace the last image instead." },
        400,
      );
    const [old] = images.splice(index, 1);
    const result = await c.env.DB.prepare(
      "UPDATE products SET images=? WHERE id=? AND images=?",
    )
      .bind(JSON.stringify(images), p.id, p.images)
      .run();
    if (!changes(result))
      return c.json({ error: "Gallery changed. Reload and retry." }, 409);
    await retire(c.env, p.id, old);
    return c.json({ ok: true });
  });
}
