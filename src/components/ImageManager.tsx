import { useEffect, useState } from "react";
import { api, send } from "../lib/api";
import { optimizeImage } from "../lib/images";
import FurnitureImage from "./FurnitureImage";
import { imageStorageUnavailable } from "../../shared/media";
export type GalleryImage = {
  url: string;
  alt: string;
  kind: "illustrative" | "photo";
  id: string | null;
};
export default function ImageManager({
  id,
  onChange,
  onBusy,
}: {
  id: string;
  onChange: (urls: string[]) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [storageAvailable, setStorageAvailable] = useState<boolean | null>(
    null,
  );
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [alt, setAlt] = useState("");
  const [kind, setKind] = useState("illustrative");
  const [replace, setReplace] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    const data = await api<{
      images: GalleryImage[];
      storage_available: boolean;
    }>(`/admin/products/${id}/images`);
    setImages(data.images);
    setStorageAvailable(data.storage_available);
    onChange(data.images.map((i) => i.url));
  }
  useEffect(() => {
    void refresh().catch((e) => setError(e.message));
  }, [id]);
  async function run(fn: () => Promise<unknown>, message: string) {
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <section className="image-manager" aria-label="Product image management">
      <h3>Product gallery</h3>
      {storageAvailable === false && (
        <p className="notice" role="status">
          {imageStorageUnavailable} You can reorder existing images and edit
          their descriptions.
        </p>
      )}
      <p className="muted small">
        Studio view first, matching room view second. Use lawful images of the
        same design. Available gallery changes are saved immediately; unsaved
        text and price fields stay in this editor.
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
      <div className="image-manager-grid">
        {images.map((image, i) => (
          <div className="managed-image" key={image.url}>
            <FurnitureImage src={image.url} alt={image.alt} loading="lazy" />
            <p>
              {i + 1}. {image.alt}
            </p>
            <label>
              Edit alt text for image {i + 1}
              <input
                minLength={3}
                maxLength={300}
                value={image.alt}
                onChange={(e) =>
                  setImages((current) =>
                    current.map((m, n) =>
                      n === i ? { ...m, alt: e.target.value } : m,
                    ),
                  )
                }
              />
            </label>
            <button
              className="btn secondary small"
              type="button"
              disabled={busy || image.alt.trim().length < 3}
              onClick={() =>
                void run(
                  () =>
                    api(
                      `/admin/products/${id}/images/text`,
                      send("PUT", { url: image.url, alt: image.alt }),
                    ),
                  "Image description saved.",
                )
              }
            >
              Save image {i + 1} description
            </button>
            <small>
              {image.kind === "illustrative"
                ? "Design concept / illustrative image"
                : "Owner-supplied photograph"}
            </small>
            <div className="actions">
              <button
                className="btn secondary small"
                type="button"
                aria-label={`Move image ${i + 1} earlier`}
                disabled={busy || i === 0}
                onClick={() =>
                  void run(() => {
                    const urls = images.map((m) => m.url);
                    [urls[i - 1], urls[i]] = [urls[i], urls[i - 1]];
                    return api(
                      `/admin/products/${id}/images/order`,
                      send("PUT", { images: urls }),
                    );
                  }, "Gallery order saved.")
                }
              >
                ↑
              </button>
              <button
                className="btn secondary small"
                type="button"
                aria-label={`Move image ${i + 1} later`}
                disabled={busy || i === images.length - 1}
                onClick={() =>
                  void run(() => {
                    const urls = images.map((m) => m.url);
                    [urls[i + 1], urls[i]] = [urls[i], urls[i + 1]];
                    return api(
                      `/admin/products/${id}/images/order`,
                      send("PUT", { images: urls }),
                    );
                  }, "Gallery order saved.")
                }
              >
                ↓
              </button>
              <button
                className="btn secondary small danger"
                type="button"
                disabled={busy || !storageAvailable || images.length <= 1}
                aria-label={`Delete image ${i + 1}`}
                onClick={() => {
                  if (
                    confirm(
                      "Delete this gallery image? Product details, pricing and inquiries will be preserved.",
                    )
                  )
                    void run(
                      () =>
                        api(
                          `/admin/products/${id}/images/${i}`,
                          send("DELETE"),
                        ),
                      "Image deleted.",
                    );
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="two-fields">
        <label>
          Image file
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            disabled={busy || !storageAvailable}
          />
        </label>
        <label>
          Image description (alt text)
          <input
            maxLength={300}
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            placeholder="Describe the furniture, setting and finish"
          />
        </label>
        <label>
          Image classification
          <select
            disabled={!storageAvailable || busy}
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="illustrative">
              Design concept / illustrative image
            </option>
            <option value="photo">Real owner-approved photograph</option>
          </select>
        </label>
        <label>
          Upload destination
          <select
            disabled={!storageAvailable || busy}
            value={replace}
            onChange={(e) => setReplace(e.target.value)}
          >
            <option value="">Add to gallery</option>
            {images.map((m, i) => (
              <option key={m.url} value={i}>
                Replace image {i + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button
        className="btn secondary"
        type="button"
        disabled={
          busy ||
          !storageAvailable ||
          !file ||
          alt.trim().length < 3 ||
          (!replace && images.length >= 12)
        }
        onClick={() =>
          void run(async () => {
            if (!file) return;
            const blob = await optimizeImage(file);
            await api(
              `/admin/products/${id}/images${replace === "" ? "" : `?replace=${replace}`}`,
              {
                method: "POST",
                headers: {
                  "Content-Type": blob.type,
                  "X-Image-Alt": encodeURIComponent(alt.trim()),
                  "X-Image-Kind": kind,
                },
                body: blob,
              },
            );
            setFile(null);
            setReplace("");
          }, "Image optimized and saved. Product and inquiry records preserved.")
        }
      >
        {busy
          ? "Saving image…"
          : replace === ""
            ? "Upload image"
            : "Replace image"}
      </button>
      <p className="muted small">
        PNG/JPEG/WebP source ≤12 MB. Browser converts to WebP, longest side
        ≤1600px; server accepts validated raster images ≤5 MB. SVG uploads are
        not accepted. Up to 12 gallery images.
      </p>
    </section>
  );
}
