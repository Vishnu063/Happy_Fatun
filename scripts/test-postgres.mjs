import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
const env = { ...process.env };
for (const name of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[name];
const temp = mkdtempSync(join(tmpdir(), "happy-furn-postgres-")),
  name = "happy-furn-test-" + randomBytes(5).toString("hex"),
  password = randomBytes(24).toString("hex");
const docker = (args) =>
  spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    encoding: "utf8",
  });
let owned = false;
try {
  writeFileSync(
    join(temp, "postgres.env"),
    `POSTGRES_USER=happy_test\nPOSTGRES_DB=happy_test\nPOSTGRES_PASSWORD=${password}\n`,
    { mode: 0o600 },
  );
  const start = docker([
    "run",
    "-d",
    "--name",
    name,
    "--env-file",
    join(temp, "postgres.env"),
    "-p",
    "127.0.0.1::5432",
    "postgres:17-alpine",
  ]);
  if (start.status !== 0)
    throw new Error(
      "Cannot start isolated local PostgreSQL; no remote fallback",
    );
  owned = true;
  let ready = false;
  for (let attempt = 0; attempt < 250; attempt++) {
    if (
      docker([
        "exec",
        name,
        "pg_isready",
        "-h",
        "127.0.0.1",
        "-U",
        "happy_test",
        "-d",
        "happy_test",
      ]).status === 0
    ) {
      ready = true;
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("Local PostgreSQL readiness timed out");
  const port = docker([
    "inspect",
    "--format",
    '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}',
    name,
  ]).stdout.trim();
  if (!/^\d+$/.test(port)) throw new Error("Missing isolated PostgreSQL port");
  const test = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.postgres.config.ts",
    ],
    {
      stdio: "inherit",
      env: {
        ...env,
        TEST_DATABASE_URL: `postgresql://happy_test:${password}@127.0.0.1:${port}/happy_test`,
      },
    },
  );
  process.exitCode = test.status ?? 1;
} finally {
  if (owned) docker(["rm", "-f", "-v", name]);
  rmSync(temp, { recursive: true, force: true });
}
