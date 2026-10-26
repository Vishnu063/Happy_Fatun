/** Decode and re-encode in the owner's browser: strips metadata and bounds delivery size. */
export async function optimizeImage(file: File): Promise<Blob> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type))
    throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size > 12 * 1024 * 1024)
    throw new Error("Choose a source image smaller than 12 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    if (
      bitmap.width * bitmap.height > 24000000 ||
      bitmap.width > 6000 ||
      bitmap.height > 6000
    )
      throw new Error(
        "Choose an image up to 6000px per side and 24 megapixels.",
      );
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Image optimization is unavailable in this browser.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.85),
    );
    if (!blob || blob.type !== "image/webp")
      throw new Error(
        "This browser cannot create WebP images. Use a current browser.",
      );
    if (blob.size > 5 * 1024 * 1024)
      throw new Error("Optimized image exceeds 5 MB. Choose a smaller image.");
    return blob;
  } finally {
    bitmap.close();
  }
}
