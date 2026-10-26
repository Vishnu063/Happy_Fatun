import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import app, { passwordHash, type Env } from "../worker/index";
import { Database } from "./helpers";
import { supplierMargin } from "../shared/suppliers";
let db: Database, env: Env, cookie: string;
const base = "https://aaranya.example.test",
  password = "isolated-supplier-owner-password";
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  owner = true,
  headers: Record<string, string> = {},
) {
  return app.request(
    base + "/api" + path,
    {
      method,
      headers: {
        Origin: base,
        "Content-Type": "application/json",
        ...(owner ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
async function login() {
  const r = await call("/auth/login", "POST", { password }, false);
  expect(r.status).toBe(200);
  cookie = r.headers.get("Set-Cookie")!.split(";")[0];
}
const inquiry = {
  product_id: "pilot-dining",
  configuration: {
    length: 220,
    width: 100,
    height: 75,
    material: "Oak",
    color: "Natural",
    notes: "Isolated customer request",
  },
  name: "Private Fixture Customer",
  phone: "+91 9000000099",
  email: "private@example.test",
  area: "Fixture locality",
  consent: true,
  website: "",
};
async function shop(name: string, extra: Record<string, unknown> = {}) {
  const r = await call("/admin/suppliers", "POST", { name, ...extra });
  expect(r.status).toBe(201);
  return (await r.json<any>()).id as string;
}
async function link(supplier_id: string, extra: Record<string, unknown> = {}) {
  return call("/admin/product-suppliers", "POST", {
    product_id: "pilot-dining",
    supplier_id,
    ...extra,
  });
}
beforeEach(async () => {
  db = new Database();
  env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "production",
    PREVIEW_MODE: "true",
    SESSION_SECRET: "supplier-test-session-secret-at-least-32-characters",
    OWNER_PASSWORD_HASH: `supplier-salt:${await passwordHash(password, "supplier-salt")}`,
    EMAIL_MODE: "disabled",
  };
  cookie = "";
});
afterEach(() => {
  db.db.close();
  vi.restoreAllMocks();
});
describe("private normalized shop and supplier records", () => {
  it("enforces owner authorization and origin checks across reads, edits and archives", async () => {
    const paths = [
      ["/admin/suppliers", "GET"],
      ["/admin/suppliers", "POST"],
      ["/admin/suppliers/fake", "PUT"],
      ["/admin/suppliers/fake/archive", "PATCH"],
      ["/admin/product-suppliers", "POST"],
      ["/admin/product-suppliers/fake", "PUT"],
      ["/admin/product-suppliers/fake/archive", "PATCH"],
    ];
    for (const [path, method] of paths)
      expect(
        (await call(path, method, method === "GET" ? undefined : {}, false))
          .status,
      ).toBe(401);
    await login();
    for (const [path, method] of paths.filter(([, m]) => m !== "GET")) {
      expect(
        (
          await call(path, method, {}, true, {
            Origin: "https://untrusted.example",
          })
        ).status,
      ).toBe(403);
      expect((await call(path, method, {}, true, { Origin: "" })).status).toBe(
        403,
      );
    }
    expect((await call("/suppliers", "GET", undefined, false)).status).toBe(
      404,
    );
  });
  it("links multiple shops, keeps optional fields unknown, updates normalized contacts, and rejects duplicate pairs atomically", async () => {
    await login();
    const a = await shop("Private Alpha Shop", {
        location: "Fixture East",
        phone: "+91 9000000041",
        address: "PRIVATE ADDRESS",
        notes: "PRIVATE SHOP NOTES",
      }),
      b = await shop("Private Beta Shop");
    const first = await link(a, {
      supplier_cost: 800000,
      selling_price: 1200000,
      lead_time: "Owner review required",
      notes: "PRIVATE LINK NOTE",
    });
    expect(first.status).toBe(201);
    const duplicate = await Promise.all([link(b), link(b)]);
    expect(duplicate.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await link("missing")).status).toBe(409);
    let data = await (await call("/admin/suppliers")).json<any>();
    expect(data.suppliers).toHaveLength(2);
    expect(data.links).toHaveLength(2);
    const beta = data.links.find(
      (l: { supplier_id: string }) => l.supplier_id === b,
    );
    expect(beta).toMatchObject({
      supplier_cost: null,
      selling_price: null,
      availability: "unknown",
      lead_time: null,
      notes: null,
      location: null,
      phone: null,
    });
    expect(
      (
        await call("/admin/suppliers/" + a, "PUT", {
          name: "Private Alpha Updated",
          location: "Fixture West",
          phone: "",
          address: "",
          notes: "",
        })
      ).status,
    ).toBe(200);
    data = await (await call("/admin/suppliers")).json<any>();
    expect(
      data.links.find((l: { supplier_id: string }) => l.supplier_id === a),
    ).toMatchObject({
      shop_name: "Private Alpha Updated",
      location: "Fixture West",
      phone: null,
      address: null,
    });
    expect(
      (
        await call("/admin/product-suppliers/" + beta.id, "PUT", {
          supplier_cost: 0,
          selling_price: 100000,
          availability: "available",
        })
      ).status,
    ).toBe(200);
    expect(supplierMargin(0, 100000)).toBe(100);
    expect(supplierMargin(800000, 1200000)).toBeCloseTo(33.3333);
    expect(supplierMargin(1200000, 800000)).toBe(-50);
    expect(supplierMargin(null, 100)).toBeNull();
    expect(supplierMargin(0, 0)).toBeNull();
    expect(
      db.db
        .prepare("SELECT status,price FROM products WHERE id='pilot-dining'")
        .get(),
    ).toMatchObject({ status: "concept", price: null });
  });
  it("archives and restores without clearing terms, blocks archived-shop links and protects product history", async () => {
    await login();
    const s = await shop("Private Archive Shop");
    const r = await link(s, {
      supplier_cost: 250000,
      selling_price: 400000,
      notes: "Preserve these terms",
      availability: "confirm",
    });
    const { id } = await r.json<any>();
    expect(
      (
        await call("/admin/product-suppliers/" + id + "/archive", "PATCH", {
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/admin/suppliers/" + s + "/archive", "PATCH", {
          archived: true,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/admin/product-suppliers", "POST", {
          product_id: "pilot-bed",
          supplier_id: s,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("/admin/product-suppliers/" + id + "/archive", "PATCH", {
          archived: false,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await call("/admin/suppliers/" + s + "/archive", "PATCH", {
          archived: false,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/admin/product-suppliers/" + id + "/archive", "PATCH", {
          archived: false,
        })
      ).status,
    ).toBe(200);
    expect(
      db.db
        .prepare(
          "SELECT supplier_cost,selling_price,notes,archived FROM product_suppliers WHERE id=?",
        )
        .get(id),
    ).toMatchObject({
      supplier_cost: 250000,
      selling_price: 400000,
      notes: "Preserve these terms",
      archived: 0,
    });
    expect((await call("/admin/products/pilot-dining", "DELETE")).status).toBe(
      409,
    );
    expect(() =>
      db.db.prepare("DELETE FROM products WHERE id='pilot-dining'").run(),
    ).toThrow();
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM product_suppliers").get()?.n,
    ).toBe(1);
  });
  it("rejects invalid costs, fields, phones, references and malformed bodies without persistence or PII logs", async () => {
    await login();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (
        await call("/admin/suppliers", "POST", {
          name: "x",
          phone: "PRIVATE INVALID PHONE",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/admin/suppliers", "POST", {
          name: "Valid test name",
          phone: "-------",
        })
      ).status,
    ).toBe(400);
    expect(db.db.prepare("SELECT COUNT(*) n FROM suppliers").get()?.n).toBe(0);
    const s = await shop("Private Validation Shop");
    for (const invalid of [
      { supplier_cost: -1 },
      { selling_price: 0.5 },
      { supplier_cost: 100000001 },
      { availability: "guaranteed stock" },
      { notes: "x".repeat(3001) },
      { internal_cost: 1 },
    ])
      expect((await link(s, invalid)).status).toBe(400);
    expect(
      (
        await call("/admin/product-suppliers", "POST", {
          product_id: "missing",
          supplier_id: s,
        })
      ).status,
    ).toBe(409);
    const malformed = await app.request(
      base + "/api/admin/suppliers",
      {
        method: "POST",
        headers: {
          Origin: base,
          Cookie: cookie,
          "Content-Type": "application/json",
        },
        body: "{PRIVATE BROKEN JSON",
      },
      env,
    );
    expect(malformed.status).toBe(400);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM product_suppliers").get()?.n,
    ).toBe(0);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(
      /PRIVATE INVALID PHONE|PRIVATE BROKEN JSON/,
    );
  });
  it("never exposes supplier data in public JSON/HTML/SEO or quote responses and does not change quotation costs", async () => {
    const created = await call("/quotes", "POST", inquiry, false);
    expect(created.status).toBe(201);
    const receipt = await created.json<any>();
    await login();
    const s = await shop("PRIVATE SENSITIVE SHOP", {
      phone: "+91 9000000041",
      address: "PRIVATE SECRET ADDRESS",
      notes: "PRIVATE SHOP COMMENT",
    });
    expect(
      (
        await link(s, {
          supplier_cost: 876543,
          selling_price: 1234567,
          notes: "PRIVATE PROCUREMENT NOTE",
          availability: "available",
        })
      ).status,
    ).toBe(201);
    env.ASSETS = {
      fetch: async () =>
        new Response(
          '<html><head><title>Base</title><meta name="description" content="Base"/></head><body><div id="root"></div></body></html>',
          { headers: { "Content-Type": "text/html" } },
        ),
    } as unknown as Fetcher;
    const paths = [
      "/api/catalog",
      "/api/products/pilot-dining",
      "/api/products/pilot-dining/images",
      "/api/business",
      "/",
      "/design/vana-pedestal-dining-table/pilot-dining",
      "/collections/dining-tables/dining",
      "/sitemap.xml",
      "/robots.txt",
    ];
    for (const path of paths) {
      const response = await app.request(base + path, {}, env);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).not.toMatch(
        /PRIVATE SENSITIVE SHOP|PRIVATE SECRET ADDRESS|PRIVATE SHOP COMMENT|PRIVATE PROCUREMENT NOTE|9000000041|supplier_cost|selling_price|shop_archived/,
      );
    }
    expect(JSON.stringify(receipt)).not.toMatch(/supplier|876543|1234567/i);
    const quote = db.db.prepare("SELECT * FROM quotes").get()!;
    expect(quote.internal_cost).toBe(0);
    expect(quote.final_price).toBeNull();
    expect(String(quote.product_snapshot)).not.toContain("supplier");
    expect(JSON.parse(String(quote.configuration))).toEqual(
      inquiry.configuration,
    );
    expect(
      db.db.prepare("SELECT price FROM products WHERE id='pilot-dining'").get()
        ?.price,
    ).toBeNull();
    expect(db.db.prepare("SELECT COUNT(*) n FROM price_audit").get()?.n).toBe(
      0,
    );
  });
  it("applies additive pilot/supplier migrations without rewriting existing products, quotes or sessions", async () => {
    db.db.close();
    db = new Database("0008_seo_metadata.sql");
    env.DB = db as unknown as D1Database;
    await login();
    const q = {
      ...inquiry,
      product_id: "sofas-1",
      configuration: { ...inquiry.configuration, width: 95, height: 85 },
    };
    expect((await call("/quotes", "POST", q, false)).status).toBe(201);
    db.db
      .prepare(
        "UPDATE products SET price=987654,description='Owner-preserved description' WHERE id='sofas-1'",
      )
      .run();
    const before = db.db
        .prepare("SELECT * FROM products WHERE id='sofas-1'")
        .get(),
      oldQuote = db.db.prepare("SELECT * FROM quotes").get(),
      sessionCount = db.db
        .prepare("SELECT COUNT(*) n FROM owner_sessions")
        .get()?.n;
    db.db.exec("BEGIN");
    try {
      for (const file of [
        "0009_pilot_collection.sql",
        "0010_private_suppliers.sql",
      ])
        db.db.exec(readFileSync("migrations/" + file, "utf8"));
      db.db.exec("COMMIT");
    } catch (e) {
      db.db.exec("ROLLBACK");
      throw e;
    }
    expect(
      db.db.prepare("SELECT * FROM products WHERE id='sofas-1'").get(),
    ).toEqual(before);
    expect(db.db.prepare("SELECT * FROM quotes").get()).toEqual(oldQuote);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM owner_sessions").get()?.n,
    ).toBe(sessionCount);
    expect(await (await call("/auth/session")).json()).toEqual({
      authenticated: true,
    });
    expect(db.db.prepare("SELECT COUNT(*) n FROM products").get()?.n).toBe(29);
    expect(
      (
        await call("/admin/suppliers", "POST", {
          name: "Valid test name",
          phone: "-------",
        })
      ).status,
    ).toBe(400);
    expect(db.db.prepare("SELECT COUNT(*) n FROM suppliers").get()?.n).toBe(0);
  });
});
