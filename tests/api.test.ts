import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import app, { passwordHash, type Env } from "../worker/index";
import { Database } from "./helpers";
let db: Database;
let env: Env;
let cookie: string;
const origin = "http://127.0.0.1:8787";
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
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual(
      expect.arrayContaining([
        "Tables",
        "Dining",
        "Chairs",
        "Sofas",
        "Beds",
        "Wardrobes",
        "Cupboards",
        "Desks",
        "Custom furniture",
      ]),
    );
    expect(body.categories).toHaveLength(9);
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
    expect(header).toContain("Max-Age=3600");
    cookie = header.split(";")[0];
    const logout = await request("/auth/logout", "POST", undefined, true);
    expect(logout.headers.get("Set-Cookie")).toContain("Max-Age=0");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 9 * 3600000);
    expect((await request("/admin/data", "GET", undefined, true)).status).toBe(
      401,
    );
  });
});

class ImageBucket {
  objects = new Map<string, Uint8Array>();
  async put(key: string, value: Uint8Array) {
    this.objects.set(key, new Uint8Array(value));
    return { key };
  }
  async delete(key: string | string[]) {
    for (const k of Array.isArray(key) ? key : [key]) this.objects.delete(k);
  }
  async get(key: string) {
    const value = this.objects.get(key);
    return value
      ? {
          body: new Blob([value as Uint8Array<ArrayBuffer>]).stream(),
          httpEtag: '"test-image"',
        }
      : null;
  }
}
const png = Uint8Array.from(
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6S0AAAAASUVORK5CYII=",
    "base64",
  ),
);
async function uploadImage(
  body: Uint8Array = png,
  extra: Record<string, string> = {},
  query = "",
) {
  return app.request(
    `${origin}/api/admin/products/sofas-1/images${query}`,
    {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "image/png",
        "X-Image-Alt": encodeURIComponent("Aara sofa white studio concept"),
        "X-Image-Kind": "illustrative",
        ...extra,
      },
      body: new Blob([body as Uint8Array<ArrayBuffer>]),
    },
    env,
  );
}
describe("owner image storage and replacement", () => {
  it("rejects anonymous uploads and validates file type, size, alt and dimensions", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    expect((await uploadImage()).status).toBe(401);
    await login();
    expect(
      (
        await uploadImage(
          new TextEncoder().encode("<svg><script>alert(1)</script></svg>"),
          { "Content-Type": "image/svg+xml" },
        )
      ).status,
    ).toBe(400);
    expect(
      (await uploadImage(png, { "Content-Type": "image/jpeg" })).status,
    ).toBe(400);
    expect((await uploadImage(png, { "X-Image-Alt": "" })).status).toBe(400);
    expect(
      (await uploadImage(new Uint8Array(5 * 1024 * 1024 + 1))).status,
    ).toBe(413);
    const huge = new Uint8Array(png);
    new DataView(huge.buffer).setUint32(16, 10000);
    expect((await uploadImage(huge)).status).toBe(400);
    expect(bucket.objects.size).toBe(0);
  });
  it("uploads, serves, reorders, replaces and deletes while preserving product and quote records", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    await request("/quotes", "POST", quote());
    await login();
    const original = db.db
      .prepare("SELECT * FROM products WHERE id=?")
      .get("sofas-1")!;
    const uploaded = await uploadImage();
    expect(uploaded.status).toBe(201);
    const { url } = await uploaded.json<any>();
    expect(bucket.objects.size).toBe(1);
    const publicImage = await app.request(`${origin}${url}`, {}, env);
    expect(publicImage.status).toBe(200);
    expect(publicImage.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await publicImage.arrayBuffer())).toEqual(png);
    let gallery = await (
      await request("/admin/products/sofas-1/images", "GET", undefined, true)
    ).json<any>();
    expect(gallery.images).toHaveLength(4);
    expect(gallery.images[3].alt).toBe("Aara sofa white studio concept");
    const order = gallery.images.map((m: { url: string }) => m.url).reverse();
    expect(
      (
        await request(
          "/admin/products/sofas-1/images/order",
          "PUT",
          { images: order },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/products/sofas-1/images/order",
          "PUT",
          { images: ["/media/unapproved"] },
          true,
        )
      ).status,
    ).toBe(400);
    const replacement = await uploadImage(png, {}, "?replace=0");
    expect(replacement.status).toBe(201);
    expect(bucket.objects.size).toBe(1);
    expect((await app.request(`${origin}${url}`, {}, env)).status).toBe(404);
    expect(
      (
        await request(
          "/admin/products/sofas-1/images/0",
          "DELETE",
          undefined,
          true,
        )
      ).status,
    ).toBe(200);
    expect(bucket.objects.size).toBe(0);
    const after = db.db
      .prepare("SELECT * FROM products WHERE id=?")
      .get("sofas-1")!;
    for (const k of ["id", "price", "description", "name", "internal_cost"])
      expect(after[k]).toBe(original[k]);
    const stored = db.db.prepare("SELECT * FROM quotes").get()!;
    expect(stored.configuration).toBe(JSON.stringify(quote().configuration));
    expect(JSON.parse(String(stored.product_snapshot)).images).toEqual(
      JSON.parse(String(original.images)),
    );
  });
  it("fails clearly without a bucket and removes staged objects if database persistence fails", async () => {
    await login();
    expect((await uploadImage()).status).toBe(503);
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    vi.spyOn(db, "batch").mockRejectedValueOnce(
      new Error("simulated DB failure"),
    );
    expect((await uploadImage()).status).toBe(500);
    expect(bucket.objects.size).toBe(0);
  });
});

