import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import app, { passwordHash, type Env } from "../worker/index";
class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.db, this.sql, args);
  }
  async first() {
    return this.db.prepare(this.sql).get(...(this.args as [])) ?? null;
  }
  async all() {
    return {
      results: this.db.prepare(this.sql).all(...(this.args as [])),
      success: true,
    };
  }
  async run() {
    return this.db.prepare(this.sql).run(...(this.args as []));
  }
}
class Database {
  db = new DatabaseSync(":memory:");
  constructor() {
    this.db.exec(readFileSync("migrations/0001_initial.sql", "utf8"));
  }
  prepare(sql: string) {
    return new Statement(this.db, sql);
  }
  async batch(statements: Statement[]) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
let db: Database;
let env: Env;
let cookie: string;
const origin = "https://furniture.test";
const password = "test-only-owner-password-not-a-deployment-secret";
async function request(
  path: string,
  method = "GET",
  body?: unknown,
  admin = false,
  extra: Record<string, string> = {},
) {
  return app.request(
    `${origin}/api${path}`,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(method === "GET" ? {} : { Origin: origin }),
        ...(admin ? { Cookie: cookie } : {}),
        ...extra,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
async function login() {
  const response = await request("/auth/login", "POST", { password });
  expect(response.status).toBe(200);
  cookie = response.headers.get("Set-Cookie")!.split(";")[0];
}
const quote = () => ({
  product_id: "sofas-1",
  configuration: {
    length: 220,
    width: 95,
    height: 85,
    material: "Oak",
    color: "Olive",
    notes: "Please review the arm height.",
  },
  name: "Test Customer",
  email: "customer@example.test",
  phone: "+91 9000000000",
  area: "Test locality",
  consent: true,
  website: "",
});
beforeEach(async () => {
  db = new Database();
  env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    OWNER_PASSWORD_HASH: `test-salt:${await passwordHash(password, "test-salt")}`,
    SESSION_SECRET: "test-only-session-secret-at-least-32-characters",
    EMAIL_MODE: "local",
  };
  cookie = "";
});
afterEach(() => {
  db.db.close();
  vi.restoreAllMocks();
});
describe("public catalog and private owner boundary", () => {
  it("seeds 24 concepts and exposes no internal costs or customer data", async () => {
    const r = await request("/catalog");
    expect(r.status).toBe(200);
    const body = await r.json<any>();
    expect(body.products).toHaveLength(24);
    expect(body.categories).toHaveLength(6);
    expect(
      body.products.every(
        (p: Record<string, unknown>) =>
          p.price === null && p.status === "concept" && !("internal_cost" in p),
      ),
    ).toBe(true);
    expect(JSON.stringify(body)).not.toContain("customer@example.test");
  });
  it("rejects all anonymous admin operations", async () => {
    for (const [path, method] of [
      ["/admin/data", "GET"],
      ["/admin/products", "POST"],
      ["/admin/products/sofas-1", "PUT"],
      ["/admin/products/sofas-1", "DELETE"],
      ["/admin/categories", "POST"],
      ["/admin/categories/sofas", "DELETE"],
      ["/admin/settings", "PUT"],
      ["/admin/quotes/x", "PUT"],
      ["/admin/quotes/x/retry", "POST"],
    ])
      expect(
        (await request(path, method, method === "GET" ? undefined : {})).status,
      ).toBe(401);
  });
  it("rejects cross-origin mutations, invalid JSON and oversized input", async () => {
    expect(
      (
        await request("/quotes", "POST", quote(), false, {
          Origin: "https://attacker.test",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request("/quotes", "POST", {
          ...quote(),
          name: "x".repeat(34000),
        })
      ).status,
    ).toBe(413);
    const r = await app.request(
      `${origin}/api/quotes`,
      { method: "POST", headers: { Origin: origin }, body: "{" },
      env,
    );
    expect(r.status).toBe(400);
  });
  it("authenticates only configured owner and rejects forged sessions", async () => {
    expect(
      (await request("/auth/login", "POST", { password: "wrong" })).status,
    ).toBe(401);
    await login();
    const session = await request("/auth/session", "GET", undefined, true);
    expect(await session.json<any>()).toEqual({ authenticated: true });
    expect(
      (
        await request("/admin/data", "GET", undefined, false, {
          Cookie: "hf_session=9999999999999.fake.fake",
        })
      ).status,
    ).toBe(401);
    env.OWNER_PASSWORD_HASH = "changed:hash";
    expect((await request("/admin/data", "GET", undefined, true)).status).toBe(
      401,
    );
  });
  it("rate-limits owner password attempts and fails closed without config", async () => {
    for (let i = 0; i < 5; i++)
      expect(
        (await request("/auth/login", "POST", { password: "wrong" })).status,
      ).toBe(401);
    expect((await request("/auth/login", "POST", { password })).status).toBe(
      429,
    );
    env.SESSION_SECRET = undefined;
    expect((await request("/auth/login", "POST", { password })).status).toBe(
      503,
    );
  });
  it("persists owner price changes and a private audit atomically", async () => {
    await login();
    const { products } = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    const { id, ...product } = products.find(
      (p: { id: string }) => p.id === "sofas-1",
    );
    expect(
      (
        await request(
          `/admin/products/${id}`,
          "PUT",
          { ...product, price: 1250000, internal_cost: 900000 },
          true,
        )
      ).status,
    ).toBe(200);
    const catalog = await (await request("/catalog")).json<any>();
    expect(
      catalog.products.find((p: { id: string }) => p.id === id).price,
    ).toBe(1250000);
    expect(JSON.stringify(catalog)).not.toContain("internal_cost");
    const data = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    expect(data.audit).toHaveLength(1);
    expect(data.audit[0]).toMatchObject({
      old_price: null,
      new_price: 1250000,
    });
    expect(
      data.products.find((p: { id: string }) => p.id === id).internal_cost,
    ).toBe(900000);
  });
  it("supports product/category CRUD and keeps inquiry snapshots after deletion", async () => {
    await login();
    const cat = await (
      await request("/admin/categories", "POST", { name: "Storage" }, true)
    ).json<any>();
    const { products } = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    const { id, ...product } = products[0];
    const created = await (
      await request(
        "/admin/products",
        "POST",
        { ...product, category_id: cat.id, name: "Test design" },
        true,
      )
    ).json<any>();
    expect(created.id).toBeTruthy();
    expect(
      (await request(`/admin/categories/${cat.id}`, "DELETE", undefined, true))
        .status,
    ).toBe(409);
    expect(
      (
        await request(
          `/admin/categories/${cat.id}`,
          "PUT",
          { name: "Cabinets" },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/admin/products/${created.id}`,
          "DELETE",
          undefined,
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request(`/admin/categories/${cat.id}`, "DELETE", undefined, true))
        .status,
    ).toBe(200);
    await request("/quotes", "POST", quote());
    await request("/admin/products/sofas-1", "DELETE", undefined, true);
    const data = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    expect(data.quotes[0].product_snapshot.name).toBe("Aara lounge sofa");
  });
});
describe("quote persistence and notification reliability", () => {
  it("saves the full configuration, unique references and consent", async () => {
    const r = await request("/quotes", "POST", quote());
    expect(r.status).toBe(201);
    const receipt = await r.json<any>();
    const second = await (
      await request("/quotes", "POST", quote())
    ).json<any>();
    expect(receipt.reference).not.toBe(second.reference);
    expect(receipt.contact).toEqual({ email: null, phone: null });
    expect(Object.keys(receipt)).toEqual(["reference", "contact"]);
    await login();
    const { quotes } = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    expect(quotes).toHaveLength(2);
    expect(quotes[0].configuration).toEqual(quote().configuration);
    expect(quotes[0].consent).toBe(1);
    expect(quotes[0].email_status).toBe("local");
  });
  it("rejects absent consent, spam, invalid dimensions and unsupported choices", async () => {
    for (const input of [
      { ...quote(), consent: false },
      { ...quote(), website: "spam" },
      { ...quote(), configuration: { ...quote().configuration, length: -1 } },
      {
        ...quote(),
        configuration: { ...quote().configuration, material: "unlisted" },
      },
    ])
      expect((await request("/quotes", "POST", input)).status).toBe(400);
    expect(db.db.prepare("SELECT count(*) AS n FROM quotes").get()?.n).toBe(0);
  });
  it("rate-limits public inquiries", async () => {
    for (let i = 0; i < 10; i++)
      expect((await request("/quotes", "POST", quote())).status).toBe(201);
    expect((await request("/quotes", "POST", quote())).status).toBe(429);
  });
  it("persists quotes when email provider fails and supports retry to one owner", async () => {
    env.EMAIL_MODE = "resend";
    env.OWNER_EMAIL = "owner@example.test";
    env.EMAIL_FROM = "studio@example.test";
    env.RESEND_API_KEY = "test-only";
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("provider unavailable", { status: 503 }));
    const r = await request("/quotes", "POST", quote());
    expect(r.status).toBe(201);
    const row = db.db.prepare("SELECT * FROM quotes").get()!;
    expect(row.email_status).toBe("failed");
    expect(mock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(String(mock.mock.calls[0][1]?.body));
    expect(payload.to).toEqual(["owner@example.test"]);
    expect(payload.text).not.toContain("customer@example.test");
    mock.mockResolvedValue(new Response("{}", { status: 200 }));
    await login();
    expect(
      (await request(`/admin/quotes/${row.id}/retry`, "POST", undefined, true))
        .status,
    ).toBe(200);
    expect(
      db.db.prepare("SELECT email_status FROM quotes").get()?.email_status,
    ).toBe("sent");
    await request(`/admin/quotes/${row.id}/retry`, "POST", undefined, true);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("returns only configured business contacts after saving, never internal data", async () => {
    env.BUSINESS_PHONE = "+91 9000000001";
    env.BUSINESS_EMAIL = "studio@example.test";
    const receipt = await (
      await request("/quotes", "POST", quote())
    ).json<any>();
    expect(receipt.contact).toEqual({
      phone: env.BUSINESS_PHONE,
      email: env.BUSINESS_EMAIL,
    });
    expect(receipt).not.toHaveProperty("email_status");
  });
  it("saves inquiry status, calculates margin and warns below configured minimum", async () => {
    await request("/quotes", "POST", quote());
    await login();
    const row = db.db.prepare("SELECT id FROM quotes").get()!;
    await request("/admin/settings", "PUT", { minimum_margin: 25 }, true);
    const r = await request(
      `/admin/quotes/${row.id}`,
      "PUT",
      { status: "Quoted", internal_cost: 900000, final_price: 1000000 },
      true,
    );
    expect(r.status).toBe(200);
    expect(await r.json<any>()).toMatchObject({
      margin: 10,
      warning: "This quote is below the minimum margin.",
    });
    expect(db.db.prepare("SELECT status FROM quotes").get()?.status).toBe(
      "Quoted",
    );
  });
});

describe("production session cookie policy", () => {
  it("sets secure cookie attributes, expires sessions, and clears the cookie on logout", async () => {
    env.ENVIRONMENT = "production";
    const response = await request("/auth/login", "POST", { password });
    expect(response.status).toBe(200);
    const header = response.headers.get("Set-Cookie")!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Secure");
    expect(header).toContain("Max-Age=28800");
    cookie = header.split(";")[0];
    const logout = await request("/auth/logout", "POST", undefined, true);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 9 * 3600000);
    expect((await request("/admin/data", "GET", undefined, true)).status).toBe(
      401,
    );
  });
});
