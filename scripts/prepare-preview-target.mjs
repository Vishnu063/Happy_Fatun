import { readFileSync, writeFileSync } from "node:fs";
import ts from "typescript";
import { preparePreviewTarget } from "../shared/manual-deployment.ts";
if (process.argv.length !== 2)
  throw new Error("No configuration/path overrides are supported.");
const file = "wrangler.preview.jsonc";
const parsed = ts.parseConfigFileTextToJson(file, readFileSync(file, "utf8"));
if (parsed.error)
  throw new Error("Cannot parse reviewed preview configuration.");
const config = preparePreviewTarget(
  parsed.config,
  process.env.CLOUDFLARE_ACCOUNT_ID,
  process.env.CLOUDFLARE_D1_DATABASE_ID,
);
writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log(
  "Reviewed no-R2 preview target configured in this checkout only. No Cloudflare request performed.",
);
