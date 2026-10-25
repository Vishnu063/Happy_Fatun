import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { Database } from "./helpers";
import app, { type Env } from "../worker/index";
import { productURL } from "../shared/seo";
let db: Database;
let env: Env;
const origin = "https://aaranya.example.test";
beforeEach(() => {
  db = new Database();
  env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "production",
    ASSETS: {
      fetch: async (request: Request) =>
        new URL(request.url).pathname === "/index.html"
          ? Response.redirect(origin + "/", 301)
          : new Response(
              '<!doctype html><html><head><title>Base</title><meta name="description" content="Base"/></head><body><div id="root"></div></body></html>',
              { headers: { "Content-Type": "text/html" } },
            ),
    } as unknown as Fetcher,
  };
});
afterEach(() => db.db.close());
const get = (path: string) => app.request(origin + path, {}, env);
describe("public SEO documents and descriptive URLs", () => {
  it("renders unique product title, description, canonical and honest concept schema without JavaScript", async () => {
    const p = { id: "sofas-1", name: "Aara lounge sofa" };
    const r = await get(productURL(p));
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toContain(
      "<title>Aara lounge sofa | Furniture design | Aaranya Living</title>",
    );
    expect(html).toContain(`rel="canonical" href="${origin}${productURL(p)}"`);
    expect(html).toContain("<h1>Aara lounge sofa</h1>");
    expect(html).toContain("CreativeWork");
    expect(html).not.toContain("aggregateRating");
    expect(html).not.toContain("priceCurrency");
  });
  it("redirects legacy/stale slugs and excludes archived or missing designs", async () => {
    const legacy = await get("/product/sofas-1");
    expect(legacy.status).toBe(301);
    expect(legacy.headers.get("Location")).toBe(
      "/design/aara-lounge-sofa/sofas-1",
    );
    expect((await get("/design/old-name/sofas-1")).status).toBe(301);
    db.db
      .prepare("UPDATE products SET status='archived' WHERE id='sofas-1'")
      .run();
    const missing = await get("/design/aara-lounge-sofa/sofas-1");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("X-Robots-Tag")).toContain("noindex");
  });
  it("generates sitemap/robots from current public records and keeps owner pages out of indexes", async () => {
    const sitemap = await (await get("/sitemap.xml")).text();
    expect(sitemap.match(/<loc>/g)).toHaveLength(33);
    expect(sitemap).toContain("/design/aara-lounge-sofa/sofas-1");
    expect(sitemap).not.toContain("/admin");
    const robots = await (await get("/robots.txt")).text();
    expect(robots).toContain("Disallow: /api/admin/");
    expect(robots).toContain(`Sitemap: ${origin}/sitemap.xml`);
    expect((await get("/admin")).headers.get("X-Robots-Tag")).toBe(
      "noindex, nofollow",
    );
  });
  it("escapes owner-controlled text in HTML and JSON-LD", async () => {
    const name = "Sofa </script><script>alert(1)</script>";
    db.db
      .prepare("UPDATE products SET name=?,description=? WHERE id=?")
      .run(
        name,
        "A malicious <img src=x onerror=alert(1)> description.",
        "sofas-1",
      );
    const html = await (await get(productURL({ id: "sofas-1", name }))).text();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("\\u003c/script>");
  });
});

describe("category SEO", () => {
  it("serves descriptive category metadata and redirects stale category slugs", async () => {
    const response = await get("/collections/sofas/sofas");
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      "<title>Sofas design concepts for Pune projects | Aaranya Living</title>",
    );
    expect(html).toContain(
      `rel="canonical" href="${origin}/collections/sofas/sofas"`,
    );
    expect(html).toContain("<h1>Sofas design concepts</h1>");
    expect((await get("/collections/old/sofas")).status).toBe(301);
  });
});
