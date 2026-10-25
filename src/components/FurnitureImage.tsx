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
    <img {...props} onError={() => setFailed(true)} />
  );
}
