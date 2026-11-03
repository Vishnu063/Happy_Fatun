import { spawnSync } from "node:child_process";
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
const name = "happy-furn-s3-test-" + randomBytes(5).toString("hex");
const docker = (args) =>
  spawnSync("docker", ["--host=unix:///var/run/docker.sock", ...args], {
    env,
    encoding: "utf8",
  });
let owned = false;
try {
  if (
    docker([
      "run",
      "-d",
      "--name",
      name,
      "-p",
      "127.0.0.1::5000",
      "motoserver/moto:5.1.11",
    ]).status !== 0
  )
    throw new Error("Local S3 emulator unavailable; no AWS fallback");
  owned = true;
  const port = docker([
    "inspect",
    "--format",
    '{{(index (index .NetworkSettings.Ports "5000/tcp") 0).HostPort}}',
    name,
  ]).stdout.trim();
  if (!/^\d+$/.test(port)) throw new Error("S3 emulator port unavailable");
  const endpoint = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(endpoint + "/moto-api/")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("S3 emulator readiness failed");
  const test = spawnSync(
    process.execPath,
    [
      "node_modules/vitest/vitest.mjs",
      "run",
      "--config",
      "vitest.s3.config.ts",
    ],
    { stdio: "inherit", env: { ...env, TEST_S3_ENDPOINT: endpoint } },
  );
  process.exitCode = test.status ?? 1;
} finally {
  if (owned) docker(["rm", "-f", "-v", name]);
}
