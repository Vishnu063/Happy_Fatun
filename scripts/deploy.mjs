import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { validateDeployment } from "../shared/deployment.ts";
const args = process.argv.slice(2);
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
  "wrangler.jsonc",
  readFileSync("wrangler.jsonc", "utf8"),
);
if (parsed.error) throw new Error("Cannot parse Wrangler configuration.");
validateDeployment(
  parsed.config,
  args.filter((arg) => arg !== "--check"),
);
if (args.includes("--check"))
  console.log(
    "Production deployment configuration guard passed. No deployment performed.",
  );
else {
  const result = spawnSync(
    process.execPath,
    ["node_modules/wrangler/bin/wrangler.js", "deploy", ...args],
    { stdio: "inherit" },
  );
  process.exit(result.status ?? 1);
}
