import { registerSEO } from "./seo";
import { indianMobile } from "../shared/inquiries";
import { registerSuppliers } from "./suppliers";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { hmac, equal, passwordHash } from "./crypto";
import {
  authenticated,
  createSession,
  revokeSession,
  configuredSecret,
  developmentHost,
  SESSION_MS,
} from "./auth";
export { passwordHash } from "./crypto";
import { publicBusiness, registerLeads } from "./leads";
import { leadSources } from "../shared/leads";
import { registerMedia, isImageUpload, MAX_IMAGE_BYTES } from "./media";
import { flushMediaCleanup } from "./media-cleanup";
import { imageStorageUnavailable } from "../shared/media";
import {
  publicColumns,
  decode,
  publicProducts,
  publicCategories,
} from "./catalog";
export type Env = {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENVIRONMENT?: string;
  PREVIEW_MODE?: string;
  OWNER_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  EMAIL_MODE?: string;
  OWNER_EMAIL?: string;
  EMAIL_FROM?: string;
  RESEND_API_KEY?: string;
  BUSINESS_EMAIL?: string;
  BUSINESS_PHONE?: string;
  BUSINESS_WHATSAPP?: string;
  BUSINESS_ADDRESS?: string;
  BUSINESS_SERVICE_AREA?: string;
  BUSINESS_SUMMARY?: string;
  PRODUCT_IMAGES?: R2Bucket;
};
const app = new Hono<{ Bindings: Env; Variables: { session: string } }>();
async function limited(
  db: D1Database,
  key: string,
  maximum: number,
  seconds: number,
) {
  const now = Math.floor(Date.now() / 1000);
  // Atomic upsert prevents concurrent requests bypassing the limit.
  const row = await db
    .prepare(
      "INSERT INTO rate_limits (key,count,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at <= ? THEN 1 ELSE count+1 END, expires_at=CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING count",
    )
    .bind(key, now + seconds, now, now)
    .first<{ count: number }>();
  await db
    .prepare("DELETE FROM rate_limits WHERE expires_at < ?")
    .bind(now - 86400)
    .run();
  return (row?.count ?? maximum + 1) > maximum;
}
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  if (c.env.ENVIRONMENT === "development" && !developmentHost(c.req.url))
    return c.json(
      { error: "Development configuration is forbidden on a public host." },
      503,
    );
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (
      origin !== new URL(c.req.url).origin &&
      !(
        c.env.ENVIRONMENT === "development" &&
        ["http://localhost:5173", "http://127.0.0.1:5173"].includes(
          origin || "",
        )
      )
    )
      return c.json({ error: "Request origin is not allowed." }, 403);
    if (
      Number(c.req.header("Content-Length") || 0) >
      (isImageUpload(c.req.path, c.req.method) ? MAX_IMAGE_BYTES : 32768)
    )
      return c.json({ error: "Request is too large." }, 413);
  }
  await next();
});
app.use("/api/*", (c, next) =>
  isImageUpload(c.req.path, c.req.method)
    ? next()
    : bodyLimit({
        maxSize: 32768,
        onError: (c) => c.json({ error: "Request is too large." }, 413),
      })(c, next),
);
app.use("/api/admin/*", async (c, next) => {
  if (!(await authenticated(c.req.raw, c.env)))
    return c.json({ error: "Owner sign-in required." }, 401);
  await next();
});
app.onError((err, c) => {
  if (err instanceof z.ZodError)
    return c.json(
      {
        error: "Please check the submitted fields.",
        fields: err.flatten().fieldErrors,
      },
      400,
    );
  if (err instanceof SyntaxError)
    return c.json({ error: "Invalid JSON." }, 400);
  // Do not log customer input, credentials, SQL bind parameters, or provider responses.
  console.error("Request failed", { type: err.name });
  return c.json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
});
const statuses = [
  "New",
  "Reviewing",
  "Quoted",
  "Confirmed",
  "Manufacturing",
  "Delivered",
  "Closed",
] as const;
app.get("/api/catalog", async (c) => {
  const category = z
    .string()
    .max(80)
    .optional()
    .parse(c.req.query("category_id"));
  const [products, categories] = await Promise.all([
    publicProducts(c.env, { category }),
    publicCategories(c.env, category),
  ]);
  return c.json({
    products,
    categories,
    preview: c.env.PREVIEW_MODE === "true",
  });
});
app.get("/api/products/:id", async (c) => {
  const [product] = await publicProducts(c.env, { id: c.req.param("id") });
  return product
    ? c.json({ product })
    : c.json({ error: "Design not found." }, 404);
});
app.post("/api/auth/login", async (c) => {
  if (
    !c.env.OWNER_PASSWORD_HASH ||
    !c.env.SESSION_SECRET ||
    c.env.SESSION_SECRET.length < 32
  )
    return c.json({ error: "Owner authentication is not configured." }, 503);
  const ip = c.req.header("CF-Connecting-IP") || "local";
  const key = await hmac(`login:${ip}`, c.env.SESSION_SECRET);
  if (await limited(c.env.DB, key, 5, 900))
    return c.json(
      { error: "Too many sign-in attempts. Try again in 15 minutes." },
      429,
    );
  const { password } = z
    .object({ password: z.string().min(1).max(256) })
    .parse(await c.req.json());
  const [salt, expected] = c.env.OWNER_PASSWORD_HASH.split(":");
  if (
    !salt ||
    !expected ||
    !equal(await passwordHash(password, salt), expected)
  )
    return c.json({ error: "Incorrect owner credentials." }, 401);
  const token = await createSession(c.env);
  c.header(
    "Set-Cookie",
    `hf_session=${token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${SESSION_MS / 1000}${c.env.ENVIRONMENT === "development" ? "" : "; Secure"}`,
  );
  return c.json({ ok: true });
});
app.get("/api/auth/session", async (c) =>
  c.json({ authenticated: await authenticated(c.req.raw, c.env) }),
);
app.post("/api/auth/logout", async (c) => {
  await revokeSession(c.req.raw, c.env);
  c.header(
    "Set-Cookie",
    `hf_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0${c.env.ENVIRONMENT === "development" ? "" : "; Secure"}`,
  );
  return c.json({ ok: true });
});
const configuration = z
  .object({
    length: z.number().min(20).max(500),
    width: z.number().min(20).max(300),
    height: z.number().min(10).max(300),
    material: z.string().min(1).max(80),
    color: z.string().min(1).max(80),
    notes: z.string().trim().max(2000),
  })
  .strict();
