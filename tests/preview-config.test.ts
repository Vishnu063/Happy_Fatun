import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import { validatePreview } from "../shared/deployment";
const config = ts.parseConfigFileTextToJson(
  "wrangler.preview.jsonc",
  readFileSync("wrangler.preview.jsonc", "utf8"),
).config;
describe("reviewed no-R2 preview deployment profile", () => {
  it("works as a local template but refuses publication until non-secret target identifiers are supplied", () => {
    expect(config.r2_buckets).toBeUndefined();
    expect(() => validatePreview(config)).not.toThrow();
    expect(() => validatePreview(config, true)).toThrow(/owner-reviewed/);
    expect(() =>
      validatePreview(
        {
          ...config,
          account_id: "a".repeat(32),
          d1_databases: [
            {
              ...config.d1_databases[0],
              database_id: "11111111-1111-4111-8111-111111111111",
            },
          ],
        },
        true,
      ),
    ).not.toThrow();
    const future = ts.parseConfigFileTextToJson(
      "wrangler.jsonc",
      readFileSync("wrangler.jsonc", "utf8"),
    ).config;
    expect(future.r2_buckets).toHaveLength(1);
  });
  it("rejects R2, unsafe settings, target drift and environment/config overrides", () => {
    for (const unsafe of [
      { ...config, name: "happy-fatun" },
      { ...config, routes: ["example.test/*"] },
      { ...config, unsafe: { bindings: [{ name: "PRODUCT_IMAGES" }] } },
      {
        ...config,
        r2_buckets: [
          { binding: "PRODUCT_IMAGES", bucket_name: "not-permitted" },
        ],
      },
      { ...config, vars: { ...config.vars, ENVIRONMENT: "development" } },
      { ...config, vars: { ...config.vars, PREVIEW_MODE: "false" } },
      { ...config, vars: { ...config.vars, EMAIL_MODE: "resend" } },
      { ...config, workers_dev: false },
      { ...config, env: { live: { vars: { ENVIRONMENT: "production" } } } },
      {
        ...config,
        d1_databases: [
          { ...config.d1_databases[0], database_name: "unreviewed" },
        ],
      },
    ])
      expect(() => validatePreview(unsafe)).toThrow();
    for (const args of [
      ["--env", "live"],
      ["--config", "unsafe.json"],
    ]) {
      const r = spawnSync(
        process.execPath,
        ["scripts/deploy.mjs", "--preview", "--check", ...args],
        { encoding: "utf8", env: { ...process.env, CLOUDFLARE_ENV: "" } },
      );
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/blocked|overrides/i);
    }
  });
});
