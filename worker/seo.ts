import type { Hono } from "hono";
import type { Env } from "./index";
import { brand, pageMetadata, productURL, categoryURL } from "../shared/seo";
type App = Hono<{ Bindings: Env; Variables: { session: string } }>;
type Product = {
  id: string;
  name: string;
  description: string;
  images: string;
  status: string;
  material: string;
};
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function registerSEO(app: App) {
  app.get("/robots.txt", (c) =>
    c.text(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\nDisallow: /api/auth/\nSitemap: ${new URL(c.req.url).origin}/sitemap.xml\n`,
    ),
  );
  app.get("/sitemap.xml", async (c) => {
    const origin = new URL(c.req.url).origin;
    const [products, categories] = await Promise.all([
      c.env.DB.prepare(
        "SELECT id,name FROM products WHERE status!='archived' ORDER BY id",
      ).all<{ id: string; name: string }>(),
      c.env.DB.prepare("SELECT id,name FROM categories ORDER BY id").all<{
        id: string;
        name: string;
      }>(),
    ]);
    const paths = [
      "/",
      "/about",
      "/contact",
      ...categories.results.map(categoryURL),
      ...products.results.map(productURL),
    ];
    return c.body(
      `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((path) => `<url><loc>${escape(origin + path)}</loc></url>`).join("")}</urlset>`,
      200,
      {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    );
  });
  app.get("*", async (c) => {
    const url = new URL(c.req.url);
    const path = url.pathname;
    if (!c.env.ASSETS) return c.notFound();
    if (/\.[a-z0-9]+$/i.test(path)) {
      const response = await c.env.ASSETS.fetch(c.req.raw);
      return response.headers.get("Content-Type")?.includes("text/html")
        ? c.notFound()
        : response;
    }
    let product: Product | undefined;
    let category: { id: string; name: string } | undefined;
    let canonical = path;
    let status = 200;
    if (path.startsWith("/design/") || path.startsWith("/product/")) {
      const id = path.split("/").at(-1)!;
      product =
        (await c.env.DB.prepare(
          "SELECT id,name,description,images,status,material FROM products WHERE id=? AND status!='archived'",
        )
          .bind(id)
          .first<Product>()) || undefined;
      if (product) {
        canonical = productURL(product);
        if (path !== canonical) return c.redirect(canonical, 301);
      } else status = 404;
    } else if (path.startsWith("/collections/")) {
      const id = path.split("/").at(-1)!;
      category =
        (await c.env.DB.prepare("SELECT id,name FROM categories WHERE id=?")
          .bind(id)
          .first<{ id: string; name: string }>()) || undefined;
      if (category) {
        canonical = categoryURL(category);
        if (path !== canonical) return c.redirect(canonical, 301);
      } else status = 404;
    } else if (!["/", "/about", "/contact", "/admin"].includes(path))
      status = 404;
    const metadata = pageMetadata(
      status === 404 ? "/missing" : path,
      product,
      category,
    );
    const noindex = status === 404 || path.startsWith("/admin");
    const asset = await c.env.ASSETS.fetch(
      new Request(new URL("/", url), c.req.raw),
    );
    if (!asset.ok || !asset.headers.get("Content-Type")?.includes("text/html"))
      return c.text(
        "The storefront is temporarily unavailable. Please try again later.",
        503,
      );
    let html = await asset.text();
    const schema = product
      ? {
          "@context": "https://schema.org",
          "@type": product.status === "concept" ? "CreativeWork" : "Product",
          name: product.name,
          description: `${product.status === "concept" ? "Illustrative design concept. " : ""}${product.description}`,
          url: url.origin + canonical,
          image: new URL(JSON.parse(product.images)[0], url.origin).href,
        }
      : path === "/"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: brand,
            url: url.origin + "/",
          }
        : null;
    const extra = `<link rel="canonical" href="${escape(url.origin + canonical)}"/><meta name="robots" content="${noindex ? "noindex, nofollow" : "index, follow"}"/><meta property="og:title" content="${escape(metadata.title)}"/><meta property="og:description" content="${escape(metadata.description)}"/><meta property="og:url" content="${escape(url.origin + canonical)}"/>${schema ? `<script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script>` : ""}`;
    html = html
      .replace(
        /<title>[\s\S]*?<\/title>/i,
        `<title>${escape(metadata.title)}</title>`,
      )
      .replace(
        /<meta\s+name="description"[\s\S]*?\/?>/i,
        `<meta name="description" content="${escape(metadata.description)}"/>`,
      )
      .replace("</head>", extra + "</head>");
    const summary = product
      ? `<h1>${escape(product.name)}</h1><p>${escape(product.description)}</p><p>${product.status === "concept" ? "Design concept / illustrative image. Manufacturer approval required." : "Owner-approved design. Confirm details with your quotation."}</p><img src="${escape(JSON.parse(product.images)[0])}" alt="${escape(product.name)}" width="800" height="500"/><a href="/contact">Discuss this design</a>`
      : category
        ? `<h1>${escape(category.name)} design concepts</h1><p>Explore ideas for your Pune furniture project. Delivery area, feasibility and final pricing require confirmation.</p>`
        : `<h1>${escape(metadata.title)}</h1><p>${escape(metadata.description)}</p>`;
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><main>${summary}<p><a href="/">Explore furniture</a></p></main></div>`,
    );
    const headers = new Headers(asset.headers);
    headers.set("Content-Type", "text/html; charset=utf-8");
    headers.set(
      "Cache-Control",
      noindex ? "no-store" : "public, max-age=0, must-revalidate",
    );
    headers.delete("Content-Length");
    headers.delete("Content-Encoding");
    headers.delete("ETag");
    if (noindex) headers.set("X-Robots-Tag", "noindex, nofollow");
    return new Response(html, { status, headers });
  });
}
