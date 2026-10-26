import { useEffect, useRef, useState } from "react";
import { X, Plus, Minus } from "lucide-react";
import FurnitureImage from "./FurnitureImage";
export default function ImageZoom({
  src,
  alt,
  name,
  illustrative,
  onClose,
}: {
  src: string;
  alt: string;
  name: string;
  illustrative: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    return () => {
      if (node?.open) node.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="image-zoom"
      aria-labelledby="zoom-title"
      aria-describedby="zoom-description"
      onClose={() => {
        if (!dialog.current?.open) onClose();
      }}
    >
      <div className="zoom-toolbar">
        <h2 id="zoom-title">{name}</h2>
        <button
          className="icon"
          type="button"
          aria-label="Close image zoom"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      <p id="zoom-description" className="small muted">
        Use the zoom controls and scroll to inspect details.{" "}
        {illustrative
          ? "Design concept / illustrative image; not manufactured stock."
          : "Owner-supplied photograph; confirm specifications with your quotation."}
      </p>
      <div
        className="zoom-controls"
        role="group"
        aria-label="Image zoom controls"
      >
        <button
          className="btn secondary small"
          type="button"
          aria-label="Zoom image out"
          disabled={scale <= 1}
          onClick={() => setScale((s) => Math.max(1, s - 0.5))}
        >
          <Minus size={17} />
        </button>
        <output aria-live="polite" aria-label="Image magnification">
          {Math.round(scale * 100)}%
        </output>
        <button
          className="btn secondary small"
          type="button"
          aria-label="Zoom image in"
          disabled={scale >= 3}
          onClick={() => setScale((s) => Math.min(3, s + 0.5))}
        >
          <Plus size={17} />
        </button>
        <button
          className="btn secondary small"
          type="button"
          onClick={() => setScale(1)}
        >
          Reset zoom
        </button>
      </div>
      <div
        className="zoom-viewport"
        tabIndex={0}
        role="region"
        aria-label="Enlarged furniture image"
      >
        <FurnitureImage
          src={src}
          alt={alt}
          draggable={false}
          style={{ width: `${scale * 100}%`, maxWidth: "none", height: "auto" }}
        />
      </div>
    </dialog>
  );
}
