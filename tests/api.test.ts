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
