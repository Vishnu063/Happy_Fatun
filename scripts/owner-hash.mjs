import { randomBytes, pbkdf2Sync } from "node:crypto";
// Password is read from stdin, never from command arguments or a tracked file.
let value = "";
for await (const part of process.stdin) value += part;
const password = value.replace(/\r?\n$/, "");
if (password.length < 14 || password.length > 256)
  throw new Error("Use a unique password of 14–256 characters.");
const salt = randomBytes(16).toString("hex");
console.log(
  `${salt}:${pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex")}`,
);
