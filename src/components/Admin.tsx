import { useEffect, useState } from "react";
import {
  Plus,
  LogOut,
  Save,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Trash2,
  Pencil,
} from "lucide-react";
import { api, send, money, type Product, type Category } from "../lib/api";
import ImageManager from "./ImageManager";
import LeadPanel from "./LeadPanel";
import BusinessEditor from "./BusinessEditor";
import StorageCleanup from "./StorageCleanup";
type Quote = {
  id: string;
  reference: string;
  name: string;
  email: string;
  phone: string;
  area: string;
  status: string;
  internal_cost: number;
  final_price: number | null;
  email_status: string;
  email_attempts: number;
  created_at: string;
  source: string;
  owner_notes: string;
  follow_up_date: string | null;
  configuration: {
    length: number;
    width: number;
    height: number;
    material: string;
    color: string;
    notes: string;
  };
  product_snapshot: Product;
};
type Audit = {
  id: string;
  product_id: string;
  old_price: number | null;
  new_price: number | null;
  created_at: string;
};
type Data = {
  products: Product[];
  quotes: Quote[];
  categories: Category[];
  audit: Audit[];
  settings: { minimum_margin: number };
};
const statuses = [
  "New",
  "Reviewing",
  "Quoted",
  "Confirmed",
  "Manufacturing",
  "Delivered",
  "Closed",
];
export default function Admin({ onChange }: { onChange: () => unknown }) {
  const [auth, setAuth] = useState<boolean | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("inquiries");
  const [editing, setEditing] = useState<Product | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [categoryName, setCategoryName] = useState("");
  async function load() {
    try {
      setData(await api<Data>("/admin/data"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    api<{ authenticated: boolean }>("/auth/session")
      .then((s) => {
        setAuth(s.authenticated);
        if (s.authenticated) void load();
      })
      .catch((e) => setError(e.message));
  }, []);
  async function action(fn: () => Promise<unknown>, message = "Saved.") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      await load();
      onChange();
      setNotice(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError("");
    try {
      await api("/auth/logout", send("POST"));
      setData(null);
      setAuth(false);
      setNotice("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = new FormData(e.currentTarget).get("password");
    setBusy(true);
    setError("");
    try {
      await api("/auth/login", send("POST", { password }));
      setAuth(true);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (auth === null)
    return (
      <section className="container prose">
        <p role="status">Checking owner session…</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </section>
    );
  if (!auth)
    return (
      <section className="login">
        <ShieldCheck size={34} />
        <p className="eyebrow">AARANYA LIVING · PRIVATE OWNER STUDIO</p>
        <h1>
          Your collection.
          <br />
          <em>Your craft.</em>
        </h1>
        <p>
          Sign in to manage designs, starting prices and customer inquiries.
        </p>
        <form onSubmit={login}>
          <label>
            Owner password
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              maxLength={256}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="btn" disabled={busy}>
            {busy ? "Signing in…" : "Enter owner studio"}{" "}
            <ArrowRight size={18} />
          </button>
        </form>
        <small className="muted">
          Owner access must be configured on the server. There is no default
          password.
        </small>
      </section>
    );
  const newProduct: Product = {
    id: "",
    name: "",
    category_id: data?.categories[0]?.id || "",
    description: "",
    material: "Oak",
    finish: "Matte",
    length: 120,
    width: 60,
    height: 75,
    price: null,
    status: "concept",
    images: ["/assets/desks-0.svg"],
    colors: ["Natural"],
    materials: ["Oak"],
    model: null,
    internal_cost: 0,
  };
  return (
    <section className="container admin">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AARANYA LIVING · PRIVATE OWNER STUDIO</p>
          <h1>Room to create.</h1>
        </div>
        <button
          className="btn secondary"
          disabled={busy}
          onClick={() => void logout()}
        >
          <LogOut size={17} /> Sign out
        </button>
      </div>
      <div className="admin-stats">
        <div>
          <strong>{data?.products.length ?? "—"}</strong>
          <span>Designs in your studio</span>
        </div>
        <div>
          <strong>
            {data?.quotes.filter((q) => q.status === "New").length ?? "—"}
          </strong>
          <span>New conversations</span>
        </div>
        <div>
          <strong>
            {data?.quotes.filter((q) =>
              ["failed", "disabled"].includes(q.email_status),
            ).length ?? "—"}
          </strong>
          <span>Email deliveries need attention</span>
        </div>
      </div>
      <div className="category-tabs" aria-label="Studio sections">
        {[
          "inquiries",
          "leads",
          "products",
          "categories",
          "price history",
          "settings",
        ].map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => {
              setTab(t);
              setEditing(null);
              setNotice("");
              setError("");
            }}
          >
            {t}
          </button>
        ))}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {!data ? (
        <button className="btn" onClick={() => void load()}>
          Load studio
        </button>
      ) : (
        <>
          {tab === "leads" && (
            <LeadPanel
              leads={data.quotes}
              busy={busy}
              save={(id, body) =>
                action(
                  () => api(`/admin/leads/${id}`, send("PUT", body)),
                  "Lead follow-up saved.",
                )
              }
            />
          )}
          {tab === "inquiries" && (
            <>
              <div className="filters">
                <label className="search">
                  <span className="sr-only">Search inquiries</span>
                  <input
                    type="search"
                    placeholder="Search by reference, name, area or design…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <label>
                  <span className="sr-only">Inquiry status filter</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {statuses.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="inquiries">
                {data.quotes
                  .filter(
                    (q) =>
                      (status === "all" || q.status === status) &&
                      `${q.reference} ${q.name} ${q.area} ${q.product_snapshot.name}`
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                  )
                  .map((q) => (
                    <Inquiry
                      key={q.id + q.status + q.final_price + q.internal_cost}
                      quote={q}
                      minimum={data.settings.minimum_margin}
                      busy={busy}
                      save={async (body) => {
                        const result = await action(() =>
                          api<{ warning: string | null }>(
                            `/admin/quotes/${q.id}`,
                            send("PUT", body),
                          ),
                        );
                        if (
                          result &&
                          typeof result === "object" &&
                          "warning" in result &&
                          result.warning
                        )
                          setNotice(String(result.warning));
                      }}
                      retry={() =>
                        void action(
                          () =>
                            api(`/admin/quotes/${q.id}/retry`, send("POST")),
                          "Notification attempt completed. Check delivery status below.",
                        )
                      }
                    />
                  ))}
                {data.quotes.length === 0 && (
                  <div className="empty">
                    <h2>No inquiries yet.</h2>
                    <p>New customer conversations will appear here.</p>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === "products" &&
            (editing ? (
              <ProductEditor
                key={editing.id}
                product={editing}
                categories={data.categories}
                busy={busy}
                cancel={() => setEditing(null)}
                save={async (p) => {
                  const result = await action(
                    () =>
                      api(
                        editing.id
                          ? `/admin/products/${editing.id}`
                          : "/admin/products",
                        send(editing.id ? "PUT" : "POST", p),
                      ),
                    "Design saved. Public catalog updated.",
                  );
                  if (result) setEditing(null);
                }}
              />
            ) : (
              <>
                <div className="section-heading">
                  <h2>Your designs</h2>
                  <button
                    className="btn"
                    disabled={!data.categories.length}
                    onClick={() => setEditing(newProduct)}
                  >
                    <Plus size={17} /> Add design
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Design</th>
                        <th>Starting price</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="table-product">
                              <img src={p.images[0]} alt="" />
                              {p.name}
                            </div>
                          </td>
                          <td>{money(p.price)}</td>
                          <td>{p.status}</td>
                          <td>
                            <div className="actions">
                              <button
                                className="btn secondary small"
                                onClick={() => setEditing(p)}
                                aria-label={`Edit ${p.name}`}
                              >
                                <Pencil size={15} /> Edit
                              </button>
                              <button
                                className="icon danger"
                                disabled={busy}
                                aria-label={`Delete ${p.name}`}
                                onClick={() => {
                                  if (
                                    confirm(
                                      `Delete ${p.name}? Existing inquiry snapshots will be preserved.`,
                                    )
                                  )
                                    void action(
                                      () =>
                                        api(
                                          `/admin/products/${p.id}`,
                                          send("DELETE"),
                                        ),
                                      "Design deleted.",
                                    );
                                }}
                              >
                                <Trash2 size={17} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ))}
          {tab === "categories" && (
            <>
              <h2>Collection categories</h2>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(() =>
                    api(
                      "/admin/categories",
                      send("POST", { name: categoryName }),
                    ),
                  ).then((result) => {
                    if (result) setCategoryName("");
                  });
                }}
              >
                <label>
                  New category name
                  <input
                    required
                    minLength={2}
                    maxLength={80}
                    value={categoryName}
                    onChange={(e) => setCategoryName(e.target.value)}
                  />
                </label>
                <button className="btn" disabled={busy}>
                  Add category
                </button>
              </form>
              {data.categories.map((c) => (
                <form
                  className="category-row"
                  key={c.id + c.name}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const fields = new FormData(e.currentTarget);
                    const name = fields.get("name");
                    void action(() =>
                      api(
                        `/admin/categories/${c.id}`,
                        send("PUT", {
                          name,
                          seo_title: fields.get("seo_title"),
                          seo_description: fields.get("seo_description"),
                        }),
                      ),
                    );
                  }}
                >
                  <label className="grow">
                    <span className="sr-only">Rename {c.name}</span>
                    <input
                      name="name"
                      defaultValue={c.name}
                      required
                      minLength={2}
                      maxLength={80}
                    />
                  </label>
                  <details className="grow">
                    <summary>Search listing for {c.name}</summary>
                    <label>
                      SEO title for {c.name}
                      <input
                        name="seo_title"
                        maxLength={70}
                        defaultValue={c.seo_title || ""}
                      />
                    </label>
                    <label>
                      Meta description for {c.name}
                      <textarea
                        name="seo_description"
                        maxLength={180}
                        defaultValue={c.seo_description || ""}
                      />
                    </label>
                    <small>
                      Leave blank for defaults; save with Rename / save listing.
                    </small>
                  </details>
                  <button className="btn secondary" disabled={busy}>
                    Rename
                  </button>
                  <button
                    className="icon danger"
                    type="button"
                    aria-label={`Delete category ${c.name}`}
                    disabled={busy}
                    onClick={() => {
                      if (
                        confirm(`Delete ${c.name}? The category must be empty.`)
                      )
                        void action(() =>
                          api(`/admin/categories/${c.id}`, send("DELETE")),
                        );
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                </form>
              ))}
            </>
          )}
          {tab === "price history" && (
            <>
              <h2>Starting price audit</h2>
              <p className="muted">
                Every starting price change is captured by the server, including
                the previous value.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Design</th>
                      <th>Previous</th>
                      <th>Updated</th>
                      <th>Recorded (UTC)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.audit.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {data.products.find((p) => p.id === a.product_id)
                            ?.name || `Deleted design (${a.product_id})`}
                        </td>
                        <td>{money(a.old_price)}</td>
                        <td>{money(a.new_price)}</td>
                        <td>{a.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.audit.length && <p>No price changes recorded.</p>}
            </>
          )}
          {tab === "settings" && (
            <>
              <BusinessEditor onSaved={onChange} />
              <h2>Quote guardrails</h2>
              <form
                className="settings-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(() =>
                    api(
                      "/admin/settings",
                      send("PUT", {
                        minimum_margin: Number(
                          new FormData(e.currentTarget).get("minimum_margin"),
                        ),
                      }),
                    ),
                  );
                }}
              >
                <label>
                  Minimum margin (%)
                  <input
                    type="number"
                    name="minimum_margin"
                    min="0"
                    max="99"
                    step="0.1"
                    defaultValue={data.settings.minimum_margin}
                    required
                  />
                </label>
                <button className="btn" disabled={busy}>
                  <Save size={17} /> Save margin
                </button>
              </form>
              <p>
                Margin = (final price − internal cost) ÷ final price. Quotes
                below this threshold display a warning.
              </p>
              <StorageCleanup />
              <h3>Authentication, contact & email</h3>
              <p>
                Configure server secrets and environment variables using the
                deployment guide. Contacts are shown to customers only once
                configured. Notifications go to one configured owner email.
                Local email status means no message was sent.
              </p>
              <p className="muted">
                Customer records and internal costs are private. Export and
                retention procedures are documented in the README.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
function ProductEditor({
  product,
  categories,
  busy,
  cancel,
  save,
}: {
  product: Product;
  categories: Category[];
  busy: boolean;
  cancel: () => void;
  save: (p: unknown) => Promise<void>;
}) {
  const [p, setP] = useState(product);
  const [imageBusy, setImageBusy] = useState(false);
  const [images, setImages] = useState(p.images.join("\n"));
  const [colors, setColors] = useState(p.colors.join(", "));
  const [materials, setMaterials] = useState(p.materials.join(", "));
  function update(key: string, value: unknown) {
    setP((v) => ({ ...v, [key]: value }));
  }
  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        const { id, internal_cost, ...rest } = p;
        void save({
          ...rest,
          images: images
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
          colors: colors
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          materials: materials
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          internal_cost: internal_cost ?? 0,
        });
      }}
    >
      <div className="section-heading">
        <h2>{p.id ? "Edit design" : "A new design"}</h2>
        <button className="btn secondary" type="button" onClick={cancel}>
          Cancel
        </button>
      </div>
      <div className="two-fields">
        <label>
          Design name
          <input
            required
            minLength={2}
            maxLength={120}
            value={p.name}
            onChange={(e) => update("name", e.target.value)}
          />
        </label>
        <label>
          Category
          <select
            value={p.category_id}
            onChange={(e) => update("category_id", e.target.value)}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Description
        <textarea
          required
          minLength={10}
          maxLength={3000}
          rows={3}
          value={p.description}
          onChange={(e) => update("description", e.target.value)}
        />
      </label>
      <fieldset>
        <legend>Search listing (optional)</legend>
        <label>
          SEO title
          <input
            maxLength={70}
            value={p.seo_title || ""}
            onChange={(e) => update("seo_title", e.target.value)}
          />
        </label>
        <label>
          Meta description
          <textarea
            maxLength={180}
            rows={2}
            value={p.seo_description || ""}
            onChange={(e) => update("seo_description", e.target.value)}
          />
        </label>
        <p className="muted small">
          Leave blank for defaults. Describe this design truthfully; use only
          verified service areas.
        </p>
      </fieldset>
      <div className="three-fields">
        <label>
          Starting price (₹, blank = on request)
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            value={p.price === null ? "" : p.price / 100}
            onChange={(e) =>
              update(
                "price",
                e.target.value === ""
                  ? null
                  : Math.round(Number(e.target.value) * 100),
              )
            }
          />
        </label>
        <label>
          Internal cost (₹, private)
          <input
            type="number"
            min="0"
            max="1000000"
            step="0.01"
            value={(p.internal_cost ?? 0) / 100}
            onChange={(e) =>
              update("internal_cost", Math.round(Number(e.target.value) * 100))
            }
          />
        </label>
        <label>
          Status
          <select
            value={p.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="concept">Demo concept</option>
            <option value="available">Available (owner approved)</option>
            <option value="archived">Archived (hidden)</option>
          </select>
        </label>
      </div>
      <div className="three-fields">
        {(["length", "width", "height"] as const).map((k) => (
          <label key={k}>
            {k[0].toUpperCase() + k.slice(1)} (cm)
            <input
              required
              type="number"
              min={k === "height" ? 10 : 20}
              max={k === "length" ? 500 : 300}
              step="0.1"
              value={p[k]}
              onChange={(e) => update(k, Number(e.target.value))}
            />
          </label>
        ))}
      </div>
      <div className="two-fields">
        <label>
          Primary material
          <input
            required
            maxLength={80}
            value={p.material}
            onChange={(e) => update("material", e.target.value)}
          />
        </label>
        <label>
          Finish
          <input
            required
            maxLength={80}
            value={p.finish}
            onChange={(e) => update("finish", e.target.value)}
          />
        </label>
        <label>
          Material options (comma separated)
          <input
            required
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
          />
        </label>
        <label>
          Color options (comma separated)
          <input
            required
            value={colors}
            onChange={(e) => setColors(e.target.value)}
          />
        </label>
      </div>
      {p.id ? (
        <ImageManager
          id={p.id}
          onBusy={setImageBusy}
          onChange={(urls) => {
            setImages(urls.join("\n"));
            setP((current) => ({ ...current, images: urls }));
          }}
        />
      ) : (
        <p className="notice">
          Save the design first, then upload and arrange its gallery. A labeled
          placeholder is used initially.
        </p>
      )}
      <label>
        Optional 3D concept geometry
        <select
          value={p.model || ""}
          onChange={(e) => update("model", e.target.value || null)}
        >
          <option value="">Gallery only</option>
          <option value="sofas">Generic sofa demo</option>
          <option value="dining">Generic dining table demo</option>
          <option value="desks">Generic desk demo</option>
        </select>
      </label>
      <button className="btn" disabled={busy || imageBusy}>
        <Save size={17} />
        {busy ? "Saving…" : "Save design"}
      </button>
    </form>
  );
}
function Inquiry({
  quote: q,
  minimum,
  busy,
  save,
  retry,
}: {
  quote: Quote;
  minimum: number;
  busy: boolean;
  save: (body: unknown) => Promise<void>;
  retry: () => void;
}) {
  const [status, setStatus] = useState(q.status);
  const [cost, setCost] = useState(q.internal_cost / 100);
  const [price, setPrice] = useState(
    q.final_price === null ? "" : String(q.final_price / 100),
  );
  const margin =
    Number(price) > 0 ? ((Number(price) - cost) / Number(price)) * 100 : null;
  return (
    <details className="inquiry">
      <summary>
        <div>
          <span className="eyebrow">{q.reference}</span>
          <h3>
            {q.name} <span className="badge">{q.status}</span>
          </h3>
          <p>
            {q.product_snapshot.name} · {q.area} · {q.created_at} UTC
          </p>
        </div>
        <span className={`delivery ${q.email_status}`}>
          Email: {q.email_status}
        </span>
      </summary>
      <div className="inquiry-body">
        <div className="two-fields">
          <section>
            <h4>Contact</h4>
            <a href={`mailto:${q.email}`}>{q.email}</a>
            <p>
              <a href={`tel:${q.phone}`}>{q.phone}</a>
            </p>
            <p>{q.area}</p>
            <small>Customer consent to contact recorded.</small>
          </section>
          <section>
            <h4>Requested configuration</h4>
            <p>
              {q.configuration.length} × {q.configuration.width} ×{" "}
              {q.configuration.height} cm
            </p>
            <p>
              {q.configuration.material} / {q.configuration.color}
            </p>
            <p className="notes">
              {q.configuration.notes || "No additional notes."}
            </p>
            <small>
              Starting price at inquiry: {money(q.product_snapshot.price)}
            </small>
          </section>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              status,
              internal_cost: Math.round(cost * 100),
              final_price:
                price === "" ? null : Math.round(Number(price) * 100),
            });
          }}
        >
          <div className="three-fields">
            <label>
              Inquiry status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Internal cost (₹)
              <input
                required
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(Number(e.target.value))}
              />
            </label>
            <label>
              Final quote (₹)
              <input
                type="number"
                min="0.01"
                max="1000000"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </label>
          </div>
          {margin !== null && (
            <p className={margin < minimum ? "error" : "notice"} role="status">
              Margin: {margin.toFixed(1)}%
              {margin < minimum ? ` — Below the ${minimum}% minimum.` : ""}
            </p>
          )}
          <div className="actions">
            <button className="btn" disabled={busy}>
              <Save size={17} /> Save inquiry
            </button>
            <button
              className="btn secondary"
              type="button"
              disabled={busy || q.email_status === "sent"}
              onClick={retry}
            >
              <RefreshCw size={16} /> Retry notification
            </button>
          </div>
          <p className="muted small">
            Email delivery: {q.email_status}. Attempts: {q.email_attempts}.
            “Local” means simulated only; “disabled” requires provider
            configuration. Saving a final quote does not send it to the
            customer.
          </p>
        </form>
      </div>
    </details>
  );
}
