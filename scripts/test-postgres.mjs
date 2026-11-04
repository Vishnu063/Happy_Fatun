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
  if (test.status === 0) {
    // Only this runner's synthetic local database/container: never a remote target.
    const exec = (args) => {
      const result = docker(["exec", name, ...args]);
      if (result.status !== 0)
        throw new Error(
          `Isolated PostgreSQL backup/restore verification failed at ${args[0]}`,
        );
      return result.stdout.trim();
    };
    exec([
      "pg_dump",
      "-U",
      "happy_test",
      "-d",
      "happy_test",
      "--schema=public",
      "--format=custom",
      "--file=/tmp/isolated-preview.dump",
    ]);
    exec(["chmod", "0600", "/tmp/isolated-preview.dump"]);
    exec(["createdb", "-U", "happy_test", "happy_restore_test"]);
    exec([
      "pg_restore",
      "-U",
      "happy_test",
      "-d",
      "happy_restore_test",
      // Safe only because happy_restore_test was freshly created above in our owned fixture.
      "--clean",
      "--if-exists",
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "/tmp/isolated-preview.dump",
    ]);
    const query = (database, sql) =>
      exec([
        "psql",
        "-X",
        "-U",
        "happy_test",
        "-d",
        database,
        "-v",
        "ON_ERROR_STOP=1",
        "-At",
        "-c",
        sql,
      ]);
    const tablesSQL =
      "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename";
    const tables = query("happy_test", tablesSQL);
    if (!tables || tables !== query("happy_restore_test", tablesSQL))
      throw new Error("Restored table inventory mismatch");
    const list = tables.split("\n");
    for (const table of list) {
      const identifier = '"' + table.replaceAll('"', '""') + '"';
      const sql = `SELECT count(*),md5(COALESCE(string_agg(row_to_json(t)::text,E'\\n' ORDER BY row_to_json(t)::text),'')) FROM public.${identifier} t`;
      if (query("happy_test", sql) !== query("happy_restore_test", sql))
        throw new Error("Restored row count/content checksum mismatch");
    }
    console.log(
      `PASS: isolated pg_dump/pg_restore into a separate database; ${list.length} public tables matched by row count and content checksum. Synthetic data only.`,
    );
  }
} finally {
  if (owned) docker(["rm", "-f", "-v", name]);
  rmSync(temp, { recursive: true, force: true });
}