describe("lead follow-ups and configurable contact", () => {
  it("stores source and private follow-up on the same quotation without losing cost/configuration", async () => {
    const r = await request("/quotes", "POST", {
      ...quote(),
      source: "google",
    });
    expect(r.status).toBe(201);
    await login();
    const row = db.db.prepare("SELECT * FROM quotes").get()!;
    await request(
      `/admin/quotes/${row.id}`,
      "PUT",
      { status: "Quoted", internal_cost: 800000, final_price: 1000000 },
      true,
    );
    expect(
      (
        await request(
          `/admin/leads/${row.id}`,
          "PUT",
          {
            stage: "Won",
            owner_notes: "Call after reviewing wood samples.",
            follow_up_date: "2030-02-20",
          },
          true,
        )
      ).status,
    ).toBe(200);
    const saved = db.db.prepare("SELECT * FROM quotes").get()!;
    expect(saved).toMatchObject({
      source: "google",
      status: "Confirmed",
      owner_notes: "Call after reviewing wood samples.",
      follow_up_date: "2030-02-20",
      internal_cost: 800000,
      final_price: 1000000,
    });
    expect(saved.configuration).toBe(row.configuration);
    expect(db.db.prepare("SELECT count(*) n FROM quotes").get()?.n).toBe(1);
    const publicBody = await (await request("/catalog")).text();
    expect(publicBody).not.toContain("Call after");
    expect(publicBody).not.toContain("owner_notes");
    expect((await request("/leads")).status).toBe(404);
  });
  it("protects lead changes and validates follow-up dates and acquisition sources", async () => {
    await request("/quotes", "POST", quote());
    const row = db.db.prepare("SELECT id FROM quotes").get()!;
    const body = {
      stage: "Contacted",
      owner_notes: "Private",
      follow_up_date: "2030-02-31",
    };
    expect((await request(`/admin/leads/${row.id}`, "PUT", body)).status).toBe(
      401,
    );
    await login();
    expect(
      (await request(`/admin/leads/${row.id}`, "PUT", body, true)).status,
    ).toBe(400);
    expect(
      (
        await request("/quotes", "POST", {
          ...quote(),
          source: "unapproved-source",
        })
      ).status,
    ).toBe(400);
    db.db.prepare("UPDATE quotes SET status='Manufacturing'").run();
    await request(
      `/admin/leads/${row.id}`,
      "PUT",
      { ...body, stage: "Won", follow_up_date: null },
      true,
    );
    expect(db.db.prepare("SELECT status FROM quotes").get()?.status).toBe(
      "Manufacturing",
    );
  });
  it("publishes only configured business contacts and allows secure owner overrides", async () => {
    env.OWNER_EMAIL = "private-owner@example.test";
    env.BUSINESS_EMAIL = "public@example.test";
    expect((await request("/admin/business")).status).toBe(401);
    expect((await request("/admin/business", "PUT", {})).status).toBe(401);
    await login();
    const business = {
      phone: "+91 9000000001",
      email: "",
      whatsapp: "+919000000001",
      address: "",
      service_area: "Owner-confirmed test locality",
      summary: "Test profile only.",
    };
    expect(
      (await request("/admin/business", "PUT", business, true)).status,
    ).toBe(200);
    const published = await (await request("/business")).json<any>();
    expect(published.phone).toBe(business.phone);
    expect(published.email).toBeNull();
    expect(JSON.stringify(published)).not.toContain(env.OWNER_EMAIL);
    expect(published.address).toBeNull();
    expect(
      (
        await request(
          "/admin/business",
          "PUT",
          { ...business, whatsapp: "not-a-number" },
          true,
        )
      ).status,
    ).toBe(400);
  });
});

