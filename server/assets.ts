import { readFile, realpath } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};
export function staticAssets(root: string) {
  const base = resolve(root);
  return {
    async fetch(input: Request | string | URL) {
      const request = input instanceof Request ? input : new Request(input);
      if (!["GET", "HEAD"].includes(request.method))
        return new Response(null, { status: 405 });
      try {
        let path = decodeURIComponent(new URL(request.url).pathname);
        if (path === "/") path = "/index.html";
        const file = resolve(base, "." + path),
          actual = await realpath(file);
        if (!actual.startsWith(base + sep) || !types[extname(file)])
          return new Response(null, { status: 404 });
        return new Response(
          request.method === "HEAD" ? null : await readFile(actual),
          {
            headers: {
              "Content-Type": types[extname(file)],
              "X-Content-Type-Options": "nosniff",
            },
          },
        );
      } catch {
        return new Response(null, { status: 404 });
      }
    },
  };
}
