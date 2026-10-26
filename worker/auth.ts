import { equal, hmac } from "./crypto";
type AuthEnv = {
  DB: D1Database;
  OWNER_PASSWORD_HASH?: string;
  SESSION_SECRET?: string;
  ENVIRONMENT?: string;
};
export const SESSION_MS = 60 * 60 * 1000;
export function configuredSecret(env: AuthEnv) {
  return !!env.SESSION_SECRET && env.SESSION_SECRET.length >= 32;
}
export function developmentHost(url: string) {
  return ["localhost", "127.0.0.1", "[::1]", "0.0.0.0"].includes(
    new URL(url).hostname,
  );
}
async function verifiedSession(req: Request, env: AuthEnv) {
  if (!configuredSecret(env) || !env.OWNER_PASSWORD_HASH) return null;
  const token = req.headers
    .get("Cookie")
    ?.split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("hf_session="))
    ?.slice(11);
  if (!token || token.length > 256) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [expires, nonce, signature] = parts;
  const expiry = Number(expires);
  if (
    !/^\d+$/.test(expires) ||
    !Number.isSafeInteger(expiry) ||
    expiry <= Date.now() ||
    expiry > Date.now() + SESSION_MS ||
    !nonce ||
    !signature
  )
    return null;
  if (
    !equal(
      signature,
      await hmac(
        `${expires}.${nonce}.${env.OWNER_PASSWORD_HASH}`,
        env.SESSION_SECRET!,
      ),
    )
  )
    return null;
  const id = await hmac(`session:${nonce}`, env.SESSION_SECRET!);
  const session = await env.DB.prepare(
    "SELECT id,expires_at FROM owner_sessions WHERE id=?",
  )
    .bind(id)
    .first<{ id: string; expires_at: number }>();
  return session &&
    session.expires_at === expiry &&
    session.expires_at > Date.now()
    ? session
    : null;
}
export async function authenticated(req: Request, env: AuthEnv) {
  return !!(await verifiedSession(req, env));
}
export async function createSession(env: AuthEnv) {
  const expires = Date.now() + SESSION_MS;
  const nonce = crypto.randomUUID();
  const value = `${expires}.${nonce}`;
  const id = await hmac(`session:${nonce}`, env.SESSION_SECRET!);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM owner_sessions WHERE expires_at<=?").bind(
      Date.now(),
    ),
    env.DB.prepare(
      "INSERT INTO owner_sessions (id,expires_at) VALUES (?,?)",
    ).bind(id, expires),
  ]);
  return `${value}.${await hmac(`${value}.${env.OWNER_PASSWORD_HASH}`, env.SESSION_SECRET!)}`;
}
export async function revokeSession(req: Request, env: AuthEnv) {
  const session = await verifiedSession(req, env);
  if (session)
    await env.DB.prepare("DELETE FROM owner_sessions WHERE id=?")
      .bind(session.id)
      .run();
}
