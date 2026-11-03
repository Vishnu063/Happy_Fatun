import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const password = readFileSync(0, "utf8").trim();
const result = spawnSync(process.execPath, ["scripts/owner-hash.mjs"], {
  input: password,
  encoding: "utf8",
});
if (result.status !== 0)
  throw new Error(
    "Provide a unique local owner password of 14–256 characters via stdin; it is never written to the env file",
  );
writeFileSync(
  ".env.lab",
  `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nOWNER_PASSWORD_HASH=${result.stdout.trim()}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nFRONTEND_PORT=8081\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created ignored .env.lab privately; existing files are never overwritten. Do not commit it.",
);
