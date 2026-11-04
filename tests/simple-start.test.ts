import { it, expect } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readFileSync,
  existsSync,
  statSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pbkdf2Sync } from "node:crypto";
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "simple-website-"));
  mkdirSync(join(dir, "scripts"));
  for (const file of ["start-website.sh", "init-lab-env.mjs", "owner-hash.mjs"])
    copyFileSync("scripts/" + file, join(dir, "scripts", file));
  return {
    dir,
    run: (args: string[], password = "isolated-start-owner-password") =>
      spawnSync(
        "bash",
        [join(dir, "scripts/start-website.sh"), "--setup-only", ...args],
        { input: password + "\n", encoding: "utf8" },
      ),
    close: () => rmSync(dir, { recursive: true, force: true }),
  };
}
it("creates private salted configuration at the requested port, never logs the password, and preserves it on repeat", () => {
  const f = fixture();
  try {
    const password = "  isolated-start-owner-password  ",
      first = f.run(["--port", "18081"], password);
    expect(first.status).toBe(0);
    expect(first.stdout + first.stderr).not.toContain(password);
    const file = join(f.dir, ".env.lab"),
      before = readFileSync(file, "utf8");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(before).toContain("FRONTEND_PORT=18081\n");
    expect(before).not.toContain(password);
    const hash = before.match(/^OWNER_PASSWORD_HASH=([^\n]+)$/m)![1],
      [salt, digest] = hash.split(":");
    expect(
      pbkdf2Sync(password, salt, 210000, 32, "sha256").toString("hex"),
    ).toBe(digest);
    const second = f.run([], "different-password-do-not-use");
    expect(second.status).toBe(0);
    expect(readFileSync(file, "utf8")).toBe(before);
  } finally {
    f.close();
  }
});
it.each(["8080", "8090", "0", "70000", "1234;echo BAD"])(
  "rejects unsafe/reserved port %s before writing configuration",
  (port) => {
    const f = fixture();
    try {
      const r = f.run(["--port", port]);
      expect(r.status).not.toBe(0);
      expect(existsSync(join(f.dir, ".env.lab"))).toBe(false);
    } finally {
      f.close();
    }
  },
);
it("rejects short passwords without leaving a configuration file", () => {
  const f = fixture();
  try {
    const r = f.run([], "short");
    expect(r.status).not.toBe(0);
    expect(existsSync(join(f.dir, ".env.lab"))).toBe(false);
    expect(r.stdout + r.stderr).not.toContain("short");
  } finally {
    f.close();
  }
});
