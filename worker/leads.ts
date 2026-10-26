import type { Hono } from "hono";
import { z } from "zod";
import type { Env } from "./index";
import { leadStages, stageStatus } from "../shared/leads";
type App = Hono<{ Bindings: Env; Variables: { session: string } }>;
export async function publicBusiness(env: Env) {
  const row = await env.DB.prepare(
    "SELECT phone,email,whatsapp,address,service_area,summary FROM business_profile WHERE id=1",
  ).first<Record<string, string | null>>();
  const values = {
    phone: env.BUSINESS_PHONE,
    email: env.BUSINESS_EMAIL,
    whatsapp: env.BUSINESS_WHATSAPP,
    address: env.BUSINESS_ADDRESS,
    service_area: env.BUSINESS_SERVICE_AREA,
    summary: env.BUSINESS_SUMMARY,
  };
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      (row?.[key] === null || row?.[key] === undefined ? value : row[key]) ||
        null,
    ]),
  ) as {
    phone: string | null;
    email: string | null;
    whatsapp: string | null;
    address: string | null;
    service_area: string | null;
    summary: string | null;
  };
}
const optional = (schema: z.ZodType) =>
  z.union([schema, z.literal(""), z.null()]);
const businessSchema = z
  .object({
    phone: optional(z.string().regex(/^[+\d ()-]{7,25}$/)),
    email: optional(z.string().email().max(254)),
    whatsapp: optional(z.string().regex(/^\+?[1-9]\d{6,14}$/)),
    address: optional(z.string().trim().max(500)),
    service_area: optional(z.string().trim().max(500)),
    summary: optional(z.string().trim().max(1200)),
  })
  .strict();
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    try {
      return (
        new Date(value + "T00:00:00Z").toISOString().slice(0, 10) === value
      );
    } catch {
      return false;
    }
  }, "Use a valid calendar date.")
  .nullable();
export function registerLeads(app: App) {
  app.get("/api/business", async (c) => c.json(await publicBusiness(c.env)));
  app.get("/api/admin/business", async (c) =>
    c.json(await publicBusiness(c.env)),
  );
  app.put("/api/admin/business", async (c) => {
    const input = businessSchema.parse(await c.req.json());
    await c.env.DB.prepare(
      "UPDATE business_profile SET phone=?,email=?,whatsapp=?,address=?,service_area=?,summary=? WHERE id=1",
    )
      .bind(
        input.phone,
        input.email,
        input.whatsapp,
        input.address,
        input.service_area,
        input.summary,
      )
      .run();
    return c.json({ ok: true });
  });
  app.put("/api/admin/leads/:id", async (c) => {
    const input = z
      .object({
        stage: z.enum(leadStages),
        owner_notes: z.string().trim().max(4000),
        follow_up_date: date,
      })
      .strict()
      .parse(await c.req.json());
    const existing = await c.env.DB.prepare(
      "SELECT status FROM quotes WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first<{ status: string }>();
    if (!existing) return c.json({ error: "Lead not found." }, 404);
    // Preserve a won order's more specific manufacturing/delivered stage.
    const status =
      input.stage === "Won" &&
      ["Confirmed", "Manufacturing", "Delivered"].includes(existing.status)
        ? existing.status
        : stageStatus[input.stage];
    await c.env.DB.prepare(
      "UPDATE quotes SET status=?,owner_notes=?,follow_up_date=? WHERE id=?",
    )
      .bind(status, input.owner_notes, input.follow_up_date, c.req.param("id"))
      .run();
    return c.json({ ok: true });
  });
}
