import { lazy, Suspense, useRef, useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Rotate3D,
  X,
} from "lucide-react";
import { api, send, money, type Product } from "../lib/api";
import ProductCard from "./ProductCard";
import FurnitureImage from "./FurnitureImage";
import { captureSource, whatsappURL, type Business } from "../lib/contact";
import type { GalleryImage } from "./ImageManager";
const Viewer = lazy(() => import("./Viewer"));
export default function ProductDetail({
  product: p,
  related,
  business,
}: {
  product: Product;
  related: Product[];
  business?: Business | null;
}) {
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  useEffect(() => {
    api<{ images: GalleryImage[] }>(`/products/${p.id}/images`)
      .then((result) => setGallery(result.images))
      .catch(() => setGallery([]));
  }, [p.id, p.images.join("|")]);
  const [image, setImage] = useState(0);
  const [three, setThree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{
    reference: string;
    contact: { email: string | null; phone: string | null };
  } | null>(null);
  const touch = useRef<number | null>(null);
  const [config, setConfig] = useState({
    length: p.length,
    width: p.width,
    height: p.height,
    material: p.materials[0],
    color: p.colors[0],
    notes: "",
  });
  const illustrative =
    p.status === "concept" ||
    gallery[image]?.kind === "illustrative" ||
    p.images[image]?.startsWith("/assets/");
  const move = (d: number) =>
    setImage((i) => (i + d + p.images.length) % p.images.length);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      setResult(
        await api(
          "/quotes",
          send("POST", {
            product_id: p.id,
            configuration: config,
            name: form.get("name"),
            email: form.get("email"),
            phone: form.get("phone"),
            area: form.get("area"),
            consent: form.get("consent") === "on",
            website: form.get("website") || "",
            source: captureSource(),
          }),
        ),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  if (result)
    return (
      <section className="container confirmation" aria-live="polite">
        <div className="success-icon">
          <Check size={32} />
        </div>
        <p className="eyebrow">AARANYA LIVING · REQUEST RECEIVED</p>
        <h1>A beautiful beginning.</h1>
        <p>
          Your request has been saved. The owner will review your design and
          configuration before confirming feasibility and a final price.
        </p>
        <div className="reference">
          <small>YOUR REFERENCE</small>
          <strong>{result.reference}</strong>
        </div>
        {result.contact.email && (
          <p>
            Email:{" "}
            <a href={`mailto:${result.contact.email}`}>
              {result.contact.email}
            </a>
          </p>
        )}
        {result.contact.phone && (
          <p>
            Phone:{" "}
            <a href={`tel:${result.contact.phone}`}>{result.contact.phone}</a>
          </p>
        )}
        <p className="muted">
          This is an inquiry, not a confirmed order. Delivery, installation and
          lead times will be discussed during review.
        </p>
        <a className="btn" href="#/">
          Back to the collection <ArrowRight size={18} />
        </a>
      </section>
    );
  return (
    <div className="container detail">
      <a className="back" href="#/">
        <ArrowLeft size={16} /> Back to the collection
      </a>
      <div className="detail-grid">
        <section aria-label="Product gallery">
          <div
            className="gallery"
            tabIndex={0}
            role="region"
            aria-label="Product images. Use left and right arrow keys to browse."
            onKeyDown={(e) => {
              if (three) return;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(-1);
              }
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(1);
              }
            }}
            onTouchStart={(e) => {
              touch.current = e.touches[0].clientX;
            }}
            onTouchEnd={(e) => {
              if (touch.current !== null) {
                const delta = e.changedTouches[0].clientX - touch.current;
                if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1);
                touch.current = null;
              }
            }}
          >
            {three && p.model ? (
              <Suspense fallback={<p>Loading 3D concept…</p>}>
                <Viewer model={p.model} color={config.color} />
              </Suspense>
            ) : (
              <FurnitureImage
                src={p.images[image]}
                alt={
                  gallery[image]?.alt ||
                  `${p.name} — ${["clean background illustration", "room illustration", "alternate angle illustration"][image] || `view ${image + 1}`}`
                }
              />
            )}
            {!three && (
              <>
                <button
                  className="gallery-prev icon"
                  aria-label="Previous image"
                  onClick={() => move(-1)}
                >
                  <ChevronLeft />
                </button>
                <button
                  className="gallery-next icon"
                  aria-label="Next image"
                  onClick={() => move(1)}
                >
                  <ChevronRight />
                </button>
                <span className="gallery-count" aria-live="polite">
                  {image + 1} / {p.images.length}
                </span>
              </>
            )}
          </div>
          <div className="gallery-thumbs">
            {p.images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                aria-label={`View image ${i + 1}`}
                aria-pressed={!three && i === image}
                onClick={() => {
                  setImage(i);
                  setThree(false);
                }}
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
            {p.model && (
              <button
                className="view3d"
                aria-pressed={three}
                onClick={() => setThree(!three)}
              >
                <Rotate3D size={23} /> 360°
              </button>
            )}
          </div>
          <p className="disclosure">
            {illustrative ? "Design concept / illustrative image. " : ""}
            {three
              ? "Interactive generic demo geometry; not an accurate model of this product."
              : illustrative
                ? "Illustrative design image, not manufactured stock."
                : "Owner-supplied gallery. Confirm specifications during review."}
          </p>
          {!p.model && (
            <p className="muted">
              360° view is unavailable for this concept. Explore the gallery
              instead.
            </p>
          )}
        </section>
        <section>
          <p className="eyebrow">
            THE CONCEPT COLLECTION ·{" "}
            {p.status === "concept" ? "DEMO DESIGN" : p.status.toUpperCase()}
          </p>
          <h1>{p.name}</h1>
          <p className="detail-price">
            {p.price === null
              ? "Price on request"
              : `Starting at ${money(p.price)}`}
          </p>
          <p className="muted">
            Indicative only. Final cost follows manufacturer review.
          </p>
          <p>{p.description}</p>
          <dl className="specs">
            <div>
              <dt>Dimensions</dt>
              <dd>
                {p.length} × {p.width} × {p.height} cm (L × W × H)
              </dd>
            </div>
            <div>
              <dt>Material / finish</dt>
              <dd>
                {p.material} / {p.finish}
              </dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>Confirmed during review</dd>
            </div>
            <div>
              <dt>Delivery & installation</dt>
              <dd>Scope, area and timing confirmed with your quotation</dd>
            </div>
          </dl>
          <a
            className="btn"
            href="#customize"
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById("customize")
                ?.scrollIntoView({ behavior: "smooth" });
              document.getElementById("length")?.focus({ preventScroll: true });
            }}
          >
            Customize & request quote <ArrowRight size={18} />
          </a>
          {whatsappURL(business?.whatsapp || null) && (
            <a
              className="btn secondary whatsapp"
              href={whatsappURL(
                business?.whatsapp || null,
                `Hello Aaranya Living, I'd like to discuss ${p.name}.`,
              )!}
              target="_blank"
              rel="noopener noreferrer"
            >
              Discuss this design on WhatsApp
            </a>
          )}
        </section>
      </div>
      <form id="customize" className="quote-form" onSubmit={submit}>
        <div className="form-heading">
          <p className="eyebrow">DESIGNED AROUND YOU</p>
          <h2>A few details. A world of possibilities.</h2>
          <p>
            Your preferences help us prepare a personal quotation. All
            measurements are in centimetres.
          </p>
        </div>
        <div className="form-columns">
          <fieldset>
            <legend>
              <span>01</span> Make it yours
            </legend>
            <div className="three-fields">
              {(["length", "width", "height"] as const).map((k) => (
                <label key={k} htmlFor={k}>
                  {k[0].toUpperCase() + k.slice(1)} (cm)
                  <input
                    id={k}
                    type="number"
                    required
                    step="0.1"
                    min={k === "height" ? 10 : 20}
                    max={k === "length" ? 500 : 300}
                    value={config[k]}
                    onChange={(e) =>
                      setConfig({ ...config, [k]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="two-fields">
              <label>
                Material
                <select
                  value={config.material}
                  onChange={(e) =>
                    setConfig({ ...config, material: e.target.value })
                  }
                >
                  {p.materials.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label>
                Color
                <select
                  value={config.color}
                  onChange={(e) =>
                    setConfig({ ...config, color: e.target.value })
                  }
                >
                  {p.colors.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Special notes <span className="muted">(optional)</span>
              <textarea
                maxLength={2000}
                rows={4}
                value={config.notes}
                onChange={(e) =>
                  setConfig({ ...config, notes: e.target.value })
                }
                placeholder="Tell us about your room, finish preferences or a detail you love."
              />
            </label>
          </fieldset>
          <fieldset>
            <legend>
              <span>02</span> Let’s start a conversation
            </legend>
            <div className="two-fields">
              <label>
                Your name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label>
                Phone
                <input
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  pattern="[+0-9 \(\)\-]{7,25}"
                  maxLength={25}
                />
              </label>
            </div>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
            <label>
              Delivery area
              <input
                name="area"
                autoComplete="address-level2"
                required
                minLength={2}
                maxLength={200}
                placeholder="City, locality and postal code"
              />
            </label>
            <label className="honeypot" aria-hidden="true">
              Website
              <input name="website" tabIndex={-1} autoComplete="off" />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="consent" required />
              <span>
                I agree to be contacted about this inquiry. My details will be
                used to review and respond to this request.
              </span>
            </label>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn" disabled={submitting}>
              {submitting
                ? "Saving your request…"
                : "Request a personal quotation"}{" "}
              <ArrowRight size={18} />
            </button>
            <p className="muted small">
              No payment. No commitment. Just the first step.
            </p>
          </fieldset>
        </div>
      </form>
      {related.length > 0 && (
        <section className="related">
          <p className="eyebrow">MORE TO EXPLORE</p>
          <h2>Different forms. The same considered spirit.</h2>
          <div className="product-grid">
            {related.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
