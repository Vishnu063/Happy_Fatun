import { beforeAll, afterAll, it, expect } from "vitest";
import pg from "pg";
import { Database as SQLiteFixture } from "../helpers";
import { mkdtemp, readFile, rm, cp, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { databasePool, PostgresDatabase } from "../../server/db/postgres";
import { migrate } from "../../server/db/migrations";
import { postgresSQL } from "../../server/db/sql";
import { FileMedia } from "../../server/storage";
import { staticAssets } from "../../server/assets";
import app, { passwordHash, type Env } from "../../worker/index";
const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["127.0.0.1", "localhost"].includes(new URL(url).hostname) ||
  new URL(url).pathname !== "/happy_test"
)
  throw new Error(
    "An isolated loopback happy_test PostgreSQL is mandatory; tests refuse other targets",
  );
const pool = databasePool(url),
  db = new PostgresDatabase(pool),
  origin = "http://127.0.0.1:19701",
  password = "isolated-postgres-owner-password";
let env: Env,
  cookie = "",
  temp: string;
const call = (
  path: string,
  method = "GET",
  body?: unknown,
  owner = false,
  headers: Record<string, string> = {},
) =>
  app.request(
    origin + path,
    {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...(owner ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    env,
  );
const quote = () => ({
  product_id: "pilot-dining",
  configuration: {
    length: 220,
    width: 100,
    height: 75,
    material: "Oak",
    color: "Natural",
    notes: "Private PostgreSQL fixture",
  },
  name: "Isolated Customer",
  phone: "9000000017",
  consent: true,
  website: "",
  submission_key: crypto.randomUUID(),
});
beforeAll(async () => {
  temp = await mkdtemp(join(tmpdir(), "happy-pg-media-"));
  expect(await migrate(pool)).toBe(12);
  env = {
    DB: db as unknown as D1Database,
    ASSETS: staticAssets("dist") as unknown as Fetcher,
    PRODUCT_IMAGES: new FileMedia(temp) as unknown as R2Bucket,
    ENVIRONMENT: "development",
    SESSION_SECRET: "postgres-isolated-secret-at-least-32-characters",
    OWNER_PASSWORD_HASH: `pg-salt:${await passwordHash(password, "pg-salt")}`,
    EMAIL_MODE: "local",
  };
});
afterAll(async () => {
  await pool.end();
  await rm(temp, { recursive: true, force: true });
});
it("applies all twelve migrations repeatably, preserves seed types/history and serializes concurrent runners", async () => {
  expect(await migrate(pool)).toBe(0);
  expect(await Promise.all([migrate(pool), migrate(pool)])).toEqual([0, 0]);
  expect(
    (await pool.query("SELECT COUNT(*)::int n FROM products")).rows[0].n,
  ).toBe(129);
  expect(
    (await pool.query("SELECT expires_at FROM owner_sessions")).rowCount,
  ).toBe(0);
  const dir = join(temp, "migrations");
  await cp("migrations/postgres", dir, { recursive: true });
  await appendFile(join(dir, "0001_initial.sql"), "\n-- changed");
  await expect(migrate(pool, dir)).rejects.toThrow(/checksum/);
});
it("matches every seeded product/category/settings field against all twelve SQLite migrations", async () => {
  const source = new SQLiteFixture();
  try {
    for (const table of ["products", "categories", "settings"]) {
      const expected = source.db
        .prepare(`SELECT * FROM ${table} ORDER BY id`)
        .all();
      const actual = (await pool.query(`SELECT * FROM ${table} ORDER BY id`))
        .rows;
      const stable = (rows: Record<string, unknown>[]) =>
        rows.map((row) =>
          Object.fromEntries(
            Object.entries(row).filter(
              ([key]) => !["created_at", "updated_at"].includes(key),
            ),
          ),
        );
      expect(stable(actual)).toEqual(stable(expected));
    }
  } finally {
    source.db.close();
  }
});
it("rolls back failed migration DDL and resumes from the last committed file without resetting seeded data", async () => {
  await pool.query("CREATE SCHEMA isolated_migration_failure");
  const isolated = new pg.Pool({
    connectionString: url,
    options: "-c search_path=isolated_migration_failure",
    max: 1,
  });
  const dir = join(temp, "failed-migrations");
  try {
    await cp("migrations/postgres", dir, { recursive: true });
    await appendFile(
      join(dir, "0010_private_suppliers.sql"),
      "\nCREATE TABLE interrupted_fixture(id text); SELECT deliberately_missing_function();",
    );
    await expect(migrate(isolated, dir)).rejects.toThrow();
    expect(
      (
        await isolated.query(
          "SELECT to_regclass('suppliers') s,to_regclass('interrupted_fixture') f",
        )
      ).rows[0],
    ).toMatchObject({ s: null, f: null });
    expect(
      (await isolated.query("SELECT COUNT(*)::int n FROM schema_migrations"))
        .rows[0].n,
    ).toBe(9);
    expect(await migrate(isolated)).toBe(3);
    expect(
      (await isolated.query("SELECT COUNT(*)::int n FROM products")).rows[0].n,
    ).toBe(129);
  } finally {
    await isolated.end();
  }
});
it("serves compatible catalogs, legacy details, gallery JSON iteration and crawlable SEO without private fields", async () => {
  const data = await (await call("/api/catalog")).json<any>();
  expect(data.products).toHaveLength(121);
  expect(data.categories).toHaveLength(15);
  expect(data.products[0].internal_cost).toBeUndefined();
  expect(
    (await call("/design/vana-pedestal-dining-table/pilot-dining")).status,
  ).toBe(200);
  expect(await (await call("/sitemap.xml")).text()).toContain("pilot-dining");
  expect(
    (await (await call("/api/products/sofas-1")).json<any>()).product.name,
  ).toBe("Aara lounge sofa");
});
it("preserves server auth, millisecond expiry, CSRF and copied-cookie revocation", async () => {
  expect((await call("/api/admin/data")).status).toBe(401);
  const r = await call("/api/auth/login", "POST", { password });
  expect(r.status).toBe(200);
  cookie = r.headers.get("set-cookie")!.split(";")[0];
  expect((await call("/api/admin/data", "GET", undefined, true)).status).toBe(
    200,
  );
  expect(
    (
      await call("/api/admin/settings", "PUT", { minimum_margin: 20 }, true, {
        Origin: "https://attacker.test",
      })
    ).status,
  ).toBe(403);
  const expiry = (await pool.query("SELECT expires_at FROM owner_sessions"))
    .rows[0].expires_at;
  expect(typeof expiry).toBe("number");
  expect(expiry).toBeGreaterThan(Date.now());
  expect((await call("/api/auth/logout", "POST", {}, true)).status).toBe(200);
  expect((await call("/api/admin/data", "GET", undefined, true)).status).toBe(
    401,
  );
  cookie = (await call("/api/auth/login", "POST", { password })).headers
    .get("set-cookie")!
    .split(";")[0];
});
it("persists price edits, retains private costs and audits only null-safe price changes", async () => {
  const product = await db
    .prepare("SELECT * FROM products WHERE id=?")
    .bind("pilot-chair")
    .first<any>();
  const { id, updated_at, ...body } = product;
  body.images = JSON.parse(body.images);
  body.materials = JSON.parse(body.materials);
  body.colors = JSON.parse(body.colors);
  body.price = 1234500;
  body.internal_cost = 800025;
  expect(
    (await call("/api/admin/products/pilot-chair", "PUT", body, true)).status,
  ).toBe(200);
  expect((await call("/api/products/pilot-chair")).status).toBe(200);
  const publicProduct = (
    await (await call("/api/products/pilot-chair")).json<any>()
  ).product;
  expect(publicProduct.price).toBe(1234500);
  expect(publicProduct.internal_cost).toBeUndefined();
  expect(
    (
      await pool.query(
        "SELECT old_price,new_price FROM price_audit WHERE product_id='pilot-chair'",
      )
    ).rows,
  ).toEqual([{ old_price: null, new_price: 1234500 }]);
  expect(
    (await call("/api/admin/products/pilot-chair", "PUT", body, true)).status,
  ).toBe(200);
  expect(
    (
      await pool.query(
        "SELECT COUNT(*)::int n FROM price_audit WHERE product_id='pilot-chair'",
      )
    ).rows[0].n,
  ).toBe(1);
  body.price = null;
  expect(
    (await call("/api/admin/products/pilot-chair", "PUT", body, true)).status,
  ).toBe(200);
  expect(
    (
      await pool.query(
        "SELECT COUNT(*)::int n FROM price_audit WHERE product_id='pilot-chair'",
      )
    ).rows[0].n,
  ).toBe(2);
});
it("persists minimal quotations atomically, handles retries and private erasure on PostgreSQL JSON", async () => {
  const data = quote();
  const r = await call("/api/quotes", "POST", data);
  expect(r.status).toBe(201);
  const receipt = await r.json<any>();
  expect((await call("/api/quotes", "POST", data)).status).toBe(200);
  const rows = await pool.query("SELECT * FROM quotes WHERE reference=$1", [
    receipt.reference,
  ]);
  expect(rows.rows[0].email_attempts).toBe(1);
  expect(rows.rows[0].phone).toBe("+919000000017");
  expect(rows.rows[0].product_snapshot).not.toContain("internal_cost");
  expect(
    (
      await call(
        `/api/admin/quotes/${rows.rows[0].id}/personal-data`,
        "DELETE",
        undefined,
        true,
      )
    ).status,
  ).toBe(200);
  expect(
    JSON.parse(
      (
        await pool.query("SELECT configuration FROM quotes WHERE id=$1", [
          rows.rows[0].id,
        ])
      ).rows[0].configuration,
    ).notes,
  ).toBe("");
});
it("keeps private multi-supplier costs, handles duplicates and protects source records", async () => {
  const supplier = await (
    await call(
      "/api/admin/suppliers",
      "POST",
      { name: "Private PG Shop" },
      true,
    )
  ).json<any>();
  const data = {
    product_id: "pilot-dining",
    supplier_id: supplier.id,
    supplier_cost: 800025,
    selling_price: 1200000,
  };
  const responses = await Promise.all([
    call("/api/admin/product-suppliers", "POST", data, true),
    call("/api/admin/product-suppliers", "POST", data, true),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    (await call("/api/admin/products/pilot-dining", "DELETE", undefined, true))
      .status,
  ).toBe(409);
  const publicBody = await (await call("/api/catalog")).text();
  expect(publicBody).not.toContain("Private PG Shop");
  expect(publicBody).not.toContain("supplier_cost");
});
it("rolls back failed batches, enforces foreign keys and uses parameters instead of interpolating values", async () => {
  await expect(
    db.batch([
      db
        .prepare("INSERT INTO categories(id,name) VALUES(?,?)")
        .bind("rollback", "Rollback fixture"),
      db
        .prepare("INSERT INTO owner_sessions(id,expires_at) VALUES(?,?)")
        .bind(null, 1),
    ]),
  ).rejects.toThrow();
  expect(
    await db
      .prepare("SELECT id FROM categories WHERE id=?")
      .bind("rollback")
      .first(),
  ).toBeNull();
  const payload = "x'); DROP TABLE products;--";
  await db
    .prepare("INSERT INTO categories(id,name) VALUES(?,?)")
    .bind("safe-parameter", payload)
    .run();
  expect(
    (
      await db
        .prepare("SELECT name FROM categories WHERE id=?")
        .bind("safe-parameter")
        .first<any>()
    )?.name,
  ).toBe(payload);
});
it("uploads, serves and removes private-store media through database publication and durable cleanup", async () => {
  const bytes = await readFile("public/assets/pilot/dining-card.webp");
  const upload = await app.request(
    origin + "/api/admin/products/pilot-dining/images",
    {
      method: "POST",
      headers: {
        Origin: origin,
        Cookie: cookie,
        "Content-Type": "image/webp",
        "X-Image-Alt": "Isolated original image",
        "X-Image-Kind": "illustrative",
      },
      body: bytes,
    },
    env,
  );
  expect(upload.status).toBe(201);
  const gallery = await (
    await call("/api/products/pilot-dining/images")
  ).json<any>();
  const added = gallery.images.at(-1);
  expect((await call(added.url)).status).toBe(200);
  expect(
    (
      await call(
        "/api/admin/products/pilot-dining/images/1",
        "DELETE",
        undefined,
        true,
      )
    ).status,
  ).toBe(200);
  expect((await call(added.url)).status).toBe(404);
  expect(
    (await call("/api/admin/media/cleanup", "POST", {}, true)).status,
  ).toBe(200);
});
it("runs the actual Node HTTP entry point with spoof-resistant rate limits, metrics and dependency readiness", async () => {
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const socket = createServer();
  await new Promise<void>((r) => socket.listen(0, "127.0.0.1", r));
  const port = (socket.address() as { port: number }).port;
  await new Promise<void>((r) => socket.close(() => r()));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["dist-server/index.mjs"], {
    env: {
      ...process.env,
      DATABASE_URL: url,
      PORT: String(port),
      PUBLIC_ORIGIN: base,
      ENVIRONMENT: "development",
      MEDIA_DRIVER: "filesystem",
      MEDIA_ROOT: temp,
      SESSION_SECRET: env.SESSION_SECRET,
      OWNER_PASSWORD_HASH: env.OWNER_PASSWORD_HASH,
      EMAIL_MODE: "disabled",
      TRUSTED_PROXY_CIDRS: "",
    },
    stdio: "ignore",
  });
  try {
    let ready = false;
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(base + "/health/ready")).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(ready).toBe(true);
    expect((await fetch(base + "/api/catalog")).status).toBe(200);
    const { request: rawRequest } = await import("node:http");
    const badHost = await new Promise<number>((resolve) => {
      const req = rawRequest(
        base + "/api/catalog",
        { headers: { Host: "attacker.test" } },
        (r) => {
          r.resume();
          resolve(r.statusCode || 0);
        },
      );
      req.end();
    });
    expect(badHost).toBe(400);
    for (let i = 0; i < 6; i++) {
      const response = await fetch(base + "/api/auth/login", {
        method: "POST",
        headers: {
          Origin: base,
          "Content-Type": "application/json",
          "CF-Connecting-IP": `192.0.2.${i + 1}`,
          "X-Forwarded-For": `198.51.100.${i + 1}`,
        },
        body: JSON.stringify({ password: "invalid" }),
      });
      expect(response.status).toBe(i < 5 ? 401 : 429);
    }
    const metrics = await (await fetch(base + "/metrics")).text();
    expect(metrics).toContain("happy_furn_http_request_duration_seconds");
    expect(metrics).not.toContain("Isolated Customer");
    await pool.query(
      "ALTER TABLE schema_migrations RENAME TO isolated_history_offline",
    );
    try {
      expect((await fetch(base + "/health/ready")).status).toBe(503);
      expect(await (await fetch(base + "/metrics")).text()).toContain(
        "happy_furn_readiness 0",
      );
      expect((await fetch(base + "/health/live")).status).toBe(200);
    } finally {
      await pool.query(
        "ALTER TABLE isolated_history_offline RENAME TO schema_migrations",
      );
    }
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((r) => {
      if (child.exitCode !== null) r();
      else child.once("exit", () => r());
    });
  }
});
