import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
const action = process.argv[2];
const options = process.argv.slice(3);
if (
  options.some((option) => option !== "--no-build") ||
  (options.length && action !== "up")
)
  throw new Error("Only website:up supports --no-build");
if (!["up", "status", "down"].includes(action))
  throw new Error("Use website:up, website:status or website:down");
if (!existsSync(".env.lab"))
  throw new Error(
    "First generate your private local configuration: see docs/WEBSITE.md. Never paste passwords into chat.",
  );
const text = readFileSync(".env.lab", "utf8");
const port = Number(
  process.env.FRONTEND_PORT ||
    text.match(/^FRONTEND_PORT=(\d+)$/m)?.[1] ||
    8081,
);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  [8080, 8090].includes(port)
)
  throw new Error(
    "Choose an available local port; preserve Jenkins 8080 and Kubernetes 8090.",
  );
const env = {
  ...process.env,
  FRONTEND_PORT: String(port),
  BACKEND_IMAGE: "happy-furn-backend:lab",
  FRONTEND_IMAGE: "happy-furn-frontend:lab",
  POSTGRES_IMAGE: "happy-furn-postgres:lab",
};
for (const key of [
  "DOCKER_HOST",
  "DOCKER_CONTEXT",
  "DOCKER_TLS",
  "DOCKER_TLS_VERIFY",
  "DOCKER_CERT_PATH",
])
  delete env[key];
function docker(args) {
  const result = spawnSync(
    "docker",
    ["--host=unix:///var/run/docker.sock", ...args],
    { env, stdio: "inherit" },
  );
  if (result.status !== 0) process.exit(result.status || 1);
}
const compose = (args) =>
  docker([
    "compose",
    "--project-name",
    "happy-furn-website",
    "--env-file",
    ".env.lab",
    ...args,
  ]);
compose(["config", "--quiet"]);
if (action === "up") {
  if (!options.includes("--no-build"))
    for (const part of ["backend", "frontend", "postgres"]) {
      const ca = env.CODEX_PROXY_CERT
        ? ["--secret", `id=proxy_ca,src=${env.CODEX_PROXY_CERT}`]
        : [];
      docker([
        "build",
        ...ca,
        "-f",
        `deploy/docker/${part}.Dockerfile`,
        "-t",
        `happy-furn-${part}:lab`,
        ".",
      ]);
    }
  compose(["up", "-d", "--no-build", "--wait", "--wait-timeout", "120"]);
  const response = await fetch(`http://127.0.0.1:${port}/api/catalog`);
  if (!response.ok)
    throw new Error(
      "Website started but catalog verification failed; inspect website:status.",
    );
  console.log(
    `Website: http://127.0.0.1:${port}\nMaster Control: http://127.0.0.1:${port}/admin\nDatabase and media persist in local volumes. Email is disabled; this is a local preview.`,
  );
} else if (action === "status") compose(["ps"]);
else compose(["down"]); // Intentionally no volume deletion, reset or remote operations.