const quoteInput = z
  .object({
    product_id: z.string().max(80),
    configuration,
    name: z.string().trim().min(2).max(100),
    email: z
      .union([z.string().trim().email().max(254), z.literal("")])
      .optional()
      .default(""),
    phone: z
      .string()
      .trim()
      .refine(
        (v) => indianMobile(v) !== null,
        "Enter a valid Indian mobile number.",
      )
      .transform((v) => indianMobile(v)!),
    area: z.string().trim().max(500).optional().default(""),
    consent: z.literal(true),
    website: z.string().max(0),
    source: z.enum(leadSources).default("direct"),
    submission_key: z.string().uuid().optional(),
  })
  .strict();
export async function notify(env: Env, id: string) {
  // Claim an attempt atomically; concurrent retries cannot send the same email.
  const claim = await env.DB.prepare(
    "UPDATE quotes SET email_status='sending', email_attempts=email_attempts+1,email_updated_at=CURRENT_TIMESTAMP WHERE id=? AND (email_status IN ('pending','failed','disabled','local') OR (email_status='sending' AND email_updated_at < datetime('now','-5 minutes'))) RETURNING reference,email_attempts",
  )
    .bind(id)
    .first<{ reference: string; email_attempts: number }>();
  if (!claim) return;
  let status = "disabled";
  if (env.EMAIL_MODE === "local" && env.ENVIRONMENT === "development")
    status = "local";
  else if (env.EMAIL_MODE === "resend") {
    status = "failed";
    if (
      env.RESEND_API_KEY &&
      env.OWNER_EMAIL &&
      env.EMAIL_FROM &&
      z.string().email().safeParse(env.OWNER_EMAIL).success
    ) {
      try {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": `quote-${id}`,
          },
          body: JSON.stringify({
            from: env.EMAIL_FROM,
            to: [env.OWNER_EMAIL],
            subject: `Aaranya Living inquiry ${claim.reference}`,
            text: `A new quote request ${claim.reference} is ready for review in your private owner dashboard. Sign in to view the customer details.`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        status = response.ok ? "sent" : "failed";
      } catch {
        status = "failed";
      }
    }
  }
  await env.DB.prepare(
    "UPDATE quotes SET email_status=?,email_updated_at=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(status, id)
    .run();
}
function quoteReceipt(
  reference: string,
  business: Awaited<ReturnType<typeof publicBusiness>>,
) {
  return {
    reference,
    contact: { email: business.email, phone: business.phone },
  };
}
app.post("/api/quotes", async (c) => {
  if (!configuredSecret(c.env))
    return c.json(
      {
        error:
          "Quote submission is not configured. Please try again after the owner completes setup.",
      },
      503,
    );
  const input = quoteInput.parse(await c.req.json());
  // Use a one-way IP digest; do not persist raw IP addresses.
  const key = await hmac(
    `quote:${c.req.header("CF-Connecting-IP") || "local"}`,
    c.env.SESSION_SECRET!,
  );
  if (await limited(c.env.DB, key, 10, 3600))
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  const { submission_key: clientKey, ...requestData } = input;
  const submissionKey = clientKey
    ? await hmac("quote-submission", clientKey)
    : null;
  const requestHash = clientKey
    ? await hmac(JSON.stringify(requestData), clientKey)
    : null;
  const findSubmission = () =>
    c.env.DB.prepare(
      "SELECT reference,request_hash FROM quotes WHERE submission_key=?",
    )
      .bind(submissionKey)
      .first<{ reference: string; request_hash: string | null }>();
  if (submissionKey) {
    const prior = await findSubmission();
    if (prior) {
      if (prior.request_hash !== requestHash)
        return c.json(
          {
            error:
              "This submission was already used for different details. Refresh before starting a new inquiry.",
          },
          409,
        );
      return c.json(
        quoteReceipt(prior.reference, await publicBusiness(c.env)),
        200,
      );
    }
  }
  const product = await c.env.DB.prepare(
    `SELECT ${publicColumns} FROM products WHERE id=? AND status != 'archived'`,
  )
    .bind(input.product_id)
    .first();
  if (!product)
    return c.json(
      { error: "This design is no longer available for inquiries." },
      404,
    );
  const decoded = decode(product);
  if (
    !(decoded.materials as string[]).includes(input.configuration.material) ||
    !(decoded.colors as string[]).includes(input.configuration.color)
  )
    return c.json({ error: "Choose a listed material and color." }, 400);
  const business = await publicBusiness(c.env);
  const id = crypto.randomUUID();
  const reference = `AL-${id.toUpperCase()}`;
  const inserted = await c.env.DB.prepare(
    "INSERT INTO quotes (id,reference,product_id,product_snapshot,configuration,name,email,phone,area,consent,source,submission_key,request_hash) VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?) ON CONFLICT(submission_key) DO NOTHING RETURNING id",
  )
    .bind(
      id,
      reference,
      input.product_id,
      JSON.stringify(decoded),
      JSON.stringify(input.configuration),
      input.name,
      input.email,
      input.phone,
      input.area,
      input.source,
      submissionKey,
      requestHash,
    )
    .first<{ id: string }>();
  if (!inserted) {
    const prior = await findSubmission();
    if (!prior || prior.request_hash !== requestHash)
      return c.json(
        {
          error:
            "This submission was already used for different details. Refresh before starting a new inquiry.",
        },
        409,
      );
    return c.json(quoteReceipt(prior.reference, business), 200);
  }
  // Persistence succeeds before attempting email. Email errors never turn a saved quote into a failed submission.
  try {
    await notify(c.env, id);
  } catch {
    console.error("Notification status could not be updated");
  }
  return c.json(quoteReceipt(reference, business), 201);
});
const asset = z
  .string()
  .max(500)
  .refine(
    (v) =>
      /^\/(?:assets|media)\/[a-zA-Z0-9_./-]+$/.test(v) ||
      (() => {
        try {
          return new URL(v).protocol === "https:";
        } catch {
          return false;
        }
      })(),
    "Use an /assets/ path or HTTPS URL.",
  );
const productInput = z
  .object({
    seo_title: z.string().trim().max(70).optional(),
    seo_description: z.string().trim().max(180).optional(),
    name: z.string().trim().min(2).max(120),
    category_id: z.string().min(1).max(80),
    description: z.string().trim().min(10).max(3000),
    material: z.string().min(1).max(80),
    finish: z.string().min(1).max(80),
    length: z.number().min(20).max(500),
    width: z.number().min(20).max(300),
    height: z.number().min(10).max(300),
    price: z.number().int().min(0).max(100000000).nullable(),
    status: z.enum(["concept", "available", "archived"]),
    images: z.array(asset).min(1).max(12),
    colors: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    materials: z.array(z.string().trim().min(1).max(80)).min(1).max(20),
    model: z.enum(["sofas", "dining", "desks"]).nullable(),
    internal_cost: z.number().int().min(0).max(100000000),
  })
  .strict();
app.get("/api/admin/data", async (c) => {
  const [products, quotes, audit, categories, settings] = await Promise.all(
    [
      `SELECT ${publicColumns},internal_cost FROM products ORDER BY name`,
      "SELECT * FROM quotes ORDER BY created_at DESC",
      "SELECT * FROM price_audit ORDER BY created_at DESC",
      "SELECT * FROM categories ORDER BY name",
      "SELECT * FROM settings WHERE id=1",
    ].map((q) => c.env.DB.prepare(q).all()),
  );
  return c.json({
    products: products.results.map(decode),
    quotes: quotes.results.map(
      ({ submission_key: _key, request_hash: _hash, ...q }) => ({
        ...q,
        configuration: JSON.parse(String(q.configuration)),
        product_snapshot: JSON.parse(String(q.product_snapshot)),
      }),
    ),
    audit: audit.results,
    categories: categories.results,
    settings: settings.results[0],
  });
});
app.post("/api/admin/products", async (c) => {
  const input = productInput.parse(await c.req.json());
  const id = crypto.randomUUID();
  if (
    !c.env.PRODUCT_IMAGES &&
    input.images.some((url) => url.startsWith("/media/"))
  )
    return c.json({ error: imageStorageUnavailable }, 503);
  if (
    !(await c.env.DB.prepare("SELECT id FROM categories WHERE id=?")
      .bind(input.category_id)
      .first())
  )
    return c.json({ error: "Choose an existing category." }, 400);
  const values = [
    id,
    input.name,
    input.category_id,
    input.description,
    input.material,
    input.finish,
    input.length,
    input.width,
    input.height,
    input.price,
    input.status,
    JSON.stringify(input.images),
    JSON.stringify(input.colors),
    JSON.stringify(input.materials),
    input.model,
    input.internal_cost,
    input.seo_title ?? "",
    input.seo_description ?? "",
  ];
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO products (id,name,category_id,description,material,finish,length,width,height,price,status,images,colors,materials,model,internal_cost,seo_title,seo_description) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
    ).bind(...values),
    c.env.DB.prepare(
      "INSERT INTO price_audit (id,product_id,old_price,new_price) VALUES (?,?,NULL,?)",
    ).bind(crypto.randomUUID(), id, input.price),
  ]);
  return c.json({ id }, 201);
});
app.put("/api/admin/products/:id", async (c) => {
  const input = productInput.parse(await c.req.json());
  const id = c.req.param("id");
  if (
    !(await c.env.DB.prepare("SELECT id FROM categories WHERE id=?")
      .bind(input.category_id)
      .first())
  )
    return c.json({ error: "Choose an existing category." }, 400);
  const old = await c.env.DB.prepare("SELECT price FROM products WHERE id=?")
    .bind(id)
    .first();
  if (!old) return c.json({ error: "Design not found." }, 404);
  // INSERT ... SELECT captures the old price within the same atomic batch as the update.
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO price_audit (id,product_id,old_price,new_price) SELECT ?,id,price,? FROM products WHERE id=? AND price IS NOT ?",
    ).bind(crypto.randomUUID(), input.price, id, input.price),
    c.env.DB.prepare(
      "UPDATE products SET name=?,category_id=?,description=?,material=?,finish=?,length=?,width=?,height=?,price=?,status=?,colors=?,materials=?,model=?,internal_cost=?,seo_title=COALESCE(?,seo_title),seo_description=COALESCE(?,seo_description),updated_at=CURRENT_TIMESTAMP WHERE id=?",
    ).bind(
      input.name,
      input.category_id,
      input.description,
      input.material,
      input.finish,
      input.length,
      input.width,
      input.height,
      input.price,
      input.status,
      JSON.stringify(input.colors),
      JSON.stringify(input.materials),
      input.model,
      input.internal_cost,
      input.seo_title ?? null,
      input.seo_description ?? null,
      id,
    ),
  ]);
  return c.json({ ok: true });
});
app.delete("/api/admin/products/:id", async (c) => {
  if (
    await c.env.DB.prepare(
      "SELECT id FROM product_suppliers WHERE product_id=? LIMIT 1",
    )
      .bind(c.req.param("id"))
      .first()
  )
    return c.json(
      {
        error:
          "Archive this product to preserve its supplier records; permanent deletion is blocked.",
      },
      409,
    );
  if (!c.env.PRODUCT_IMAGES) {
    // Check storage dependencies in the deletion itself, avoiding a check/delete race.
    await c.env.DB.prepare(
      `DELETE FROM products WHERE id=?
      AND NOT EXISTS (SELECT 1 FROM media_objects m WHERE m.product_id=products.id)
      AND NOT EXISTS (SELECT 1 FROM json_each(products.images) WHERE value LIKE '/media/%')`,
    )
      .bind(c.req.param("id"))
      .run();
    const retained = await c.env.DB.prepare(
      "SELECT id FROM products WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first();
    return retained
      ? c.json(
          {
            error:
              "Deleting products with uploaded images is unavailable in preview. Archive the design instead; its image records are preserved.",
          },
          503,
        )
      : c.json({ ok: true });
  }
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO media_cleanup_queue(storage_key,available_at)
      SELECT m.storage_key,CASE WHEN EXISTS
        (SELECT 1 FROM products p,json_each(p.images) j WHERE p.id=m.product_id AND j.value='/media/'||m.id)
        THEN CURRENT_TIMESTAMP ELSE datetime('now','+5 minutes') END
      FROM media_objects m WHERE m.product_id=?`,
    ).bind(c.req.param("id")),
    c.env.DB.prepare("DELETE FROM products WHERE id=?").bind(c.req.param("id")),
  ]);
  await flushMediaCleanup(c.env);
  return c.json({ ok: true });
});
app.post("/api/admin/categories", async (c) => {
  const { name } = z
    .object({ name: z.string().trim().min(2).max(80) })
    .parse(await c.req.json());
  const id = crypto.randomUUID();
  if (
    await c.env.DB.prepare(
      "SELECT id FROM categories WHERE lower(name)=lower(?)",
    )
      .bind(name)
      .first()
  )
    return c.json({ error: "Category already exists." }, 409);
  await c.env.DB.prepare("INSERT INTO categories(id,name) VALUES (?,?)")
    .bind(id, name)
    .run();
  return c.json({ id }, 201);
});
app.put("/api/admin/categories/:id", async (c) => {
  const { name, seo_title, seo_description } = z
    .object({
      name: z.string().trim().min(2).max(80),
      seo_title: z.string().trim().max(70).optional(),
      seo_description: z.string().trim().max(180).optional(),
    })
    .parse(await c.req.json());
  if (
    await c.env.DB.prepare(
      "SELECT id FROM categories WHERE lower(name)=lower(?) AND id != ?",
    )
      .bind(name, c.req.param("id"))
      .first()
  )
    return c.json({ error: "Category already exists." }, 409);
  await c.env.DB.prepare(
    "UPDATE categories SET name=?,seo_title=COALESCE(?,seo_title),seo_description=COALESCE(?,seo_description) WHERE id=?",
  )
    .bind(name, seo_title ?? null, seo_description ?? null, c.req.param("id"))
    .run();
  return c.json({ ok: true });
});
app.delete("/api/admin/categories/:id", async (c) => {
  const id = c.req.param("id");
  if (
    await c.env.DB.prepare(
      "SELECT id FROM products WHERE category_id=? LIMIT 1",
    )
      .bind(id)
      .first()
  )
    return c.json(
      { error: "Move or delete the products in this category first." },
      409,
    );
  await c.env.DB.prepare("DELETE FROM categories WHERE id=?").bind(id).run();
  return c.json({ ok: true });
});
app.put("/api/admin/settings", async (c) => {
  const { minimum_margin } = z
    .object({ minimum_margin: z.number().min(0).max(99) })
    .parse(await c.req.json());
  await c.env.DB.prepare("UPDATE settings SET minimum_margin=? WHERE id=1")
    .bind(minimum_margin)
    .run();
  return c.json({ ok: true });
});
app.put("/api/admin/quotes/:id", async (c) => {
  const input = z
    .object({
      status: z.enum(statuses),
      internal_cost: z.number().int().min(0).max(100000000),
      final_price: z.number().int().positive().max(100000000).nullable(),
    })
    .strict()
    .parse(await c.req.json());
  const existing = await c.env.DB.prepare("SELECT id FROM quotes WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (!existing) return c.json({ error: "Inquiry not found." }, 404);
  await c.env.DB.prepare(
    "UPDATE quotes SET status=?,internal_cost=?,final_price=? WHERE id=?",
  )
    .bind(
      input.status,
      input.internal_cost,
      input.final_price,
      c.req.param("id"),
    )
    .run();
  const settings = await c.env.DB.prepare(
    "SELECT minimum_margin FROM settings WHERE id=1",
  ).first<{ minimum_margin: number }>();
  const margin = input.final_price
    ? ((input.final_price - input.internal_cost) / input.final_price) * 100
    : null;
  return c.json({
    ok: true,
    margin,
    warning:
      margin !== null && margin < (settings?.minimum_margin ?? 20)
        ? "This quote is below the minimum margin."
        : null,
  });
});
app.delete("/api/admin/quotes/:id/personal-data", async (c) => {
  const result = await c.env.DB.prepare(
    `UPDATE quotes SET name='Deleted inquiry',email='',phone='',area='',owner_notes='',follow_up_date=NULL,
    configuration=json_set(configuration,'$.notes','') WHERE id=? RETURNING id`,
  )
    .bind(c.req.param("id"))
    .first();
  return result
    ? c.json({ ok: true })
    : c.json({ error: "Inquiry not found." }, 404);
});
app.post("/api/admin/quotes/:id/retry", async (c) => {
  if (
    !(await c.env.DB.prepare("SELECT id FROM quotes WHERE id=?")
      .bind(c.req.param("id"))
      .first())
  )
    return c.json({ error: "Inquiry not found." }, 404);
  await notify(c.env, c.req.param("id"));
  return c.json({ ok: true });
});
registerSuppliers(app);
registerMedia(app);
registerLeads(app);
app.get("/api/health", (c) => c.json({ ok: true }));
app.all("/api/*", (c) => c.json({ error: "Endpoint not found." }, 404));
registerSEO(app);
export default app;