describe("gallery concurrency protection", () => {
  it("keeps an uploaded gallery when an older product editor saves a price", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    await login();
    const data = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    const { id, ...stale } = data.products.find(
      (p: { id: string }) => p.id === "sofas-1",
    );
    const uploaded = await (await uploadImage()).json<any>();
    expect(uploaded.url).toBeTruthy();
    expect(
      (
        await request(
          `/admin/products/${id}`,
          "PUT",
          { ...stale, price: 500000 },
          true,
        )
      ).status,
    ).toBe(200);
    const saved = db.db
      .prepare("SELECT images,price FROM products WHERE id=?")
      .get(id)!;
    expect(JSON.parse(String(saved.images))).toContain(uploaded.url);
    expect(saved.price).toBe(500000);
  });
});

describe("quote submission retry protection", () => {
  it("returns the original receipt on sequential retries without notifying twice", async () => {
    env.EMAIL_MODE = "resend";
    env.OWNER_EMAIL = "owner@example.test";
    env.EMAIL_FROM = "studio@example.test";
    env.RESEND_API_KEY = "test-only";
    const mail = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    const payload = { ...quote(), submission_key: crypto.randomUUID() };
    const first = await request("/quotes", "POST", payload);
    expect(first.status).toBe(201);
    const receipt = await first.json<any>();
    const retry = await request("/quotes", "POST", payload);
    expect(retry.status).toBe(200);
    expect(await retry.json<any>()).toEqual(receipt);
    expect(db.db.prepare("SELECT count(*) n FROM quotes").get()?.n).toBe(1);
    expect(mail).toHaveBeenCalledTimes(1);
    await login();
    const admin = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    expect(admin.quotes[0]).not.toHaveProperty("submission_key");
    expect(admin.quotes[0]).not.toHaveProperty("request_hash");
  });
  it("deduplicates concurrent requests atomically", async () => {
    const payload = { ...quote(), submission_key: crypto.randomUUID() };
    const responses = await Promise.all([
      request("/quotes", "POST", payload),
      request("/quotes", "POST", payload),
    ]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 201]);
    const bodies = await Promise.all(responses.map((r) => r.json<any>()));
    expect(bodies[0].reference).toBe(bodies[1].reference);
    expect(db.db.prepare("SELECT count(*) n FROM quotes").get()?.n).toBe(1);
  });
  it("rejects changed payload reuse, while distinct submission keys allow distinct inquiries", async () => {
    const payload = { ...quote(), submission_key: crypto.randomUUID() };
    await request("/quotes", "POST", payload);
    expect(
      (
        await request("/quotes", "POST", {
          ...payload,
          area: "Changed locality",
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("/quotes", "POST", {
          ...payload,
          submission_key: "invalid",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/quotes", "POST", {
          ...payload,
          submission_key: crypto.randomUUID(),
        })
      ).status,
    ).toBe(201);
    expect(db.db.prepare("SELECT count(*) n FROM quotes").get()?.n).toBe(2);
  });
  it("returns a saved receipt after product archival and secret rotation", async () => {
    const payload = { ...quote(), submission_key: crypto.randomUUID() };
    const first = await (await request("/quotes", "POST", payload)).json<any>();
    db.db
      .prepare("UPDATE products SET status='archived' WHERE id='sofas-1'")
      .run();
    env.SESSION_SECRET = "rotated-test-secret-more-than-32-characters";
    const retry = await request("/quotes", "POST", payload);
    expect(retry.status).toBe(200);
    expect((await retry.json<any>()).reference).toBe(first.reference);
  });
});

describe("requirements audit catalog and owner controls", () => {
  it("serves 300 distinct isolated fixture records with safe metadata and leaves production seed content unchanged", async () => {
    const insert = db.db.prepare(
      "INSERT INTO products (id,name,category_id,description,material,finish,length,width,height,price,status,images,colors,materials,model,internal_cost) SELECT ?,?,category_id,description,material,finish,length,width,height,NULL,'concept',images,colors,materials,NULL,0 FROM products WHERE id='sofas-1'",
    );
    for (let i = 0; i < 276; i++)
      insert.run(`audit-fixture-${i}`, `Isolated catalog benchmark ${i}`);
    const body = await (await request("/catalog")).json<any>();
    expect(body.products).toHaveLength(300);
    expect(new Set(body.products.map((p: { id: string }) => p.id)).size).toBe(
      300,
    );
    expect(
      body.products.every(
        (p: Record<string, unknown>) => !("internal_cost" in p),
      ),
    ).toBe(true);
  });
  it("persists owner edits to dimensions, variants, finishes and category, and hides archived products", async () => {
    await login();
    const data = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    const { id, ...product } = data.products.find(
      (p: { id: string }) => p.id === "sofas-1",
    );
    const edited = {
      ...product,
      category_id: "tables",
      length: 230,
      width: 100,
      height: 90,
      material: "Walnut",
      finish: "Matte oil",
      materials: ["Walnut", "Oak"],
      colors: ["Sand", "Olive"],
      price: 2500000,
    };
    expect((await request(`/admin/products/${id}`, "PUT", edited)).status).toBe(
      401,
    );
    expect(
      (await request(`/admin/products/${id}`, "PUT", edited, true)).status,
    ).toBe(200);
    const updated = (
      await (await request("/catalog")).json<any>()
    ).products.find((p: { id: string }) => p.id === id);
    expect(updated).toMatchObject({
      category_id: "tables",
      length: 230,
      width: 100,
      height: 90,
      material: "Walnut",
      finish: "Matte oil",
      materials: ["Walnut", "Oak"],
      colors: ["Sand", "Olive"],
      price: 2500000,
    });
    await request(
      `/admin/products/${id}`,
      "PUT",
      { ...edited, status: "archived" },
      true,
    );
    expect(
      (await (await request("/catalog")).json<any>()).products.some(
        (p: { id: string }) => p.id === id,
      ),
    ).toBe(false);
    expect((await request("/quotes", "POST", quote())).status).toBe(404);
  });
});

describe("durable image cleanup failures", () => {
  it("retains failed replacement and product-deletion obligations until owner retry succeeds", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    expect((await request("/admin/media/cleanup")).status).toBe(401);
    expect((await request("/admin/media/cleanup", "POST", {})).status).toBe(
      401,
    );
    await login();
    expect(
      (
        await request("/admin/media/cleanup", "POST", {}, true, {
          Origin: "https://untrusted.example",
        })
      ).status,
    ).toBe(403);
    const first = await (await uploadImage()).json<any>();
    const remove = vi
      .spyOn(bucket, "delete")
      .mockRejectedValue(new Error("isolated storage outage"));
    expect((await uploadImage(png, {}, "?replace=3")).status).toBe(201);
    expect(bucket.objects.size).toBe(2);
    expect((await app.request(origin + first.url, {}, env)).status).toBe(404);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(1);
    expect(
      (await request("/admin/products/sofas-1", "DELETE", undefined, true))
        .status,
    ).toBe(200);
    expect(db.db.prepare("SELECT COUNT(*) n FROM media_objects").get()?.n).toBe(
      0,
    );
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(2);
    expect(
      (
        await (
          await request("/admin/media/cleanup", "POST", {}, true)
        ).json<any>()
      ).pending,
    ).toBe(2);
    remove.mockRestore();
    const result = await (
      await request("/admin/media/cleanup", "POST", {}, true)
    ).json<any>();
    expect(result).toEqual({ pending: 0, stale: 0, configured: true });
    expect(bucket.objects.size).toBe(0);
    expect(
      (await request("/admin/media/cleanup", "POST", {}, true)).status,
    ).toBe(200);
  });
  it("recovers interrupted uploads, preserves active and recent objects, and retries a failed upload cleanup", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    await login();
    const active = await (await uploadImage()).json<any>();
    for (const [id, age] of [
      ["stale-stage", "-10 minutes"],
      ["recent-stage", "-1 minute"],
    ]) {
      const key = `products/sofas-1/${id}.png`;
      await bucket.put(key, png);
      db.db
        .prepare(
          "INSERT INTO media_objects(id,product_id,storage_key,content_type,byte_size,alt,kind,created_at) VALUES (?,'sofas-1',?,'image/png',?,'Staged upload','illustrative',datetime('now',?))",
        )
        .run(id, key, png.length, age);
    }
    db.db
      .prepare(
        "UPDATE media_objects SET created_at=datetime('now','-10 minutes') WHERE id=?",
      )
      .run(active.id);
    const publicData = await (await request("/catalog")).json<any>();
    expect(
      Object.keys(
        publicData.products.find((p: { id: string }) => p.id === "sofas-1")
          .image_metadata,
      ),
    ).toContain(active.url);
    expect(JSON.stringify(publicData)).not.toContain("stale-stage");
    expect(JSON.stringify(publicData)).not.toContain("recent-stage");
    expect(
      (await request("/admin/media/cleanup", "POST", {}, true)).status,
    ).toBe(200);
    expect(bucket.objects.has("products/sofas-1/stale-stage.png")).toBe(false);
    expect(bucket.objects.has("products/sofas-1/recent-stage.png")).toBe(true);
    expect((await app.request(origin + active.url, {}, env)).status).toBe(200);
    vi.spyOn(db, "batch").mockRejectedValueOnce(
      new Error("isolated persistence failure"),
    );
    const remove = vi
      .spyOn(bucket, "delete")
      .mockRejectedValue(new Error("isolated storage outage"));
    expect((await uploadImage()).status).toBe(500);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(1);
    remove.mockRestore();
    await request("/admin/media/cleanup", "POST", {}, true);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(0);
    expect(bucket.objects.size).toBe(2);
  });
  it("retains staged keys across product deletion and observes their grace period", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    await login();
    db.db
      .prepare(
        "INSERT INTO media_objects(id,product_id,storage_key,content_type,byte_size,alt,kind) VALUES ('inflight','sofas-1','inflight.png','image/png',1,'In flight','illustrative')",
      )
      .run();
    await request("/admin/products/sofas-1", "DELETE", undefined, true);
    // Simulate an in-flight external write completing after the product transaction.
    await bucket.put("inflight.png", png);
    await request("/admin/media/cleanup", "POST", {}, true);
    expect(bucket.objects.has("inflight.png")).toBe(true);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(1);
    db.db
      .prepare(
        "UPDATE media_cleanup_queue SET available_at=datetime('now','-1 minute')",
      )
      .run();
    await request("/admin/media/cleanup", "POST", {}, true);
    expect(bucket.objects.size).toBe(0);
  });
});

