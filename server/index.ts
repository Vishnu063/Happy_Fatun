import { serve } from "@hono/node-server";
import {
  collectDefaultMetrics,
  Registry,
  Histogram,
  Gauge,
} from "@prometheus-io/client";
import app, { type Env } from "../worker/index";
import { databasePool, PostgresDatabase } from "./db/postgres";
import { migrationCatalog } from "./db/migrations";
import { mediaStore } from "./storage";
import { staticAssets } from "./assets";
import {
  publicOrigin,
  trustedProxy,
  clientIP,
  validateProductionConfig,
} from "./proxy";
const config = process.env;
const requiredMigrations = await migrationCatalog();
if (!["production", "development"].includes(config.ENVIRONMENT || ""))
  throw new Error("Explicit ENVIRONMENT is required");
validateProductionConfig(config);
const origin = publicOrigin(
  config.PUBLIC_ORIGIN || "",
  config.ENVIRONMENT === "production",
);
const trust = trustedProxy(config.TRUSTED_PROXY_CIDRS || "");
const pool = databasePool(
  config.DATABASE_URL || "",
  config.DATABASE_SSL === "true",
);
const media = mediaStore(config),
  assets = staticAssets(config.STATIC_ROOT || "dist");
const bindings = {
  ...config,
  DB: new PostgresDatabase(pool) as unknown as D1Database,
  ASSETS: assets as unknown as Fetcher,
  PRODUCT_IMAGES: media as unknown as R2Bucket,
} satisfies Env;
const metrics = new Registry();
collectDefaultMetrics({ register: metrics });
const duration = new Histogram({
  name: "happy_furn_http_request_duration_seconds",
  help: "Application request latency without personal identifiers",
  labelNames: ["method", "route", "status"],
  registers: [metrics],
});
let draining = false;
async function ready() {
  if (draining) return false;
  try {
    const history = (
      await pool.query("SELECT name,checksum FROM schema_migrations")
    ).rows;
    return requiredMigrations.every((m) =>
      history.some((row) => row.name === m.name && row.checksum === m.checksum),
    );
  } catch {
    return false;
  }
}
new Gauge({
  name: "happy_furn_readiness",
  help: "Database schema readiness, no customer identifiers",
  registers: [metrics],
  async collect() {
    this.set((await ready()) ? 1 : 0);
  },
});
const server = serve({
  hostname: config.BIND_ADDRESS || "127.0.0.1",
  port: Number(config.PORT || 3000),
  fetch: async (request, node) => {
    const path = new URL(request.url).pathname;
    if (path === "/health/live") return Response.json({ ok: true });
    if (path === "/health/ready") {
      const ok = await ready();
      return Response.json({ ok }, { status: ok ? 200 : 503 });
    }
    if (path === "/metrics")
      return new Response(await metrics.metrics(), {
        headers: { "Content-Type": metrics.contentType },
      });
    const end = duration.startTimer();
    try {
      if (request.headers.get("host") !== new URL(origin).host)
        return Response.json({ error: "Unexpected host" }, { status: 400 });
      const headers = new Headers(request.headers);
      headers.set("CF-Connecting-IP", clientIP(node.incoming, trust));
      const url = new URL(request.url);
      const rewritten = new Request(
        origin + url.pathname + url.search,
        new Request(request, { headers }),
      );
      const response = await app.fetch(rewritten, bindings);
      end({
        method: [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
          "OPTIONS",
        ].includes(request.method)
          ? request.method
          : "OTHER",
        route: path.startsWith("/api/admin/")
          ? "/api/admin/*"
          : path.startsWith("/api/")
            ? "/api/*"
            : path.startsWith("/media/")
              ? "/media/*"
              : "page",
        status: String(response.status),
      });
      return response;
    } catch {
      end({
        method: [
          "GET",
          "POST",
          "PUT",
          "PATCH",
          "DELETE",
          "HEAD",
          "OPTIONS",
        ].includes(request.method)
          ? request.method
          : "OTHER",
        route: "error",
        status: "500",
      });
      return Response.json(
        { error: "Request could not be completed" },
        { status: 500 },
      );
    }
  },
});
async function shutdown() {
  if (draining) return;
  draining = true;
  server.close(async () => {
    await pool.end();
    media?.close?.();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}
process.once("SIGTERM", () => void shutdown());
process.once("SIGINT", () => void shutdown());
console.log("Happy Furn backend listening");
