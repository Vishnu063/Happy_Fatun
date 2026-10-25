import FurnitureImage from "./FurnitureImage";
import { MoveUpRight } from "lucide-react";
import { money, type Product } from "../lib/api";
export default function ProductCard({ product: p }: { product: Product }) {
  return (
    <article className="product-card">
      <a href={`#/product/${p.id}`}>
        <div className="card-image">
          <FurnitureImage
            src={p.images[0]}
            alt={
              p.image_metadata?.[p.images[0]]?.alt ||
              `${p.name} — furniture design`
            }
            loading="lazy"
          />
          <span className="pill">
            {p.status === "concept" ||
            p.images[0].startsWith("/assets/") ||
            p.image_metadata?.[p.images[0]]?.kind === "illustrative"
              ? "DESIGN CONCEPT"
              : "OWNER APPROVED"}
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
