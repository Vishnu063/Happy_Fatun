import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { Database } from "./helpers";
import app, { passwordHash, type Env } from "../worker/index";
import { indianMobile } from "../shared/inquiries";
let db: Database,
  env: Env,
  cookie = "";
const origin = "https://aaranya.example.test";
const password = "isolated-inquiry-password";
const payload = () => ({
  product_id: "pilot-dining",
  configuration: {
    length: 220,
    width: 100,
    height: 75,
    material: "Oak",
    color: "Natural",
    notes: "Private customer message",
  },
  name: "Isolated Customer",
  phone: "9000000012",
  consent: true,
  website: "",
});
async function call(
  path: string,
  method = "GET",
  body?: unknown,
  owner = false,
  source = origin,
) {
  return app.request(
    origin + "/api" + path,
    {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(method === "GET" ? {} : { Origin: source }),
        ...(owner ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
}
beforeEach(async () => {
  db = new Database();
  env = {
    DB: db as unknown as D1Database,
    ENVIRONMENT: "production",
    EMAIL_MODE: "disabled",
    SESSION_SECRET: "isolated-inquiry-signing-secret-at-least-32",
    OWNER_PASSWORD_HASH: `inquiry-salt:${await passwordHash(password, "inquiry-salt")}`,
  };
  cookie = "";
});
afterEach(() => db.db.close());
describe("minimal private customer inquiries", () => {
  it("accepts name/mobile with optional contact fields omitted and binds product snapshot server-side", async () => {
    const r = await call("/quotes", "POST", payload());
    expect(r.status).toBe(201);
    const receipt = await r.json<any>();
    expect(receipt.reference).toMatch(/^AL-/);
    for (const v of [
      "Isolated Customer",
      "9000000012",
      "Private customer message",
    ])
      expect(JSON.stringify(receipt)).not.toContain(v);
    const q = db.db.prepare("SELECT * FROM quotes").get()!;
    expect(q.phone).toBe("+919000000012");
    expect(q.email).toBe("");
    expect(q.area).toBe("");
    expect(q.status).toBe("New");
    expect(q.email_status).toBe("disabled");
    expect(JSON.parse(String(q.product_snapshot)).name).toBe(
      "Vana pedestal dining table",
    );
    expect(
      (
        await call("/quotes", "POST", {
          ...payload(),
          product_name: "Forged product",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await call("/quotes", "POST", {
          ...payload(),
          product_id: "not-a-product",
        })
      ).status,
    ).toBe(404);
  });
  it("rejects invalid Indian mobile, optional malformed email, no consent and overlong address", async () => {
    for (const phone of [
      "-------",
      "1234567890",
      "+12025550123",
      "900000000",
      "900000000000",
      "9<script>000000001",
    ])
      expect(
        (await call("/quotes", "POST", { ...payload(), phone })).status,
      ).toBe(400);
    for (const extra of [
      { email: "invalid" },
      { consent: false },
      { area: "x".repeat(501) },
    ])
      expect(
        (await call("/quotes", "POST", { ...payload(), ...extra })).status,
      ).toBe(400);
    expect(db.db.prepare("SELECT COUNT(*) n FROM quotes").get()?.n).toBe(0);
    for (const phone of [
      "9000000012",
      "+91 9000000012",
      "(90000) 00012",
      "09000000012",
    ]) {
      expect(indianMobile(phone)).toBe("+919000000012");
    }
  });
  it("retains idempotent receipt without optional details or duplicate notification", async () => {
    const data = { ...payload(), submission_key: crypto.randomUUID() };
    const first = await call("/quotes", "POST", data);
    const second = await call("/quotes", "POST", data);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(await first.json());
    expect(
      db.db
        .prepare("SELECT COUNT(*) n,MAX(email_attempts) attempts FROM quotes")
        .get(),
    ).toMatchObject({ n: 1, attempts: 1 });
  });
  it("owner personal-data removal requires auth/origin and preserves record/configuration/commercial history", async () => {
    await call("/quotes", "POST", {
      ...payload(),
      email: "private@example.test",
      area: "Private address",
    });
    const q = db.db.prepare("SELECT * FROM quotes").get()!;
    const endpoint = `/admin/quotes/${q.id}/personal-data`;
    expect((await call(endpoint, "DELETE")).status).toBe(401);
    const login = await call("/auth/login", "POST", { password });
    cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect(
      (await call(endpoint, "DELETE", undefined, true, "https://attacker.test"))
        .status,
    ).toBe(403);
    db.db
      .prepare(
        "UPDATE quotes SET owner_notes='Private follow-up',follow_up_date='2026-12-01',final_price=1200000,internal_cost=800000 WHERE id=?",
      )
      .run(q.id as string);
    expect((await call(endpoint, "DELETE", undefined, true)).status).toBe(200);
    const cleared = db.db
      .prepare("SELECT * FROM quotes WHERE id=?")
      .get(q.id as string)!;
    expect(cleared).toMatchObject({
      id: q.id,
      reference: q.reference,
      product_id: q.product_id,
      name: "Deleted inquiry",
      email: "",
      phone: "",
      area: "",
      owner_notes: "",
      follow_up_date: null,
      final_price: 1200000,
      internal_cost: 800000,
    });
    expect(JSON.parse(String(cleared.configuration))).toMatchObject({
      notes: "",
      length: 220,
    });
    expect(cleared.product_snapshot).toBe(q.product_snapshot);
    expect(
      (
        await call(
          "/admin/quotes/not-found/personal-data",
          "DELETE",
          undefined,
          true,
        )
      ).status,
    ).toBe(404);
  });
});
