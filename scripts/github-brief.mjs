import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
const repo = "Vishnu063/Happy_Fatun";
const changes = process.argv.includes("--changes");
const cachePath = join(
  tmpdir(),
  `aaranya-brief-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 12)}.json`,
);
let previous = {};
try {
  previous = JSON.parse(readFileSync(cachePath, "utf8"));
} catch {
  /* Missing/invalid cache always prints the full brief. */
}
const reads = [
  [
    "issue",
    "view",
    "1",
    "--repo",
    repo,
    "--json",
    "number,title,body,comments,state,updatedAt",
  ],
  [
    "issue",
    "list",
    "--repo",
    repo,
    "--state",
    "all",
    "--limit",
    "100",
    "--json",
    "number,title,state,updatedAt",
  ],
  [
    "pr",
    "view",
    "2",
    "--repo",
    repo,
    "--json",
    "number,title,body,state,comments,reviews,headRefName,baseRefName,headRefOid,statusCheckRollup",
  ],
  ["api", `repos/${repo}/pulls/2/comments`, "--paginate"],
];
const next = {};
for (const args of reads) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "GitHub read failed.");
    process.exit(result.status ?? 1);
  }
  const output = result.stdout.trim();
  let instructions = output;
  if (args[0] === "pr") {
    const { statusCheckRollup, ...content } = JSON.parse(output);
    instructions = JSON.stringify(content);
    console.log(
      JSON.stringify({
        head: content.headRefOid,
        state: content.state,
        checks: statusCheckRollup.map((check) => ({
          name: check.name,
          status: check.status,
          conclusion: check.conclusion,
        })),
      }),
    );
  }
  const key = args.join(" ");
  if (changes && previous[key] === instructions)
    console.log(`Unchanged instructions: ${args.slice(0, 3).join(" ")}`);
  else console.log(output);
  next[key] = instructions;
}
writeFileSync(cachePath, JSON.stringify(next), { mode: 0o600 });
