import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { createServer } from "node:net";
const temp = mkdtempSync(join(tmpdir(), "happy-compose-")),
  project = "happy-furn-smoke-" + randomBytes(5).toString("hex");
const socket = createServer();
await new Promise((r) => socket.listen(0, "127.0.0.1", r));
const port = socket.address().port;
await new Promise((r) => socket.close(r));
const password = randomBytes(24).toString("hex"),
  salt = randomBytes(16).toString("hex"),
  hash =
    salt +
    ":" +
    pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex");
const file = join(temp, "lab.env");
writeFileSync(
  file,
  `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nOWNER_PASSWORD_HASH=${hash}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nFRONTEND_PORT=${port}\n`,
  { mode: 0o600 },
);
const secrets = [
  password,
  hash,
  ...readFileSync(file, "utf8")
    .split("\n")
    .map((v) => v.slice(v.indexOf("=") + 1))
    .filter((v) => v.length > 20),
];
const sanitize = (s) =>
  secrets.reduce((out, key) => out.replaceAll(key, "[REDACTED]"), s);
const env = { ...process.env };
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
const compose = (args, required = true) => {
  const r = spawnSync(
    "docker",
    [
      "--host=unix:///var/run/docker.sock",
      "compose",
      "--project-name",
      project,
      "--env-file",
      file,
      ...args,
    ],
    { env, encoding: "utf8" },
  );
  if (required && r.status !== 0) {
    console.error(sanitize(r.stderr));
    throw new Error("Isolated Compose operation failed: " + args[0]);
  }
  return r;
};
const origin = `http://127.0.0.1:${port}`;
let cookie = "";
const api = async (path, method = "GET", data, owner = false) =>
  fetch(origin + path, {
    method,
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      ...(owner ? { Cookie: cookie } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
const check = (condition, message) => {
  if (!condition) throw new Error(message);
};
try {
  compose(["config", "--quiet"]);
  compose(["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"]);
  check(
    (await (await api("/api/catalog")).json()).products.length === 21,
    "Catalog contract failed",
  );
  check(
    (await api("/api/admin/data")).status === 401,
    "Anonymous admin accepted",
  );
  const shell = await (await api("/")).text();
  const assetURLs = [
    ...shell.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g),
  ].map((match) => match[1]);
  check(assetURLs.length >= 2, "Missing built script/style links");
  for (const asset of assetURLs)
    check(
      (await api(asset)).status === 200,
      "Frontend/backend static asset version mismatch",
    );
  const design = await api("/design/vana-pedestal-dining-table/pilot-dining");
  check(
    (await design.text()).includes("<h1>Vana pedestal dining table</h1>"),
    "Crawlable product HTML missing",
  );
  check(
    (await api("/metrics")).status === 404,
    "Metrics exposed by public proxy",
  );
  const key = crypto.randomUUID(),
    payload = {
      product_id: "pilot-dining",
      configuration: {
        length: 220,
        width: 100,
        height: 75,
        material: "Oak",
        color: "Natural",
        notes: "Isolated Compose fixture",
      },
      name: "Isolated Compose Customer",
      phone: "9000000029",
      consent: true,
      website: "",
      submission_key: key,
    };
  const saved = await api("/api/quotes", "POST", payload);
  check(saved.status === 201, "Quote persistence failed");
  const reference = (await saved.json()).reference;
  check(
    (await api("/api/quotes", "POST", payload)).status === 200,
    "Duplicate receipt recovery failed",
  );
  const login = await api("/api/auth/login", "POST", { password });
  check(login.status === 200, "Owner login failed");
  cookie = login.headers.get("set-cookie").split(";")[0];
  const data = await (
    await api("/api/admin/data", "GET", undefined, true)
  ).json();
  check(
    data.quotes.some(
      (q) => q.reference === reference && q.name === payload.name,
    ),
    "Private quote not retained",
  );
  const shop = await api(
    "/api/admin/suppliers",
    "POST",
    { name: "Isolated Compose Shop" },
    true,
  );
  check(shop.status === 201, "Supplier creation failed");
  const shopID = (await shop.json()).id;
  check(
    (
      await api(
        "/api/admin/product-suppliers",
        "POST",
        {
          product_id: "pilot-dining",
          supplier_id: shopID,
          supplier_cost: 800025,
        },
        true,
      )
    ).status === 201,
    "Supplier link failed",
  );
  check(
    !(await (await api("/api/catalog")).text()).includes(
      "Isolated Compose Shop",
    ),
    "Supplier leak",
  );
  compose(["stop", "postgres"]);
  const health = compose([
    "exec",
    "-T",
    "backend",
    "node",
    "-e",
    "Promise.all(['/health/ready','/health/live'].map(p=>fetch('http://127.0.0.1:3000'+p).then(r=>r.status))).then(s=>{if(s[0]!==503||s[1]!==200)process.exit(1)})",
  ]);
  check(health.status === 0, "Database outage health behavior failed");
  compose(["start", "postgres"]);
  let recovered = false;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await api("/api/catalog")).ok) {
        recovered = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  check(recovered, "Database recovery failed");
  const persisted = await (
    await api("/api/admin/data", "GET", undefined, true)
  ).json();
  check(
    persisted.quotes.some((q) => q.reference === reference),
    "Quote lost after PostgreSQL restart",
  );
  await api("/api/auth/logout", "POST", {}, true);
  check(
    (await api("/api/admin/data", "GET", undefined, true)).status === 401,
    "Copied cookie survives logout",
  );
  const attempts = [];
  for (let i = 0; i < 6; i++) {
    const response = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        "CF-Connecting-IP": `192.0.2.${i + 1}`,
        "X-Forwarded-For": `198.51.100.${i + 1}`,
      },
      body: JSON.stringify({ password: "invalid" }),
    });
    attempts.push(response.status);
  }
  check(
    attempts[4] === 429 && attempts[5] === 429,
    "Forged forwarding headers bypassed rate limit through Nginx",
  );
  console.log(
    "PASS: isolated Compose catalog, SSR, auth, quote retry/persistence, supplier privacy, PostgreSQL outage/readiness/recovery and logout. Test data only.",
  );
} catch (error) {
  const logs = compose(["logs", "--no-color", "--tail", "40"], false);
  console.error(sanitize(logs.stdout + logs.stderr));
  throw error;
} finally {
  compose(["down", "--volumes", "--remove-orphans"], false);
  rmSync(temp, { recursive: true, force: true });
}
