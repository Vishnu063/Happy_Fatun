import type { Hono } from "hono";
import type { Env } from "./index";
import { publicBusiness } from "./leads";
import { categoryLabel } from "../shared/catalog";
import { publicCategories } from "./catalog";
import { guides, guideURL, categoryContent } from "../shared/content";
import { brand, pageMetadata, productURL, categoryURL } from "../shared/seo";
type App = Hono<{ Bindings: Env; Variables: { session: string } }>;
type Product = {
  id: string;
  name: string;
  description: string;
  images: string;
  status: string;
  material: string;
  seo_title?: string;
  seo_description?: string;
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
      c.env.PREVIEW_MODE === "true"
        ? "User-agent: *\nDisallow: /\n"
        : `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/admin/\nDisallow: /api/auth/\nSitemap: ${new URL(c.req.url).origin}/sitemap.xml\n`,
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
      "/guides",
      ...guides.map(guideURL),
      ...categories.results.map(categoryLabel).map(categoryURL),
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
    let category:
      | {
          id: string;
          name: string;
          seo_title?: string;
          seo_description?: string;
        }
      | undefined;
    const guide = guides.find((g) => guideURL(g) === path);
    let canonical = path;
    let status = 200;
    if (path.startsWith("/design/") || path.startsWith("/product/")) {
      const id = path.split("/").at(-1)!;
      product =
        (await c.env.DB.prepare(
          "SELECT id,name,description,images,status,material,seo_title,seo_description FROM products WHERE id=? AND status!='archived'",
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
        (await c.env.DB.prepare(
          "SELECT id,name,seo_title,seo_description FROM categories WHERE id=?",
        )
          .bind(id)
          .first<{
            id: string;
            name: string;
            seo_title: string;
            seo_description: string;
          }>()) || undefined;
      if (category) {
        category = categoryLabel(category);
        canonical = categoryURL(category);
        if (path !== canonical) return c.redirect(canonical, 301);
      } else status = 404;
    } else if (
      !["/", "/about", "/contact", "/admin", "/guides"].includes(path) &&
      !guide
    )
      status = 404;
    const metadata = pageMetadata(
      status === 404 ? "/missing" : path,
      product,
      category,
      (await publicBusiness(c.env)).service_area,
    );
    const noindex =
      c.env.PREVIEW_MODE === "true" ||
      status === 404 ||
      path.startsWith("/admin");
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
    let summary: string;
    if (product) {
      const primary = JSON.parse(product.images)[0] as string;
      const alt = await c.env.DB.prepare(
        `SELECT COALESCE(t.alt,m.alt,?) AS alt FROM products p
        LEFT JOIN product_image_text t ON t.product_id=p.id AND t.url=?
        LEFT JOIN media_objects m ON m.product_id=p.id AND '/media/'||m.id=? WHERE p.id=?`,
      )
        .bind(product.name, primary, primary, product.id)
        .first<{ alt: string }>();
      summary = `<h1>${escape(product.name)}</h1><p>${escape(product.description)}</p><p>${product.status === "concept" ? "Design concept / illustrative image. Manufacturer approval required." : "Owner-approved design. Confirm details with your quotation."}</p><img src="${escape(primary)}" alt="${escape(alt?.alt || product.name)}" width="800" height="500"/><a href="/contact">Discuss this design</a>`;
    } else if (category) {
      const content = categoryContent(category);
      const items = await c.env.DB.prepare(
        "SELECT id,name FROM products WHERE category_id=? AND status!='archived' ORDER BY name LIMIT 100",
      )
        .bind(category.id)
        .all<{ id: string; name: string }>();
      summary = `<h1>${escape(category.name)} design concepts</h1><p>${escape(content.intro)}</p><ul>${content.checks.map((text) => `<li>${escape(text)}</li>`).join("")}</ul><p><a href="/guides/measure-for-furniture">Measuring guide</a> · <a href="/guides/compare-furniture-quotes">Materials and quotation guide</a></p><h2>Explore ${escape(category.name.toLowerCase())}</h2>${items.results.length ? `<ul>${items.results.map((p) => `<li><a href="${escape(productURL(p))}">${escape(p.name)}</a></li>`).join("")}</ul>` : `<p>No designs are published in this category yet. <a href="/contact">Discuss a custom request</a>.</p>`}`;
    } else if (guide) {
      summary = `<article><h1>${escape(guide.title)}</h1><p>${escape(guide.description)}</p>${guide.sections.map((s) => `<section><h2>${escape(s.title)}</h2><p>${escape(s.text)}</p></section>`).join("")}<a href="/guides">All buying guides</a></article>`;
    } else if (path === "/guides") {
      summary = `<h1>Furniture buying guides</h1>${guides.map((g) => `<article><h2><a href="${guideURL(g)}">${escape(g.title)}</a></h2><p>${escape(g.description)}</p></article>`).join("")}`;
    } else
      summary = `<h1>${escape(metadata.title)}</h1><p>${escape(metadata.description)}</p>`;
    if (path === "/") {
      const collections = await publicCategories(c.env);
      summary += `<nav aria-label="Furniture collections"><ul>${collections.map((c) => `<li><a href="${escape(categoryURL(c))}">${escape(c.name)}</a></li>`).join("")}</ul></nav>`;
    }
    html = html.replace(
      '<div id="root"></div>',
      `<div id="root"><main>${summary}<p><a href="/">Explore furniture</a> · <a href="/guides">Buying guides</a></p></main></div>`,
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
