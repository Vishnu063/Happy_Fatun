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
const Admin = lazy(() => import("./components/Admin"));
export default function App() {
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
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
  const load = () =>
    api<{ products: Product[]; categories: Category[] }>("/catalog")
      .then((data) => {
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
    void load();
    const change = () => {
      setRoute(location.hash.slice(1) || "/");
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    if (!route.startsWith("/admin")) void load();
  }, [route]);
  const visible = products
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
  const selected = route.startsWith("/product/")
    ? products.find((p) => p.id === decodeURIComponent(route.slice(9)))
    : undefined;
  const browse = (id = "all") => {
    setCategory(id);
    location.hash = "/";
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
      <div className="announcement">
        Thoughtfully imagined. Personally made.{" "}
        <span>A considered approach to furniture.</span>
      </div>
      <header className="site-header">
        <a className="brand" href="#/" aria-label="Happy Fatun home">
          <Armchair size={30} />
          <span>
            happy fatun<span className="brand-sub">FURNITURE & LIVING</span>
          </span>
        </a>
        <nav aria-label="Main navigation" className={menu ? "nav open" : "nav"}>
          <button onClick={() => browse()}>Explore furniture</button>
          <a href="#/about">Our approach</a>
          <a href="#/admin">
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
        ) : route === "/about" ? (
          <section className="container prose">
            <p className="eyebrow">THE HAPPY FATUN APPROACH</p>
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
            <a className="btn" href="#/">
              Explore the collection <ArrowRight size={18} />
            </a>
          </section>
        ) : selected ? (
          <ProductDetail
            key={selected.id}
            product={selected}
            related={products
              .filter(
                (p) =>
                  p.category_id === selected.category_id &&
                  p.id !== selected.id,
              )
              .slice(0, 3)}
          />
        ) : route.startsWith("/product/") ? (
          <div className="container prose">
            <h1>{loaded ? "Design not found" : "Loading design…"}</h1>
            <a href="#/">Back to collection</a>
          </div>
        ) : (
          <>
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
                  Considered forms. Honest materials. Explore furniture concepts
                  and shape them around the way you live.
                </p>
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
                  src="/assets/sofas-1.svg"
                  alt="Illustrated lounge sofa in a warm, minimal room"
                  fetchPriority="high"
                />
                <span className="art-tag">
                  THE CONCEPT COLLECTION <span>01 / Living</span>
                </span>
                <div className="art-caption">
                  Quiet forms.
                  <br />
                  <em>Endless possibilities.</em>
                </div>
                <span className="image-disclosure">
                  Original illustrative demo concept
                </span>
              </div>
            </section>
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
                  onClick={() => setCategory("all")}
                >
                  All furniture
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    className={category === c.id ? "active" : ""}
                    onClick={() => setCategory(c.id)}
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
                      setCategory("all");
                      setBudget("");
                    }}
                  >
                    Reset filters
                  </button>
                </div>
              ) : (
                <div className="product-grid">
                  {visible.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
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
        <a href="#/" className="brand">
          <Armchair size={26} />
          <span>happy fatun</span>
        </a>
        <p>Thoughtful furniture. Personal possibilities.</p>
        <div>
          <a href="#/about">How it works</a>
          <a href="#/admin">Owner studio</a>
        </div>
        <small>
          Designs are illustrative concepts. All specifications and final prices
          require confirmation.
        </small>
      </footer>
    </>
  );
}