describe("owner editable search listings and image descriptions", () => {
  it("validates and persists product/category SEO, retaining optional overrides for legacy edits", async () => {
    await login();
    const data = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    const { id, ...product } = data.products.find(
      (p: { id: string }) => p.id === "sofas-1",
    );
    const updated = {
      ...product,
      seo_title: "Aara sofa design | Aaranya Living",
      seo_description:
        "Compare this illustrative sofa design and request a personal quotation.",
    };
    expect(
      (await request("/admin/products/" + id, "PUT", updated)).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/admin/products/" + id,
          "PUT",
          { ...updated, seo_title: "x".repeat(71) },
          true,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          "/admin/products/" + id,
          "PUT",
          { ...updated, seo_description: "x".repeat(181) },
          true,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("/admin/products/" + id, "PUT", updated, true)).status,
    ).toBe(200);
    const {
      seo_title: _title,
      seo_description: _description,
      ...legacy
    } = updated;
    await request("/admin/products/" + id, "PUT", legacy, true);
    expect(
      db.db.prepare("SELECT seo_title FROM products WHERE id=?").get(id)
        ?.seo_title,
    ).toBe(updated.seo_title);
    expect(
      (
        await request(
          "/admin/categories/sofas",
          "PUT",
          {
            name: "Sofas",
            seo_title: "Sofa planning",
            seo_description: "Plan seating for your room.",
          },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/categories/sofas",
          "PUT",
          { name: "Sofas", seo_title: "x".repeat(71) },
          true,
        )
      ).status,
    ).toBe(400);
    await request("/admin/categories/sofas", "PUT", { name: "Sofas" }, true);
    const catalog = await (await request("/catalog")).json<any>();
    expect(
      catalog.categories.find((c: { id: string }) => c.id === "sofas")
        .seo_title,
    ).toBe("Sofa planning");
    expect(
      catalog.products.find((p: { id: string }) => p.id === id).seo_description,
    ).toBe(updated.seo_description);
    await request(
      "/admin/products/" + id,
      "PUT",
      { ...updated, seo_title: "", seo_description: "" },
      true,
    );
    expect(
      db.db.prepare("SELECT seo_title FROM products WHERE id=?").get(id)
        ?.seo_title,
    ).toBe("");
  });
  it("edits an existing placeholder alt without replacing bytes and rejects unapproved references", async () => {
    const images = JSON.parse(
      String(
        db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
          ?.images,
      ),
    );
    const path = "/admin/products/sofas-1/images/text";
    const body = {
      url: images[0],
      alt: "Aara sofa concept on a white studio background",
    };
    expect((await request(path, "PUT", body)).status).toBe(401);
    await login();
    expect(
      (
        await request(path, "PUT", body, true, {
          Origin: "https://untrusted.example",
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          path,
          "PUT",
          { ...body, url: "/assets/not-this-gallery.svg" },
          true,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request(path, "PUT", { ...body, alt: "x".repeat(301) }, true))
        .status,
    ).toBe(400);
    expect((await request(path, "PUT", body, true)).status).toBe(200);
    const gallery = await (
      await request("/products/sofas-1/images")
    ).json<any>();
    expect(gallery.images[0].alt).toBe(body.alt);
    const catalog = await (await request("/catalog")).json<any>();
    expect(
      catalog.products.find((p: { id: string }) => p.id === "sofas-1")
        .image_metadata[images[0]].alt,
    ).toBe(body.alt);
    expect(
      JSON.parse(
        String(
          db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
            ?.images,
        ),
      ),
    ).toEqual(images);
  });
});

describe("interrupted image write reconciliation", () => {
  it("rejects publication if reconciliation retired its staged registry during a delayed object write", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    await login();
    const original = db.db
      .prepare("SELECT images FROM products WHERE id='sofas-1'")
      .get()?.images;
    vi.spyOn(bucket, "put").mockImplementationOnce(async (key, value) => {
      db.db
        .prepare(
          "UPDATE media_objects SET created_at=datetime('now','-10 minutes')",
        )
        .run();
      await request("/admin/media/cleanup", "POST", {}, true);
      bucket.objects.set(key, new Uint8Array(value));
      return { key };
    });
    expect((await uploadImage()).status).toBe(409);
    expect(
      db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
        ?.images,
    ).toBe(original);
    expect(bucket.objects.size).toBe(0);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(0);
  });
});

