import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { pbkdf2Sync, randomBytes } from "node:crypto";
import ts from "typescript";
import { validatePreview } from "../shared/deployment.ts";
const root = process.cwd();
const noR2 = process.argv.includes("--no-r2");
const previewConfig = noR2
  ? ts.parseConfigFileTextToJson(
      "wrangler.preview.jsonc",
      readFileSync("wrangler.preview.jsonc", "utf8"),
    ).config
  : {};
if (noR2) validatePreview(previewConfig);
const temp = mkdtempSync(join(tmpdir(), "happy-fatun-e2e-"));
const cli = resolve("node_modules/wrangler/bin/wrangler.js");
const salt = randomBytes(16).toString("hex");
const password = "e2e-only-owner-password-not-for-production";
writeFileSync(
  join(temp, ".dev.vars"),
  `ENVIRONMENT=development\nEMAIL_MODE=${noR2 ? "disabled" : "local"}\nOWNER_PASSWORD_HASH=${salt}:${pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex")}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\n`,
  { mode: 0o600 },
);
writeFileSync(
  join(temp, "wrangler.json"),
  JSON.stringify({
    ...previewConfig,
    account_id: undefined,
    name: "happy-fatun-e2e",
    main: join(root, "worker/index.ts"),
    compatibility_date: "2026-01-01",
    assets: {
      directory: join(root, "dist"),
      binding: "ASSETS",
      not_found_handling: "single-page-application",
      run_worker_first: true,
    },
    ...(!noR2
      ? {
          r2_buckets: [
            { binding: "PRODUCT_IMAGES", bucket_name: "aaranya-test-images" },
          ],
        }
      : {}),
    d1_databases: [
      {
        binding: "DB",
        database_name: "happy-fatun",
        database_id: "e2e-local",
        migrations_dir: join(root, "migrations"),
      },
    ],
  }),
);
const args = ["--config", join(temp, "wrangler.json")];
const processEnv = {
  ...process.env,
  WRANGLER_LOG_PATH: join(temp, "wrangler.log"),
  WRANGLER_SEND_METRICS: "false",
};
const migration = spawnSync(
  process.execPath,
  [cli, "d1", "migrations", "apply", "happy-fatun", "--local", ...args],
  { cwd: temp, env: processEnv, stdio: "pipe" },
);
if (migration.status !== 0) {
  console.error("E2E database migration failed.");
  process.stderr.write(migration.stderr);
  rmSync(temp, { recursive: true, force: true });
  process.exit(1);
}
const child = spawn(process.execPath, [cli, "dev", "--port", "8790", ...args], {
  cwd: temp,
  env: processEnv,
  stdio: ["ignore", "pipe", "pipe"],
});
// Wrangler can echo configured variables. Discard its output rather than exposing test secrets.
child.stdout.on("data", () => {});
child.stderr.on("data", () => {});
let cleaning = false;
function cleanup() {
  if (cleaning) return;
  cleaning = true;
  child.kill("SIGTERM");
  setTimeout(() => {
    rmSync(temp, { recursive: true, force: true });
    process.exit(0);
  }, 500);
}
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
child.on("exit", (code) => {
  if (!cleaning) {
    rmSync(temp, { recursive: true, force: true });
    process.exit(code || 0);
  }
});
