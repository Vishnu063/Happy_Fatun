import proxyaddr from "proxy-addr";
import type { IncomingMessage } from "node:http";
export function trustedProxy(cidrs: string) {
  const values = cidrs
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (values.some((v) => !v.includes("/") || Number(v.split("/").at(-1)) === 0))
    throw new Error("Use explicit narrow trusted proxy CIDRs");
  return values.length ? proxyaddr.compile(values) : () => false;
}
export function clientIP(
  request: Pick<IncomingMessage, "headers" | "socket">,
  trust: ReturnType<typeof trustedProxy>,
) {
  if (String(request.headers["x-forwarded-for"] || "").length > 2048)
    throw new Error("Forwarded chain exceeds limit");
  return proxyaddr(request as IncomingMessage, trust);
}
export function publicOrigin(value: string, production: boolean) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid PUBLIC_ORIGIN; configured value is redacted");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (!production &&
      (url.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) ||
    (production && url.protocol !== "https:")
  )
    throw new Error(
      "PUBLIC_ORIGIN must be HTTPS in production or exact loopback HTTP in development",
    );
  return url.origin;
}

export function validateProductionConfig(env: NodeJS.ProcessEnv) {
  if (
    env.ENVIRONMENT === "production" &&
    (env.DATABASE_SSL !== "true" ||
      (env.SESSION_SECRET?.length || 0) < 32 ||
      !/^[a-f0-9]{32}:[a-f0-9]{64}$/i.test(env.OWNER_PASSWORD_HASH || ""))
  )
    throw new Error(
      "Production requires verified database TLS, a strong session secret and a valid owner password hash",
    );
}
