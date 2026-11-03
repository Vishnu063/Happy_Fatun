import { defineConfig } from "vitest/config";
export default defineConfig({
  test: { include: ["tests/integration/s3.test.ts"], testTimeout: 20000 },
});
