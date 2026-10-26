import { useEffect, useState } from "react";
import { api, send, type Product } from "../lib/api";
import {
  availabilityOptions,
  supplierMargin,
  type Supplier,
  type ProductSupplier,
} from "../../shared/suppliers";
const amount = (value: number | null) =>
  value === null
    ? "Not recorded"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(value / 100);
const field = (data: FormData, key: string) =>
  String(data.get(key) || "").trim();
const price = (data: FormData, key: string) =>
  field(data, key) === "" ? null : Math.round(Number(field(data, key)) * 100);
export default function SupplierPanel({
  products,
  productId,
}: {
  products: Product[];
  productId?: string;
}) {
  const [shops, setShops] = useState<Supplier[]>([]),
    [links, setLinks] = useState<ProductSupplier[]>([]);
  const [shopEdit, setShopEdit] = useState<Supplier | null>(null),
    [linkEdit, setLinkEdit] = useState<ProductSupplier | null>(null);
  const [query, setQuery] = useState(""),
    [product, setProduct] = useState(productId || ""),
    [location, setLocation] = useState(""),
    [shop, setShop] = useState(""),
    [availability, setAvailability] = useState(""),
    [scope, setScope] = useState("active");
  const [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function load() {
    const d = await api<{ suppliers: Supplier[]; links: ProductSupplier[] }>(
      "/admin/suppliers",
    );
    setShops(d.suppliers);
    setLinks(d.links);
    setLoaded(true);
  }
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    setProduct(productId || "");
  }, [productId]);
  async function action(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice(message);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  const match = (s: string) =>
    s.toLowerCase().includes(query.trim().toLowerCase());
  const visible = links
    .filter(
      (l) =>
        (!product || l.product_id === product) &&
        (!shop || l.supplier_id === shop) &&
        (!location || l.location === location) &&
        (!availability || l.availability === availability) &&
        (scope === "all" ||
          (scope === "archived"
            ? Boolean(l.archived || l.shop_archived)
            : !l.archived && !l.shop_archived)) &&
        match(
          `${l.product_name} ${l.shop_name} ${l.location || ""} ${l.address || ""} ${l.phone || ""} ${l.notes || ""}`,
        ),
    )
    .sort(
      (a, b) =>
        (a.supplier_cost ?? Infinity) - (b.supplier_cost ?? Infinity) ||
        a.shop_name.localeCompare(b.shop_name),
    );
  const shownShops = shops.filter(
    (s) =>
      (scope === "all" ||
        (scope === "archived" ? !!s.archived : !s.archived)) &&
      (!location || s.location === location) &&
      (!shop || s.id === shop) &&
      (match(
        `${s.name} ${s.location || ""} ${s.address || ""} ${s.phone || ""} ${s.notes || ""}`,
      ) ||
        links.some((l) => l.supplier_id === s.id && match(l.product_name))),
  );
  return (
    <section
      className="editor supplier-panel"
      aria-label={
        productId
          ? "Product shop and supplier tracking"
          : "Private shop and supplier tracking"
      }
    >
      <p className="eyebrow">MASTER CONTROL · PRIVATE SOURCING</p>
      <h2>Shop & Supplier Tracking</h2>
      <p>
        Supplier contacts, costs, intended selling prices and margins stay
        private. These records do not set public prices or confirm stock. Blank
        costs mean not recorded.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!loaded && <p>Loading private supplier records…</p>}
      <div className="supplier-filters two-fields">
        <label>
          Search suppliers
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Shop, product, locality, phone or notes"
          />
        </label>
        <label>
          Filter supplier product
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filter supplier shop
          <select value={shop} onChange={(e) => setShop(e.target.value)}>
            <option value="">All shops</option>
            {shops.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.archived ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Filter supplier location
          <select
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            <option value="">All locations</option>
            {Array.from(
              new Set(
                shops.map((s) => s.location).filter((v): v is string => !!v),
              ),
            )
              .sort()
              .map((v) => (
                <option key={v}>{v}</option>
              ))}
          </select>
        </label>
        <label>
          Filter supplier availability
          <select
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="">All availability</option>
            {Object.entries(availabilityOptions).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Supplier record visibility
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="active">Active records</option>
            <option value="archived">Archived records</option>
            <option value="all">All records</option>
          </select>
        </label>
      </div>
      <h3>Supplier cost comparison</h3>
      <p className="muted small">
        Recorded costs, lowest first. Compare the same specification and verify
        availability with the shop. Missing costs are not ranked as zero.
      </p>
      <div className="table-wrap">
        <table aria-label="Private supplier cost comparison">
          <thead>
            <tr>
              <th>Product / shop</th>
              <th>Contact / location</th>
              <th>Supplier cost</th>
              <th>Intended selling price</th>
              <th>Gross margin</th>
              <th>Availability / lead time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.product_name}
                  <br />
                  <strong>{l.shop_name}</strong>
                  {Boolean(l.archived || l.shop_archived) && (
                    <small> · Archived</small>
                  )}
                  <p className="small">{l.notes}</p>
                </td>
                <td>
                  {l.location || "Location not recorded"}
                  <br />
                  {l.address}
                  <br />
                  {l.phone || "Phone not recorded"}
                </td>
                <td>{amount(l.supplier_cost)}</td>
                <td>{amount(l.selling_price)}</td>
                <td>
                  {supplierMargin(l.supplier_cost, l.selling_price) === null
                    ? "Not calculated"
                    : `${supplierMargin(l.supplier_cost, l.selling_price)!.toFixed(1)}%`}
                </td>
                <td>
                  {availabilityOptions[l.availability]}
                  <br />
                  {l.lead_time || "Lead time not recorded"}
                </td>
                <td>
                  <div className="actions">
                    <button
                      className="btn secondary small"
                      disabled={busy}
                      type="button"
                      aria-label={`Edit terms for supplier link ${l.shop_name} for ${l.product_name}`}
                      onClick={() => {
                        setLinkEdit(l);
                        setNotice("");
                      }}
                    >
                      Edit terms
                    </button>
                    <button
                      className="btn secondary small"
                      disabled={busy || (!!l.archived && !!l.shop_archived)}
                      type="button"
                      aria-label={`${l.archived ? "Restore" : "Archive"} link for supplier ${l.shop_name} for ${l.product_name}`}
                      onClick={() =>
                        void action(
                          () =>
                            api(
                              `/admin/product-suppliers/${l.id}/archive`,
                              send("PATCH", { archived: !l.archived }),
                            ),
                          l.archived
                            ? "Supplier link restored."
                            : "Supplier link archived; costs and notes retained.",
                        )
                      }
                    >
                      {l.archived ? "Restore" : "Archive"} link
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {loaded && !visible.length && (
        <p className="empty">
          No supplier links match. Add a shop and link it to a product below.
        </p>
      )}
      <div className="supplier-editors">
        <form
          key={shopEdit?.id || "new-shop"}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              d = new FormData(form);
            void action(
              () =>
                api(
                  shopEdit
                    ? `/admin/suppliers/${shopEdit.id}`
                    : "/admin/suppliers",
                  send(shopEdit ? "PUT" : "POST", {
                    name: field(d, "name"),
                    location: field(d, "location"),
                    address: field(d, "address"),
                    phone: field(d, "phone"),
                    notes: field(d, "notes"),
                  }),
                ),
              "Shop saved.",
            ).then((ok) => {
              if (ok) {
                setShopEdit(null);
                form.reset();
              }
            });
          }}
        >
          <h3>{shopEdit ? "Edit shop" : "Add shop"}</h3>
          <div className="two-fields">
            <label>
              Shop name
              <input
                name="name"
                minLength={2}
                maxLength={160}
                required
                defaultValue={shopEdit?.name || ""}
              />
            </label>
            <label>
              Shop locality
              <input
                name="location"
                maxLength={160}
                defaultValue={shopEdit?.location || ""}
              />
            </label>
            <label>
              Shop address
              <textarea
                name="address"
                maxLength={500}
                defaultValue={shopEdit?.address || ""}
              />
            </label>
            <label>
              Shop phone
              <input
                name="phone"
                type="tel"
                maxLength={30}
                defaultValue={shopEdit?.phone || ""}
              />
            </label>
          </div>
          <label>
            Shop notes
            <textarea
              name="notes"
              maxLength={3000}
              defaultValue={shopEdit?.notes || ""}
            />
          </label>
          <div className="actions">
            <button className="btn" disabled={busy}>
              Save shop
            </button>
            {shopEdit && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setShopEdit(null)}
              >
                Cancel shop edit
              </button>
            )}
          </div>
        </form>
        <form
          key={linkEdit?.id || `new-link-${productId || "all"}`}
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              d = new FormData(form);
            const terms = {
              supplier_cost: price(d, "supplier_cost"),
              selling_price: price(d, "selling_price"),
              availability: field(d, "availability"),
              lead_time: field(d, "lead_time"),
              notes: field(d, "notes"),
            };
            void action(
              () =>
                api(
                  linkEdit
                    ? `/admin/product-suppliers/${linkEdit.id}`
                    : "/admin/product-suppliers",
                  send(
                    linkEdit ? "PUT" : "POST",
                    linkEdit
                      ? terms
                      : {
                          ...terms,
                          product_id: field(d, "product_id"),
                          supplier_id: field(d, "supplier_id"),
                        },
                  ),
                ),
              "Supplier link saved.",
            ).then((ok) => {
              if (ok) {
                setLinkEdit(null);
                form.reset();
              }
            });
          }}
        >
          <h3>{linkEdit ? "Edit supplier terms" : "Link shop to furniture"}</h3>
          <div className="two-fields">
            <label>
              Supplier product
              <select
                name="product_id"
                required
                disabled={!!linkEdit}
                defaultValue={linkEdit?.product_id || productId || ""}
              >
                <option value="">Choose furniture</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Linked shop
              <select
                name="supplier_id"
                required
                disabled={!!linkEdit}
                defaultValue={linkEdit?.supplier_id || ""}
              >
                <option value="">Choose shop</option>
                {shops
                  .filter((s) => !s.archived || s.id === linkEdit?.supplier_id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Supplier cost (₹, optional)
              <input
                name="supplier_cost"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                defaultValue={
                  linkEdit?.supplier_cost === null || !linkEdit
                    ? ""
                    : linkEdit.supplier_cost / 100
                }
              />
            </label>
            <label>
              Intended selling price (₹, private, optional)
              <input
                name="selling_price"
                type="number"
                min="0"
                max="1000000"
                step="0.01"
                defaultValue={
                  linkEdit?.selling_price === null || !linkEdit
                    ? ""
                    : linkEdit.selling_price / 100
                }
              />
            </label>
            <label>
              Supplier availability
              <select
                name="availability"
                defaultValue={linkEdit?.availability || "unknown"}
              >
                {Object.entries(availabilityOptions).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Supplier lead time (optional)
              <input
                name="lead_time"
                maxLength={160}
                defaultValue={linkEdit?.lead_time || ""}
              />
            </label>
          </div>
          <label>
            Supplier link notes
            <textarea
              name="notes"
              maxLength={3000}
              defaultValue={linkEdit?.notes || ""}
            />
          </label>
          <div className="actions">
            <button
              className="btn"
              disabled={busy || (!linkEdit && !shops.some((s) => !s.archived))}
            >
              Save supplier link
            </button>
            {linkEdit && (
              <button
                type="button"
                className="btn secondary"
                onClick={() => setLinkEdit(null)}
              >
                Cancel supplier terms edit
              </button>
            )}
          </div>
        </form>
      </div>
      <h3>Shop directory</h3>
      <div className="supplier-shops">
        {shownShops.map((s) => (
          <article className="supplier-shop" key={s.id}>
            <h4>
              {s.name}
              {s.archived ? " · Archived" : ""}
            </h4>
            <p>
              {s.location}
              <br />
              {s.address}
              <br />
              {s.phone || "Phone not recorded"}
            </p>
            <p>{s.notes}</p>
            <div className="actions">
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                aria-label={`Edit shop ${s.name}`}
                onClick={() => {
                  setShopEdit(s);
                  setNotice("");
                }}
              >
                Edit shop
              </button>
              <button
                type="button"
                className="btn secondary small"
                disabled={busy}
                aria-label={`${s.archived ? "Restore" : "Archive"} shop ${s.name}`}
                onClick={() =>
                  void action(
                    () =>
                      api(
                        `/admin/suppliers/${s.id}/archive`,
                        send("PATCH", { archived: !s.archived }),
                      ),
                    s.archived
                      ? "Shop restored."
                      : "Shop archived; supplier links retained.",
                  )
                }
              >
                {s.archived ? "Restore" : "Archive"} shop
              </button>
            </div>
          </article>
        ))}
      </div>
      {loaded && !shops.length && (
        <p>
          No supplier shops are preloaded. Enter verified owner sourcing
          records.
        </p>
      )}
    </section>
  );
}
