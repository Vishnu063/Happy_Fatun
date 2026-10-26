import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  SlidersHorizontal,
  Armchair,
  Menu,
  X,
  Leaf,
  Ruler,
} from "lucide-react";
import { api, type Category, type Product } from "./lib/api";
import ProductDetail from "./components/ProductDetail";
import ProductCard from "./components/ProductCard";
import BrandMark from "./components/BrandMark";
import { currentPath, navigate, interceptNavigation } from "./lib/navigation";
import { pageMetadata, productURL, categoryURL } from "../shared/seo";
import Contact from "./components/Contact";
import Guides from "./components/Guides";
import { guides, guideURL, categoryContent } from "../shared/content";
import { captureSource, type Business } from "./lib/contact";
import { priorityCategories, featuredProducts } from "../shared/catalog";
const Admin = lazy(() => import("./components/Admin"));
export default function App() {
  const [preview, setPreview] = useState(false);
  const [route, setRoute] = useState(currentPath);
  const [business, setBusiness] = useState<Business | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [material, setMaterial] = useState("all");
  const [sort, setSort] = useState("name");
  const [budget, setBudget] = useState("");
  const [menu, setMenu] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  useEffect(() => {
    if (visibleCount > 24)
      document
        .querySelector<HTMLAnchorElement>(
          `#collection .product-card:nth-child(${visibleCount - 23}) .product-link`,
        )
        ?.focus();
  }, [visibleCount]);
  useEffect(
    () => setVisibleCount(24),
    [query, category, material, budget, sort],
  );
  const load = () =>
    api<{ products: Product[]; categories: Category[]; preview: boolean }>(
      route.startsWith("/collections/")
        ? `/catalog?category_id=${encodeURIComponent(route.split("/").at(-1)!)}`
        : "/catalog",
    )
      .then(async (data) => {
        setBusiness(await api<Business>("/business"));
        if (
          (route.startsWith("/design/") || route.startsWith("/product/")) &&
          !data.products.some((p) => p.id === route.split("/").at(-1))
        ) {
          const extra = await api<{ product: Product }>(
            `/products/${encodeURIComponent(route.split("/").at(-1)!)}`,
          );
          data.products.push(extra.product);
        }
        setPreview(data.preview);
        setProducts(data.products);
        setCategories(data.categories);
        setError("");
        setLoaded(true);
      })
      .catch((e) => {
        setError(e.message);
        setLoaded(true);
      });
  useEffect(() => {
    captureSource();
    const change = () => {
      setRoute(currentPath());
      captureSource();
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    window.addEventListener("popstate", change);
    document.addEventListener("click", interceptNavigation);
    return () => {
      window.removeEventListener("hashchange", change);
      window.removeEventListener("popstate", change);
      document.removeEventListener("click", interceptNavigation);
    };
  }, []);
  useEffect(() => {
    if (!route.startsWith("/admin")) void load();
  }, [route]);
  const visible = products
    .filter(
      (p) =>
        priorityCategories.some((id) => id === p.category_id) ||
        route.startsWith("/collections/"),
    )
    .filter(
      (p) =>
        (category === "all" || p.category_id === category) &&
        (material === "all" || p.materials.includes(material)) &&
        (!budget || (p.price !== null && p.price <= Number(budget) * 100)) &&
        `${p.name} ${p.description} ${p.material} ${categories.find((c) => c.id === p.category_id)?.name}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "low"
        ? (a.price ?? Infinity) - (b.price ?? Infinity)
        : sort === "high"
          ? (b.price ?? -1) - (a.price ?? -1)
          : a.name.localeCompare(b.name),
    );
  const collection = route.startsWith("/collections/")
    ? categories.find((c) => c.id === route.split("/").at(-1))
    : undefined;
  const isDesign =
    route.startsWith("/product/") || route.startsWith("/design/");
  const selected = isDesign
    ? products.find((p) => p.id === route.split("/").at(-1))
    : undefined;
  useEffect(() => {
    if (collection) setCategory(collection.id);
    else if (route === "/") setCategory("all");
    if (!loaded && (isDesign || route.startsWith("/collections/"))) return;
    const meta = pageMetadata(
      route,
      selected,
      collection,
      business?.service_area,
    );
    document.title = meta.title;
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute("content", meta.description);
    let canonical = document.querySelector<HTMLLinkElement>(
      'link[rel="canonical"]',
    );
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.appendChild(robots);
    }
    robots.content =
      preview ||
      route.startsWith("/admin") ||
      (!selected &&
        !collection &&
        ![
          "/",
          "/contact",
          "/about",
          "/guides",
          ...guides.map(guideURL),
        ].includes(route))
        ? "noindex, nofollow"
        : "index, follow";
    canonical.href =
      location.origin +
      (selected
        ? productURL(selected)
        : collection
          ? categoryURL(collection)
          : route);
    if (selected && route.startsWith("/product/"))
      navigate(productURL(selected), true);
    else if (location.hash.startsWith("#/") && !isDesign) navigate(route, true);
  }, [route, selected, collection, business, preview]);
  const browse = (id = "all") => {
    setCategory(id);
    setQuery("");
    const target = categories.find((c) => c.id === id);
    navigate(target ? categoryURL(target) : "/");
    setTimeout(
      () =>
        document
          .getElementById("collection")
          ?.scrollIntoView({ behavior: "smooth" }),
      50,
    );
  };
  return (
    <>
      <a
        className="skip"
        href="#main"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById("main")?.focus();
        }}
      >
        Skip to content
      </a>
      <aside className="announcement" aria-label="Studio announcement">
        Thoughtfully imagined. Personally made.{" "}
        <span>A considered approach to furniture.</span>
      </aside>
      <header className="site-header">
        <a className="brand" href="/">
          <BrandMark />
          <span>
            Aaranya Living
            <span className="brand-sub">WHERE NATURE MEETS CRAFTSMANSHIP.</span>
          </span>
        </a>
        <nav aria-label="Main navigation" className={menu ? "nav open" : "nav"}>
          <button onClick={() => browse()}>Explore furniture</button>
          <a href="/about">Our approach</a>
          <a href="/guides">Buying guides</a>
          <a href="/contact">Contact</a>
          <a href="/admin">
            Owner studio <ArrowUpRight size={14} />
          </a>
        </nav>
        <button
          className="icon mobile-menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <button className="header-cta" onClick={() => browse()}>
          Find your piece <ArrowUpRight size={16} />
        </button>
      </header>
      <main id="main" tabIndex={-1}>
        {route.startsWith("/admin") ? (
          <Suspense
            fallback={<p className="container">Loading owner studio…</p>}
          >
            <Admin onChange={load} />
          </Suspense>
        ) : route === "/guides" || guides.some((g) => guideURL(g) === route) ? (
          <Guides path={route} />
        ) : route === "/contact" ? (
          <Contact business={business} />
        ) : route === "/about" ? (
          <section className="container prose">
            <p className="eyebrow">THE AARANYA LIVING APPROACH</p>
            <h1>
              Good furniture begins
              <br />
              with a conversation.
            </h1>
            <p>
              Browse ideas, make a design your own, and tell us about your
              space. Every inquiry is reviewed for feasibility before the owner
              provides a final quotation.
            </p>
            <h2>Concepts, clearly presented.</h2>
            <p>
              Our initial collection contains original illustrative demo
              designs. These are not photos of manufactured inventory.
              Materials, availability, delivery area, installation and lead
              times require manufacturer confirmation.
            </p>
            <h2>Built around your space.</h2>
            <p>
              Choose dimensions in centimetres, a preferred material and a
              color. These choices describe your request; they do not constitute
              an accepted order or a fixed price.
            </p>
            <a className="btn" href="/">
              Explore the collection <ArrowRight size={18} />
            </a>
          </section>
        ) : selected ? (
          <ProductDetail
            key={selected.id}
            product={selected}
            business={business}
            related={products
              .filter(
                (p) =>
                  p.category_id === selected.category_id &&
                  p.id !== selected.id,
              )
              .slice(0, 3)}
          />
        ) : isDesign ? (
          <div className="container prose">
            <h1>{loaded ? "Design not found" : "Loading design…"}</h1>
            <a href="/">Back to collection</a>
          </div>
        ) : route !== "/" && !collection ? (
          <section className="container prose">
            <h1>Page not found.</h1>
            <a className="btn" href="/">
              Explore the collection
            </a>
          </section>
        ) : (
          <>
            {collection && (
              <section className="container prose">
                <p className="eyebrow">
                  PLAN YOUR {collection.name.toUpperCase()} REQUEST
                </p>
                <h1>{collection.name} design concepts</h1>
                <p>{categoryContent(collection).intro}</p>
                <ul>
                  {categoryContent(collection).checks.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
                <p>
                  <a href="/guides/measure-for-furniture">Measuring guide</a> ·{" "}
                  <a href="/guides/compare-furniture-quotes">
                    Materials and quotation guide
                  </a>
                </p>
              </section>
            )}
            {!collection && (
              <section className="hero">
                <div className="hero-copy">
                  <p className="eyebrow">
                    <span /> A HOME, UNIQUELY YOURS
                  </p>
                  <h1>
                    Furniture with soul.
                    <br />
                    <em>Made for your life.</em>
                  </h1>
                  <p>
                    Considered forms. Honest materials. Explore furniture
                    concepts and shape them around the way you live.
                  </p>
                  <form
                    className="hero-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setCategory("all");
                      navigate("/");
                      setTimeout(() => {
                        document.getElementById("collection")?.scrollIntoView();
                        document
                          .getElementById("catalog-search")
                          ?.focus({ preventScroll: true });
                      }, 0);
                    }}
                  >
                    <label>
                      <span className="sr-only">
                        Search all furniture designs
                      </span>
                      <input
                        type="search"
                        placeholder="Find your next furniture idea…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <button
                      type="submit"
                      className="icon"
                      aria-label="Search the collection"
                    >
                      <Search size={20} />
                    </button>
                  </form>
                  <button className="btn" onClick={() => browse()}>
                    Explore the collection <ArrowUpRight size={19} />
                  </button>
                  <div className="hero-note">
                    <span className="line" /> YOUR SPACE. YOUR DIMENSIONS. YOUR
                    STORY.
                  </div>
                </div>
                <div className="hero-art">
                  <img
                    src="/assets/pilot/dining-studio.webp"
                    width={1200}
                    height={900}
                    alt="Original illustrative oak dining table concept on a warm white studio background"
                    fetchPriority="high"
                  />
                  <span className="art-tag">
                    THE CONCEPT COLLECTION <span>01 / Dining</span>
                  </span>
                  <div className="art-caption">
                    Quiet forms.
                    <br />
                    <em>Endless possibilities.</em>
                  </div>
                  <span className="image-disclosure">
                    AI-generated design concept · Not manufactured stock
                  </span>
                </div>
              </section>
            )}
            <section className="values" aria-label="Our process" tabIndex={0}>
              <div>
                <Ruler size={22} />
                <span>
                  Made to your measure
                  <small>Dimensions that fit your space</small>
                </span>
              </div>
              <div>
                <Leaf size={22} />
                <span>
                  Materials, considered
                  <small>Explore your preferred finish</small>
                </span>
              </div>
              <div>
                <Armchair size={22} />
                <span>
                  A personal conversation
                  <small>Request a quote, without checkout</small>
                </span>
              </div>
            </section>
            {!collection && (
              <section
                className="featured container"
                aria-label="Featured design concepts"
              >
                <p className="eyebrow">SELECTED IDEAS</p>
                <h2>Five ways to make room for you.</h2>
                <div className="product-grid">
                  {featuredProducts
                    .map((id) => products.find((p) => p.id === id))
                    .filter((p): p is Product => !!p)
                    .map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                </div>
              </section>
            )}
            <section id="collection" className="collection container">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">THE COLLECTION</p>
                  <h2>Find a place for something beautiful.</h2>
                </div>
                <span className="muted">
                  {products.length} ideas. Your possibilities.
                </span>
              </div>
              <div
                className="category-tabs"
                role="group"
                aria-label="Furniture categories"
              >
                <button
                  className={category === "all" ? "active" : ""}
                  onClick={() => browse()}
                >
                  All furniture
                </button>
                {categories
                  .filter((c) => priorityCategories.some((id) => id === c.id))
                  .map((c) => (
                    <button
                      key={c.id}
                      className={category === c.id ? "active" : ""}
                      onClick={() => browse(c.id)}
                    >
                      {c.name}
                    </button>
                  ))}
              </div>
              <div className="filters">
                <label className="search">
                  <Search size={19} />
                  <span className="sr-only">Search furniture</span>
                  <input
                    id="catalog-search"
                    type="search"
                    placeholder="Search designs, materials, a little inspiration…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <SlidersHorizontal size={18} aria-hidden="true" />
                <label>
                  <span className="sr-only">Material filter</span>
                  <select
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                  >
                    <option value="all">All materials</option>
                    {Array.from(
                      new Set(products.flatMap((p) => p.materials)),
                    ).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="sr-only">
                    Maximum starting price in rupees
                  </span>
                  <input
                    className="budget"
                    type="number"
                    min="0"
                    placeholder="Max ₹"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Sort designs</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="name">Name, A–Z</option>
                    <option value="low">Price, low to high</option>
                    <option value="high">Price, high to low</option>
                  </select>
                </label>
              </div>
              <div className="collection-meta">
                <span>{visible.length} designs</span>
                <span>Demo concepts · Manufacturer approval required</span>
              </div>
              {error ? (
                <div role="alert" className="notice">
                  {error} <button onClick={() => void load()}>Try again</button>
                </div>
              ) : !loaded ? (
                <p role="status">Loading the collection…</p>
              ) : !visible.length ? (
                <div className="empty">
                  <h3>No designs match just yet.</h3>
                  <p>
                    Try a different search or reset your filters. Concepts
                    without a starting price are excluded by a price limit.
                  </p>
                  <button
                    className="btn secondary"
                    onClick={() => {
                      setQuery("");
                      setMaterial("all");
                      setBudget("");
                      browse();
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <>
                  <div className="product-grid">
                    {visible.slice(0, visibleCount).map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                  {visibleCount < visible.length && (
                    <div className="catalog-more">
                      <p role="status">
                        Showing {Math.min(visibleCount, visible.length)} of{" "}
                        {visible.length} matching designs
                      </p>
                      <button
                        className="btn secondary"
                        onClick={() => setVisibleCount((count) => count + 24)}
                      >
                        Load more designs
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
            <section className="order-process container">
              <p className="eyebrow">HOW CUSTOM ORDERS WORK</p>
              <h2>A considered journey, one conversation at a time.</h2>
              <ol>
                {[
                  ["Browse", "Explore clearly labeled design concepts."],
                  [
                    "Customize",
                    "Share dimensions, preferred materials and color.",
                  ],
                  [
                    "Request quote",
                    "Send a private inquiry with your consent.",
                  ],
                  [
                    "Discuss",
                    "Confirm feasibility, scope and a final price with the owner.",
                  ],
                  [
                    "Manufacture / deliver",
                    "Proceed only after agreement; timing and installation require confirmation.",
                  ],
                ].map(([title, text], i) => (
                  <li key={title}>
                    <span>0{i + 1}</span>
                    <h3>{title}</h3>
                    <p>{text}</p>
                  </li>
                ))}
              </ol>
            </section>
            <section className="local-intro container">
              <h2>
                Planning a furniture project
                {business?.service_area ? ` in ${business.service_area}` : ""}?
              </h2>
              <p>
                Tell us about your space and locality. Exact service areas,
                materials and delivery feasibility are confirmed during review.
              </p>
              <a className="btn secondary" href="/contact">
                Discuss your space
              </a>
            </section>
            <section className="bespoke">
              <p className="eyebrow">A LITTLE MORE YOU</p>
              <h2>
                Your favourite idea.
                <br />
                <em>Your perfect proportions.</em>
              </h2>
              <p>
                Start with a design. Choose your dimensions, material and color.
                <br />
                We’ll review the possibilities together.
              </p>
              <button className="btn light" onClick={() => browse()}>
                Make room for your ideas <ArrowUpRight size={18} />
              </button>
            </section>
          </>
        )}
      </main>
      <footer>
        <a href="/" className="brand">
          <BrandMark />
          <span>Aaranya Living</span>
        </a>
        <p>Where Nature Meets Craftsmanship.</p>
        <div>
          <a href="/about">How it works</a>
          <a href="/contact">Contact</a>
          <a href="/admin">Owner studio</a>
        </div>
        <small>
          Designs are illustrative concepts. All specifications and final prices
          require confirmation.
        </small>
      </footer>
    </>
  );
}
