import { indianMobile } from "../../shared/inquiries";
import { useRef, useState, useEffect } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { api, send, money, type Product } from "../lib/api";
import ProductCard from "./ProductCard";
import ImageZoom from "./ImageZoom";
import FurnitureImage from "./FurnitureImage";
import { captureSource, whatsappURL, type Business } from "../lib/contact";
import type { GalleryImage } from "./ImageManager";
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
    if (location.hash === "#customize") {
      document.getElementById("customize")?.scrollIntoView();
      document.getElementById("customer-name")?.focus({ preventScroll: true });
    }
  }, [p.id]);
  useEffect(() => {
    api<{ images: GalleryImage[] }>(`/products/${p.id}/images`)
      .then((result) => setGallery(result.images))
      .catch(() => setGallery([]));
  }, [p.id, p.images.join("|")]);
  const [image, setImage] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submissionKey] = useState(() => crypto.randomUUID());
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
    material: p.materials.includes(p.material) ? p.material : p.materials[0],
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
            submission_key: submissionKey,
          }),
        ),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(
        err instanceof TypeError
          ? "We couldn't confirm the response. Your request may already be saved; retry this form to recover its reference."
          : (err as Error).message,
      );
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
        <a className="btn" href="/">
          Back to the collection <ArrowRight size={18} />
        </a>
      </section>
    );
  return (
    <div className="container detail">
      {zoom && (
        <ImageZoom
          src={p.images[image]}
          alt={gallery[image]?.alt || `${p.name} — view ${image + 1}`}
          name={p.name}
          illustrative={illustrative}
          onClose={() => setZoom(false)}
        />
      )}
      <a className="back" href="/">
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
            <FurnitureImage
              src={p.images[image]}
              alt={
                gallery[image]?.alt ||
                `${p.name} — ${["clean background illustration", "room illustration", "alternate angle illustration"][image] || `view ${image + 1}`}`
              }
            />
            {
              <>
                <button
                  className="gallery-prev icon"
                  aria-label="Previous image"
                  disabled={p.images.length < 2}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft />
                </button>
                <button
                  className="gallery-next icon"
                  aria-label="Next image"
                  disabled={p.images.length < 2}
                  onClick={() => move(1)}
                >
                  <ChevronRight />
                </button>
                <button
                  type="button"
                  className="gallery-zoom btn secondary small"
                  onClick={() => setZoom(true)}
                >
                  Zoom image
                </button>
                <span className="gallery-count" aria-live="polite">
                  {image + 1} / {p.images.length}
                </span>
              </>
            }
          </div>
          <div className="gallery-thumbs">
            {p.images.map((src, i) => (
              <button
                key={`${src}-${i}`}
                aria-label={`View image ${i + 1}`}
                aria-pressed={i === image}
                onClick={() => {
                  setImage(i);
                }}
              >
                <img src={src} alt="" loading="lazy" />
              </button>
            ))}
          </div>
          <p className="disclosure">
            {illustrative ? "Design concept / illustrative image. " : ""}
            {illustrative
              ? "Illustrative design image, not manufactured stock."
              : "Owner-supplied gallery. Confirm specifications during review."}
          </p>
          <p className="muted">
            Additional matching views can be added after approval. A single
            illustration is not a 360° view.
          </p>
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
              document
                .getElementById("customer-name")
                ?.focus({ preventScroll: true });
            }}
          >
            Request Details / Request a Quote <ArrowRight size={18} />
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
            Share your name and mobile to request details or a quotation. The
            shown configuration is prefilled; change it only if needed.
            Measurements are in centimetres.
          </p>
        </div>
        <div className="form-columns">
          <details className="inquiry-customization">
            <summary>Optional furniture customization</summary>
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
            </fieldset>
          </details>
          <fieldset>
            <legend>
              <span>02</span> Let’s start a conversation
            </legend>
            <div className="two-fields">
              <label>
                Full name
                <input
                  name="name"
                  id="customer-name"
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
                  onInput={(e) =>
                    e.currentTarget.setCustomValidity(
                      indianMobile(e.currentTarget.value)
                        ? ""
                        : "Enter a valid Indian mobile number.",
                    )
                  }
                  aria-describedby="mobile-help"
                  maxLength={25}
                />
              </label>
            </div>
            <p id="mobile-help" className="muted small">
              Indian mobile number, with or without +91. Email, delivery area
              and message are optional.
            </p>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
              />
            </label>
            <label>
              Delivery area
              <input
                name="area"
                autoComplete="address-level2"
                maxLength={500}
                placeholder="City, locality and postal code"
              />
            </label>
            <label>
              Message / special notes <span className="muted">(optional)</span>
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
            <p className="muted small">
              Your contact details and message are private to Aaranya Living and
              used to respond to this inquiry. No marketing subscription.
              Contact us with your reference to request removal of personal
              details.
            </p>
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
