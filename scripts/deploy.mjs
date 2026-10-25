import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { validateDeployment, validatePreview } from "../shared/deployment.ts";
const supplied = process.argv.slice(2);
const preview = supplied.includes("--preview");
if (supplied.filter((arg) => arg === "--preview").length > 1)
  throw new Error("Select the preview profile only once.");
const args = supplied.filter((arg) => arg !== "--preview");
const configPath = preview ? "wrangler.preview.jsonc" : "wrangler.jsonc";
if (
  preview &&
  (process.env.CLOUDFLARE_ENV ||
    args.some(
      (arg) => arg === "--env" || arg === "-e" || arg.startsWith("--env="),
    ))
)
  throw new Error(
    "Preview uses its reviewed config directly; named environment overrides are blocked.",
  );
if (process.env.ENVIRONMENT && process.env.ENVIRONMENT !== "production")
  throw new Error(
    "Deployment blocked: inherited ENVIRONMENT must be production.",
  );
const explicitEnvironment = args.some(
  (arg) => arg === "--env" || arg === "-e" || arg.startsWith("--env="),
);
if (process.env.CLOUDFLARE_ENV && !explicitEnvironment)
  args.push("--env", process.env.CLOUDFLARE_ENV);
const parsed = ts.parseConfigFileTextToJson(
  configPath,
  readFileSync(configPath, "utf8"),
);
if (parsed.error) throw new Error("Cannot parse Wrangler configuration.");
validateDeployment(
  parsed.config,
  args.filter((arg) => arg !== "--check"),
);
if (preview)
  validatePreview(
    parsed.config,
    !args.includes("--check") && !args.includes("--dry-run"),
  );
if (args.includes("--check"))
  console.log(
    preview
      ? "No-R2 preview template guard passed. No deployment performed; owner account/database identifiers and live service readiness are not verified."
      : "Production deployment configuration guard passed. No deployment performed.",
  );
else {
  const result = spawnSync(
    process.execPath,
    [
      "node_modules/wrangler/bin/wrangler.js",
      "deploy",
      ...(preview ? ["--config", configPath] : []),
      ...args,
    ],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
