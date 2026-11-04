import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
const port = Number(process.env.FRONTEND_PORT || 8081);
if (
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  [8080, 8090].includes(port)
)
  throw new Error(
    "Choose a local port between 1024 and 65535; preserve ports 8080 and 8090.",
  );
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
  `POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}\nOWNER_PASSWORD_HASH=${result.stdout.trim()}\nSESSION_SECRET=${randomBytes(32).toString("hex")}\nFRONTEND_PORT=${port}\n`,
  { mode: 0o600, flag: "wx" },
);
console.log(
  "Created ignored .env.lab privately; existing files are never overwritten. Do not commit it.",
);
