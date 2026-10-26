import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch: ["preview.spec.ts", "suppliers.spec.ts"],
  // Simulate distinct clients; keep real per-IP production throttles unchanged.
  projects: base.projects?.map((project, index) => ({
    ...project,
    use: {
      ...project.use,
      extraHTTPHeaders: { "CF-Connecting-IP": `192.0.2.${index + 1}` },
    },
  })),
  webServer: {
    command: "node scripts/e2e-server.mjs --no-r2",
    url: "http://127.0.0.1:8790/api/health",
    timeout: 60000,
    reuseExistingServer: false,
  },
});
