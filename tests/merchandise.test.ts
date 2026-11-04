import { it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { Database } from "./helpers";
import app, { type Env } from "../worker/index";
import { merchandiseCategories } from "../shared/merchandise";
it("adds exactly 100 unique demo records without overwriting existing prices or quotes, even on repeat", () => {
  const db = new Database("0010_private_suppliers.sql");
  try {
    db.db.exec("UPDATE products SET price=123456 WHERE id='pilot-dining'");
    const before = db.db.prepare("SELECT * FROM products ORDER BY id").all();
    db.db.exec(
      "INSERT INTO quotes(id,reference,product_id,product_snapshot,configuration,name,email,phone,area,consent) VALUES ('preserved-quote','AL-KEEP','pilot-dining','{}','{}','Synthetic pre-migration customer','','9000000000','',1)",
    );
    db.db.exec(
      "INSERT INTO owner_sessions(id,expires_at) VALUES ('synthetic-existing-session',4102444800000)",
    );
    const oldQuote = db.db.prepare("SELECT * FROM quotes").get();
    const oldSession = db.db.prepare("SELECT * FROM owner_sessions").get();
    const sql = readFileSync("migrations/0011_merchandise_catalog.sql", "utf8");
    db.db.exec(sql);
    db.db.exec(sql);
    expect(db.db.prepare("SELECT COUNT(*) n FROM products").get()?.n).toBe(129);
    for (const row of before)
      expect(
        db.db.prepare("SELECT * FROM products WHERE id=?").get(row.id),
      ).toEqual(row);
    expect(db.db.prepare("SELECT * FROM quotes").get()).toEqual(oldQuote);
    expect(db.db.prepare("SELECT * FROM owner_sessions").get()).toEqual(
      oldSession,
    );
    const additions = db.db
      .prepare("SELECT * FROM products WHERE id LIKE 'demo-%'")
      .all();
    expect(additions).toHaveLength(100);
    expect(new Set(additions.map((p) => p.name)).size).toBe(100);
    for (const c of merchandiseCategories) {
      expect(additions.filter((p) => p.category_id === c.id)).toHaveLength(10);
      const image = readFileSync(
        `public/assets/merchandise/${c.id}.svg`,
        "utf8",
      );
      expect(image).toContain("Demo placeholder");
      expect(
        statSync(`public/assets/merchandise/${c.id}.svg`).size,
      ).toBeLessThan(2000);
    }
    for (const p of additions) {
      expect(p.price).toBeNull();
      expect(p.status).toBe("concept");
      expect(p.model).toBeNull();
      expect(p.description).toContain(
        "not a product photograph or verified inventory",
      );
    }
  } finally {
    db.db.close();
  }
});
it("serves each new category and persists a valid merchandise inquiry while rejecting invalid options and unauthorized edits", async () => {
  const db = new Database();
  const env: Env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    SESSION_SECRET: "merchandise-fixture-secret-more-than-32-characters",
    EMAIL_MODE: "disabled",
  };
  const call = (path: string, method = "GET", body?: unknown) =>
    app.request(
      "http://127.0.0.1:8787/api" + path,
      {
        method,
        headers: {
          Origin: "http://127.0.0.1:8787",
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      },
      env,
    );
  try {
    for (const c of merchandiseCategories) {
      const data = await (
        await call(`/catalog?category_id=${c.id}`)
      ).json<any>();
      expect(data.products).toHaveLength(10);
      expect(data.products.every((p: any) => !("internal_cost" in p))).toBe(
        true,
      );
    }
    const payload = {
      product_id: "demo-shoes-01",
      name: "Isolated merchandise customer",
      phone: "9000000026",
      consent: true,
      website: "",
      submission_key: crypto.randomUUID(),
      configuration: {
        length: 20,
        width: 20,
        height: 10,
        material: "Size 8",
        color: "To confirm",
        notes: "Confirm size and stock",
      },
    };
    const saved = await call("/quotes", "POST", payload);
    expect(saved.status).toBe(201);
    expect((await saved.json<any>()).reference).toMatch(/^AL-/);
    expect((await call("/quotes", "POST", payload)).status).toBe(200);
    expect(
      (
        await call("/quotes", "POST", {
          ...payload,
          submission_key: crypto.randomUUID(),
          configuration: {
            ...payload.configuration,
            material: "Invented size",
          },
        })
      ).status,
    ).toBe(400);
    expect(db.db.prepare("SELECT COUNT(*) n FROM quotes").get()?.n).toBe(1);
    expect(
      JSON.parse(
        String(
          db.db.prepare("SELECT configuration FROM quotes").get()
            ?.configuration,
        ),
      ).material,
    ).toBe("Size 8");
    expect(
      (await call("/admin/products/demo-shoes-01", "PUT", { price: 1 })).status,
    ).toBe(401);
    expect((await call("/admin/suppliers")).status).toBe(401);
  } finally {
    db.db.close();
  }
});
