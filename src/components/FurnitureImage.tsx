import { useEffect, useState, type ImgHTMLAttributes } from "react";
export default function FurnitureImage(
  props: ImgHTMLAttributes<HTMLImageElement>,
) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [props.src]);
  return failed ? (
    <div
      className="image-fallback"
      role="img"
      aria-label={`Image unavailable. ${props.alt || "Furniture design"}`}
    >
      <span>Image unavailable</span>
      <small>Request design details with your quotation.</small>
    </div>
  ) : (
    <img
      {...props}
      srcSet={
        props.srcSet ||
        (props.src?.startsWith("/assets/pilot/") &&
        props.src.endsWith("-studio.webp")
          ? `${props.src.replace("-studio.webp", "-card.webp")} 480w, ${props.src} 1200w`
          : undefined)
      }
      sizes={props.sizes || "(max-width: 700px) 100vw, 60vw"}
      decoding={props.decoding || "async"}
      onError={() => setFailed(true)}
    />
  );
}
