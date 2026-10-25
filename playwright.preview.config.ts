import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: "preview.spec.ts",
  webServer: {
    command: "node scripts/e2e-server.mjs --no-r2",
    url: "http://127.0.0.1:8790/api/health",
    timeout: 60000,
    reuseExistingServer: false,
  },
});
