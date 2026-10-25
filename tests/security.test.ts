import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { Database } from "./helpers";
import app, { passwordHash, type Env } from "../worker/index";
import { validateDeployment } from "../shared/deployment";
let db: Database;
let env: Env;
let cookie: string;
const base = "http://127.0.0.1:8787";
const password = "security-regression-owner-password";
const payload = {
  product_id: "sofas-1",
  configuration: {
    length: 210,
    width: 90,
    height: 82,
    material: "Oak",
    color: "Natural",
    notes: "",
  },
  name: "Private Customer",
  email: "private@example.test",
  phone: "+91 9000000000",
  area: "Private delivery locality",
  consent: true,
  website: "",
};
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(
    base + "/api" + path,
    {
      method,
      headers: { Origin: base, "Content-Type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
async function signIn() {
  const r = await call("/auth/login", "POST", { password });
  expect(r.status).toBe(200);
  cookie = r.headers.get("Set-Cookie")!.split(";")[0];
  return r;
}
beforeEach(async () => {
  db = new Database();
  env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "development",
    SESSION_SECRET: "security-only-secret-more-than-32-characters",
    OWNER_PASSWORD_HASH: `security-salt:${await passwordHash(password, "security-salt")}`,
    EMAIL_MODE: "local",
  };
  cookie = "";
});
afterEach(() => {
  db.db.close();
  vi.restoreAllMocks();
});
describe("PR #2 owner security findings", () => {
  it("fails closed without a strong quote rate-limit secret and persists nothing", async () => {
    for (const secret of [undefined, "short"]) {
      env.SESSION_SECRET = secret;
      expect((await call("/quotes", "POST", payload)).status).toBe(503);
    }
    expect(db.db.prepare("SELECT count(*) n FROM quotes").get()?.n).toBe(0);
    expect(db.db.prepare("SELECT count(*) n FROM rate_limits").get()?.n).toBe(
      0,
    );
  });
  it("revokes copied sessions on logout, leaves other sessions intact and rejects legacy stateless tokens", async () => {
    const first = await signIn();
    const copied = first.headers.get("Set-Cookie")!.split(";")[0];
    await signIn();
    const second = cookie;
    expect(
      (await call("/admin/data", "GET", undefined, { Cookie: copied })).status,
    ).toBe(200);
    expect(
      (await call("/auth/logout", "POST", undefined, { Cookie: copied }))
        .status,
    ).toBe(200);
    expect(
      (await call("/admin/data", "GET", undefined, { Cookie: copied })).status,
    ).toBe(401);
    expect(
      (await call("/admin/data", "GET", undefined, { Cookie: second })).status,
    ).toBe(200);
    db.db.prepare("DELETE FROM owner_sessions").run();
    expect(
      (await call("/admin/data", "GET", undefined, { Cookie: second })).status,
    ).toBe(401);
  });
  it("uses short production sessions and rejects development configuration on public hosts", async () => {
    env.ENVIRONMENT = "production";
    const response = await signIn();
    const header = response.headers.get("Set-Cookie")!;
    expect(header).toContain("Secure");
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Strict");
    expect(header).toContain("Max-Age=3600");
    env.ENVIRONMENT = "development";
    for (const path of ["/api/auth/login", "/api/quotes", "/api/admin/data"]) {
      const r = await app.request(
        "https://public.example.test" + path,
        {
          method: path.endsWith("/data") ? "GET" : "POST",
          headers: {
            Origin: "https://public.example.test",
            Cookie: cookie,
            "Content-Type": "application/json",
          },
          body: path.endsWith("/data") ? undefined : JSON.stringify(payload),
        },
        env,
      );
      expect(r.status).toBe(503);
    }
  });
  it("guards production configuration and rejects CLI overrides before deployment", () => {
    expect(() =>
      validateDeployment({ vars: { ENVIRONMENT: "production" } }),
    ).not.toThrow();
    for (const config of [
      { vars: { ENVIRONMENT: "development" } },
      {},
      {
        vars: { ENVIRONMENT: "production" },
        env: { preview: { vars: { ENVIRONMENT: "development" } } },
      },
    ])
      expect(() =>
        validateDeployment(config, "env" in config ? ["--env", "preview"] : []),
      ).toThrow();
    for (const args of [
      ["--var", "ENVIRONMENT:development"],
      ["--var=ENVIRONMENT:development"],
      ["--config", "unsafe.json"],
      ["--env", "unknown"],
    ])
      expect(() =>
        validateDeployment({ vars: { ENVIRONMENT: "production" } }, args),
      ).toThrow();
  });
  it("rejects direct mutations without owner session and rejects absent/cross origins with one", async () => {
    await signIn();
    for (const [path, method] of [
      ["/admin/products/sofas-1", "PUT"],
      ["/admin/categories", "POST"],
      ["/admin/settings", "PUT"],
      ["/admin/quotes/fake/retry", "POST"],
      ["/admin/products/sofas-1/images/order", "PUT"],
      ["/admin/products", "POST"],
      ["/admin/products/sofas-1", "DELETE"],
      ["/admin/categories/sofas", "PUT"],
      ["/admin/categories/sofas", "DELETE"],
      ["/admin/products/sofas-1/images", "POST"],
      ["/admin/products/sofas-1/images/0", "DELETE"],
      ["/admin/business", "PUT"],
      ["/admin/leads/fake", "PUT"],
      ["/admin/quotes/fake", "PUT"],
    ]) {
      expect((await call(path, method, {})).status).toBe(401);
      expect(
        (
          await call(
            path,
            method,
            {},
            { Cookie: cookie, Origin: "https://attacker.test" },
          )
        ).status,
      ).toBe(403);
      expect(
        (await call(path, method, {}, { Cookie: cookie, Origin: "" })).status,
      ).toBe(403);
    }
  });
  it("keeps customer data, costs, sessions and keys out of public responses and malformed-body logs", async () => {
    await call("/quotes", "POST", payload);
    await signIn();
    const publicBody = await (await call("/catalog")).text();
    for (const secret of [
      payload.name,
      payload.email,
      payload.phone,
      payload.area,
      env.SESSION_SECRET!,
      env.OWNER_PASSWORD_HASH!,
      "internal_cost",
      "owner_sessions",
    ])
      expect(publicBody).not.toContain(secret);
    const logs = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await app.request(
      base + "/api/quotes",
      {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json" },
        body: '{"name":"private@example.test",',
      },
      env,
    );
    expect(response.status).toBe(400);
    expect(JSON.stringify(logs.mock.calls)).not.toContain(
      "private@example.test",
    );
    expect((await call("/admin/data")).status).toBe(401);
  });
  it("enforces public quote and login throttles without using a predictable fallback", async () => {
    for (let i = 0; i < 10; i++)
      expect((await call("/quotes", "POST", payload)).status).toBe(201);
    expect((await call("/quotes", "POST", payload)).status).toBe(429);
    for (let i = 0; i < 5; i++)
      expect(
        (await call("/auth/login", "POST", { password: "wrong" })).status,
      ).toBe(401);
    expect((await call("/auth/login", "POST", { password })).status).toBe(429);
  });
});

describe("deployment argument ambiguity", () => {
  it("rejects joined aliases, duplicate selections and passthrough flags", () => {
    const config = {
      vars: { ENVIRONMENT: "production" },
      env: {
        live: { vars: { ENVIRONMENT: "production" } },
        unsafe: { vars: { ENVIRONMENT: "development" } },
      },
    };
    for (const args of [
      ["-cunsafe.json"],
      ["-vENVIRONMENT:development"],
      ["-eunsafe"],
      ["--env=live", "--env=unsafe"],
      ["--env="],
      ["--env", "--dry-run"],
      ["--", "--var", "ENVIRONMENT:development"],
    ])
      expect(() => validateDeployment(config, args)).toThrow();
    expect(() =>
      validateDeployment(config, ["--dry-run", "--env", "live"]),
    ).not.toThrow();
  });
});

describe("private owner reads", () => {
  it("keeps the dashboard, business editor and image metadata owner-only", async () => {
    for (const path of [
      "/admin/data",
      "/admin/business",
      "/admin/products/sofas-1/images",
    ])
      expect((await call(path)).status).toBe(401);
    await signIn();
    for (const path of [
      "/admin/data",
      "/admin/business",
      "/admin/products/sofas-1/images",
    ])
      expect(
        (await call(path, "GET", undefined, { Cookie: cookie })).status,
      ).toBe(200);
  });
});
