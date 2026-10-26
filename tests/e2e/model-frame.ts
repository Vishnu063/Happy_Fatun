import type { Locator } from "@playwright/test";

/** Inspect actual rendered RGBA pixels without PNG encoding or large trace attachments. */
export async function modelFrame(canvas: Locator) {
  return canvas.evaluate(
    (element) =>
      new Promise<{ hash: string; colors: number }>((resolve, reject) => {
        // Three's animation callback was queued first: sample after its draw,
        // before the compositor can discard the default WebGL drawing buffer.
        requestAnimationFrame(async () => {
          try {
            const gl = (element as HTMLCanvasElement).getContext("webgl2");
            if (!gl) throw new Error("Active WebGL2 context is unavailable.");
            const pixels = new Uint8Array(
              gl.drawingBufferWidth * gl.drawingBufferHeight * 4,
            );
            gl.readPixels(
              0,
              0,
              gl.drawingBufferWidth,
              gl.drawingBufferHeight,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              pixels,
            );
            // A blank/cleared framebuffer must never count as a valid baseline.
            const colors = new Set<number>();
            for (let i = 0; i < pixels.length && colors.size < 4; i += 4)
              colors.add(
                (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2],
              );
            const digest = await crypto.subtle.digest("SHA-256", pixels);
            resolve({
              hash: Array.from(new Uint8Array(digest), (b) =>
                b.toString(16).padStart(2, "0"),
              ).join(""),
              colors: colors.size,
            });
          } catch (error) {
            reject(error);
          }
        });
      }),
  );
}
