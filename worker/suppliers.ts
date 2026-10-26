import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./index";
import { availabilityOptions } from "../shared/suppliers";
type App = Hono<{ Bindings: Env; Variables: { session: string } }>;
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
const money = z
  .number()
  .int()
  .min(0)
  .max(100000000)
  .nullable()
  .optional()
  .transform((v) => v ?? null);
const shopInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    location: text(160),
    address: text(500),
    phone: z
      .union([
        z
          .string()
          .trim()
          .regex(/^[+\d ()-]{7,30}$/)
          .refine((v) => (v.match(/\d/g) || []).length >= 7),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((v) => v || null),
    notes: text(3000),
  })
  .strict();
const terms = z
  .object({
    supplier_cost: money,
    selling_price: money,
    availability: z
      .enum(
        Object.keys(availabilityOptions) as [
          "unknown",
          "confirm",
          "available",
          "unavailable",
        ],
      )
      .default("unknown"),
    lead_time: text(160),
    notes: text(3000),
  })
  .strict();
const linkInput = terms.extend({
  product_id: z.string().min(1).max(80),
  supplier_id: z.string().min(1).max(80),
});
const changed = (result: unknown) =>
  Number(
    (result as { meta?: { changes?: number }; changes?: number }).meta
      ?.changes ??
      (result as { changes?: number }).changes ??
      0,
  );
export function registerSuppliers(app: App) {
  app.get("/api/admin/suppliers", async (c) => {
    const [suppliers, links] = await Promise.all([
      c.env.DB.prepare(
        "SELECT id,name,location,address,phone,notes,archived,updated_at FROM suppliers ORDER BY name,id",
      ).all(),
      c.env.DB.prepare(
        `SELECT l.id,l.product_id,l.supplier_id,l.supplier_cost,l.selling_price,l.availability,l.lead_time,l.notes,l.archived,l.updated_at,
        p.name AS product_name,s.name AS shop_name,s.location,s.phone,s.address,s.archived AS shop_archived
        FROM product_suppliers l JOIN products p ON p.id=l.product_id JOIN suppliers s ON s.id=l.supplier_id ORDER BY p.name,s.name,l.id`,
      ).all(),
    ]);
    return c.json({ suppliers: suppliers.results, links: links.results });
  });
  app.post("/api/admin/suppliers", async (c) => {
    const p = shopInput.parse(await c.req.json()),
      id = crypto.randomUUID();
    await c.env.DB.prepare(
      "INSERT INTO suppliers(id,name,location,address,phone,notes) VALUES (?,?,?,?,?,?)",
    )
      .bind(id, p.name, p.location, p.address, p.phone, p.notes)
      .run();
    return c.json({ id }, 201);
  });
  app.put("/api/admin/suppliers/:id", async (c) => {
    const p = shopInput.parse(await c.req.json());
    const r = await c.env.DB.prepare(
      "UPDATE suppliers SET name=?,location=?,address=?,phone=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(p.name, p.location, p.address, p.phone, p.notes, c.req.param("id"))
      .run();
    return changed(r)
      ? c.json({ ok: true })
      : c.json({ error: "Shop not found." }, 404);
  });
  app.post("/api/admin/product-suppliers", async (c) => {
    const p = linkInput.parse(await c.req.json()),
      id = crypto.randomUUID();
    const r = await c.env.DB.prepare(
      `INSERT INTO product_suppliers(id,product_id,supplier_id,supplier_cost,selling_price,availability,lead_time,notes)
      SELECT ?,p.id,s.id,?,?,?,?,? FROM products p,suppliers s WHERE p.id=? AND s.id=? AND s.archived=0
      ON CONFLICT(product_id,supplier_id) DO NOTHING`,
    )
      .bind(
        id,
        p.supplier_cost,
        p.selling_price,
        p.availability,
        p.lead_time,
        p.notes,
        p.product_id,
        p.supplier_id,
      )
      .run();
    return changed(r)
      ? c.json({ id }, 201)
      : c.json(
          {
            error:
              "Link already exists, shop is archived, or product/shop is missing. Reload and edit/restore an existing link.",
          },
          409,
        );
  });
  app.put("/api/admin/product-suppliers/:id", async (c) => {
    const p = terms.parse(await c.req.json());
    const r = await c.env.DB.prepare(
      `UPDATE product_suppliers SET supplier_cost=?,selling_price=?,availability=?,lead_time=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    )
      .bind(
        p.supplier_cost,
        p.selling_price,
        p.availability,
        p.lead_time,
        p.notes,
        c.req.param("id"),
      )
      .run();
    return changed(r)
      ? c.json({ ok: true })
      : c.json({ error: "Supplier link not found." }, 404);
  });
  app.patch("/api/admin/suppliers/:id/archive", async (c) => {
    const p = z
      .object({ archived: z.boolean() })
      .strict()
      .parse(await c.req.json());
    const r = await c.env.DB.prepare(
      "UPDATE suppliers SET archived=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
    )
      .bind(Number(p.archived), c.req.param("id"))
      .run();
    return changed(r)
      ? c.json({ ok: true })
      : c.json({ error: "Shop not found." }, 404);
  });
  app.patch("/api/admin/product-suppliers/:id/archive", async (c) => {
    const p = z
      .object({ archived: z.boolean() })
      .strict()
      .parse(await c.req.json());
    const r = await c.env.DB.prepare(
      `UPDATE product_suppliers SET archived=?,updated_at=CURRENT_TIMESTAMP WHERE id=?
      AND (?=1 OR EXISTS (SELECT 1 FROM suppliers s WHERE s.id=product_suppliers.supplier_id AND s.archived=0))`,
    )
      .bind(Number(p.archived), c.req.param("id"), Number(p.archived))
      .run();
    return changed(r)
      ? c.json({ ok: true })
      : c.json(
          { error: "Link is missing or its shop must be restored first." },
          409,
        );
  });
}
