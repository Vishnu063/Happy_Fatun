import { MoveUpRight } from "lucide-react";
import { money, type Product } from "../lib/api";
export default function ProductCard({ product: p }: { product: Product }) {
  return (
    <article className="product-card">
      <a href={`#/product/${p.id}`}>
        <div className="card-image">
          <img
            src={p.images[0]}
            alt={`${p.name} — illustrative design concept`}
            loading="lazy"
          />
          <span className="pill">
            {p.status === "concept" ? "DEMO CONCEPT" : "OWNER APPROVED"}
          </span>
          <span className="card-arrow">
            <MoveUpRight size={21} />
          </span>
        </div>
        <div className="card-info">
          <div>
            <p className="eyebrow">
              {p.material} · {p.finish} finish
            </p>
            <h3>{p.name}</h3>
          </div>
          <span className="swatches" aria-label="Multiple color options">
            <i />
            <i />
            <i />
          </span>
        </div>
        <p className="price">
          {p.price === null
            ? "Price on request"
            : `Starting at ${money(p.price)}`}{" "}
          <small>· Indicative only</small>
        </p>
      </a>
    </article>
  );
}