describe("no-R2 preview safety", () => {
  it("disables storage mutations without changing galleries or cleanup records, retaining safe D1 gallery edits", async () => {
    env.EMAIL_MODE = "disabled";
    expect((await request("/quotes", "POST", quote())).status).toBe(201);
    await login();
    const before = String(
      db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
        ?.images,
    );
    const gallery = await (
      await request("/admin/products/sofas-1/images", "GET", undefined, true)
    ).json<any>();
    expect(gallery.storage_available).toBe(false);
    for (const response of [
      await uploadImage(),
      await request(
        "/admin/products/sofas-1/images/0",
        "DELETE",
        undefined,
        true,
      ),
      await request("/admin/media/cleanup", "POST", {}, true),
    ]) {
      expect(response.status).toBe(503);
      expect((await response.json<any>()).error).toContain(
        "unavailable in preview",
      );
    }
    expect(
      db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
        ?.images,
    ).toBe(before);
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(0);
    expect(db.db.prepare("SELECT COUNT(*) n FROM media_objects").get()?.n).toBe(
      0,
    );
    const images = JSON.parse(before).reverse();
    expect(
      (
        await request(
          "/admin/products/sofas-1/images/order",
          "PUT",
          { images },
          true,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/admin/products/sofas-1/images/text",
          "PUT",
          { url: images[0], alt: "Preview static illustration description" },
          true,
        )
      ).status,
    ).toBe(200);
    expect(db.db.prepare("SELECT COUNT(*) n FROM quotes").get()?.n).toBe(1);
    expect(
      db.db.prepare("SELECT email_status FROM quotes").get()?.email_status,
    ).toBe("disabled");
    const stored = db.db.prepare("SELECT configuration FROM quotes").get()!;
    expect(JSON.parse(String(stored.configuration))).toEqual(
      quote().configuration,
    );
  });
  it("preserves uploaded-image products when R2 is removed, permits safe price/archive edits, and refuses new broken media references", async () => {
    const bucket = new ImageBucket();
    env.PRODUCT_IMAGES = bucket as unknown as R2Bucket;
    await login();
    const { url } = await (await uploadImage()).json<any>();
    delete env.PRODUCT_IMAGES;
    const before = String(
      db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
        ?.images,
    );
    expect(
      (await request("/admin/products/sofas-1", "DELETE", undefined, true))
        .status,
    ).toBe(503);
    expect(
      db.db.prepare("SELECT images FROM products WHERE id='sofas-1'").get()
        ?.images,
    ).toBe(before);
    expect(db.db.prepare("SELECT COUNT(*) n FROM media_objects").get()?.n).toBe(
      1,
    );
    expect(
      db.db.prepare("SELECT COUNT(*) n FROM media_cleanup_queue").get()?.n,
    ).toBe(0);
    expect(bucket.objects.size).toBe(1);
    const { products } = await (
      await request("/admin/data", "GET", undefined, true)
    ).json<any>();
    const { id, ...product } = products.find(
      (p: { id: string }) => p.id === "sofas-1",
    );
    expect(
      (
        await request(
          "/admin/products",
          "POST",
          { ...product, name: "Blocked media reference", images: [url] },
          true,
        )
      ).status,
    ).toBe(503);
    expect(
      (
        await request(
          "/admin/products/" + id,
          "PUT",
          { ...product, price: 750000, status: "archived" },
          true,
        )
      ).status,
    ).toBe(200);
    const after = db.db
      .prepare("SELECT images,price,status FROM products WHERE id=?")
      .get(id)!;
    expect(after).toMatchObject({
      images: before,
      price: 750000,
      status: "archived",
    });
    expect(db.db.prepare("SELECT COUNT(*) n FROM media_objects").get()?.n).toBe(
      1,
    );
    // Even legacy media URLs without registry rows must not be silently discarded.
    db.db
      .prepare(
        "UPDATE products SET images='[\"/media/legacy-reference\"]' WHERE id='beds-1'",
      )
      .run();
    expect(
      (await request("/admin/products/beds-1", "DELETE", undefined, true))
        .status,
    ).toBe(503);
  });
});
