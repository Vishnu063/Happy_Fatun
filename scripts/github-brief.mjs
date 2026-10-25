import { spawnSync } from "node:child_process";
const repo = "Vishnu063/Happy_Fatun";
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
for (const args of reads) {
  const result = spawnSync("gh", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}
