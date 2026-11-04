import { describe, it, expect, vi } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ts from "typescript";
import {
  validateManualDispatch,
  preparePreviewTarget,
  validateApprovalEnvironment,
  checkManualDeployment,
  validateSuccessfulCI,
} from "../shared/manual-deployment";
const config = ts.parseConfigFileTextToJson(
  "wrangler.preview.jsonc",
  readFileSync("wrangler.preview.jsonc", "utf8"),
).config;
const account = "a".repeat(32),
  database = "11111111-1111-4111-8111-111111111111",
  sha = "b".repeat(40);
const context = {
  event: "workflow_dispatch",
  repository: "Vishnu063/Happy_Fatun",
  ref: "refs/heads/feat/aws-kubernetes-fullstack",
  sha,
  reviewed: sha,
};
const repository = { private: false, full_name: context.repository };
const environment = {
  name: "cloudflare-preview",
  can_admins_bypass: false,
  deployment_branch_policy: {
    protected_branches: false,
    custom_branch_policies: true,
  },
  protection_rules: [
    {
      type: "required_reviewers",
      prevent_self_review: false,
      reviewers: [{ type: "User", reviewer: { id: 1 } }],
    },
  ],
};
const branchPolicy = {
  total_count: 1,
  branch_policies: [{ name: "feat/aws-kubernetes-fullstack", type: "branch" }],
};
const successfulCI = {
  workflow_runs: [
    {
      head_sha: sha,
      head_branch: "feat/aws-kubernetes-fullstack",
      event: "push",
      status: "completed",
      conclusion: "success",
      path: ".github/workflows/ci.yml",
      repository,
    },
  ],
};
describe("manual no-R2 deployment safety", () => {
  it("accepts only the reviewed immutable event commit on the explicit feature branch", () => {
    expect(() => validateManualDispatch(context)).not.toThrow();
    for (const change of [
      { event: "push" },
      { event: "pull_request" },
      { repository: "fork/Happy_Fatun" },
      { ref: "refs/heads/main" },
      { ref: "refs/heads/feat/furniture-platform" },
      { ref: "refs/tags/feat/aws-kubernetes-fullstack" },
      { sha: "c".repeat(40) },
      { reviewed: "HEAD" },
      { reviewed: "" },
      { reviewed: "$(touch injected)" },
    ])
      expect(() => validateManualDispatch({ ...context, ...change })).toThrow();
  });
  it("requires nonzero real-shaped identifiers and refuses target drift without changing the source template", () => {
    const original = structuredClone(config);
    const prepared = preparePreviewTarget(config, account, database);
    expect(prepared.account_id).toBe(account);
    expect(prepared.d1_databases![0].database_id).toBe(database);
    expect(config).toEqual(original);
    expect(prepared.name).toBe("aaranya-living-preview");
    expect(prepared.r2_buckets).toBeUndefined();
    expect(prepared.vars!.EMAIL_MODE).toBe("disabled");
    for (const pair of [
      [undefined, database],
      [account, undefined],
      ["0".repeat(32), database],
      [account, "00000000-0000-0000-0000-000000000000"],
      ["not-an-account", database],
      [account, "not-a-database"],
    ])
      expect(() => preparePreviewTarget(config, pair[0], pair[1])).toThrow();
    expect(() =>
      preparePreviewTarget(
        { ...prepared, account_id: "c".repeat(32) },
        account,
        database,
      ),
    ).toThrow(/differs/);
    const other = structuredClone(prepared);
    other.d1_databases![0].database_id = "22222222-2222-4222-8222-222222222222";
    expect(() => preparePreviewTarget(other, account, database)).toThrow(
      /differs/,
    );
    for (const unsafe of [
      { name: "another-worker" },
      { r2_buckets: [{}] },
      { vars: { ...config.vars, ENVIRONMENT: "development" } },
      { vars: { ...config.vars, EMAIL_MODE: "resend" } },
    ])
      expect(() =>
        preparePreviewTarget({ ...config, ...unsafe }, account, database),
      ).toThrow();
  });
  it("blocks absent/unprotected reviewers and private visibility rather than silently losing the approval gate", () => {
    expect(() =>
      validateApprovalEnvironment(repository, environment, branchPolicy),
    ).not.toThrow();
    for (const invalid of [
      { name: "wrong", protection_rules: environment.protection_rules },
      { name: "cloudflare-preview" },
      { name: "cloudflare-preview", protection_rules: [] },
      {
        name: "cloudflare-preview",
        protection_rules: [{ type: "wait_timer", reviewers: [1] }],
      },
      {
        name: "cloudflare-preview",
        protection_rules: [{ type: "required_reviewers", reviewers: [] }],
      },
    ])
      expect(() =>
        validateApprovalEnvironment(repository, invalid, branchPolicy),
      ).toThrow(/reviewer/);
    expect(() =>
      validateApprovalEnvironment(
        { ...repository, private: true },
        environment,
        branchPolicy,
      ),
    ).toThrow(/Private Free/);
  });
  it("fails closed on missing GitHub auth, unavailable environment API, or a bad response without leaking a credential", async () => {
    const env = {
      GITHUB_EVENT_NAME: context.event,
      GITHUB_REPOSITORY: context.repository,
      GITHUB_REF: context.ref,
      GITHUB_SHA: sha,
      REVIEWED_COMMIT: sha,
      GH_TOKEN: "isolated-github-read-token",
    };
    const request = vi.fn<typeof fetch>();
    await expect(
      checkManualDeployment({ ...env, GH_TOKEN: "" }, request),
    ).rejects.toThrow(/unavailable/);
    expect(request).not.toHaveBeenCalled();
    request
      .mockResolvedValueOnce(new Response(JSON.stringify(repository)))
      .mockResolvedValueOnce(
        new Response("private token-like failure body", { status: 403 }),
      );
    await expect(checkManualDeployment(env, request)).rejects.toThrow(
      "Cannot verify GitHub approval configuration (HTTP 403); deployment is blocked.",
    );
    request
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(repository)))
      .mockResolvedValueOnce(new Response(JSON.stringify(environment)))
      .mockResolvedValueOnce(new Response(JSON.stringify(branchPolicy)))
      .mockResolvedValueOnce(new Response(JSON.stringify(successfulCI)));
    await expect(checkManualDeployment(env, request)).resolves.toBeUndefined();
    expect(request.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/repos/Vishnu063/Happy_Fatun",
      "https://api.github.com/repos/Vishnu063/Happy_Fatun/environments/cloudflare-preview",
      "https://api.github.com/repos/Vishnu063/Happy_Fatun/environments/cloudflare-preview/deployment-branch-policies?per_page=100",
      `https://api.github.com/repos/Vishnu063/Happy_Fatun/actions/workflows/ci.yml/runs?head_sha=${sha}&event=push&per_page=100`,
    ]);
    expect(request.mock.calls[0][1]?.redirect).toBe("error");
    request
      .mockReset()
      .mockResolvedValueOnce(new Response(JSON.stringify(repository)))
      .mockResolvedValueOnce(new Response("null"))
      .mockResolvedValueOnce(new Response(JSON.stringify(branchPolicy)));
    await expect(checkManualDeployment(env, request)).rejects.toThrow(
      /reviewer/,
    );
  });
  it.each([true, undefined, null, "false", 0])(
    "rejects enabled or malformed administrator bypass (%s)",
    (bypass) => {
      expect(() =>
        validateApprovalEnvironment(
          repository,
          { ...environment, can_admins_bypass: bypass },
          branchPolicy,
        ),
      ).toThrow(/bypass/);
    },
  );
  it.each([
    null,
    undefined,
    [],
    {},
    { protected_branches: true, custom_branch_policies: false },
    { protected_branches: false, custom_branch_policies: "true" },
  ])(
    "rejects absent or malformed selected-branch configuration (%j)",
    (policy) => {
      expect(() =>
        validateApprovalEnvironment(
          repository,
          { ...environment, deployment_branch_policy: policy },
          branchPolicy,
        ),
      ).toThrow(/branch/);
    },
  );
  it.each([
    null,
    undefined,
    {},
    [],
    { total_count: 0, branch_policies: [] },
    { total_count: 2, branch_policies: branchPolicy.branch_policies },
    { total_count: 1, branch_policies: [] },
    { total_count: 1, branch_policies: [null] },
    { total_count: 1, branch_policies: [{ name: "*", type: "branch" }] },
    {
      total_count: 1,
      branch_policies: [{ name: "feat/furniture-platform", type: "branch" }],
    },
    {
      total_count: 1,
      branch_policies: [{ name: "feat/aws-kubernetes-fullstack", type: "tag" }],
    },
    {
      total_count: 1,
      branch_policies: [{ name: "feat/aws-kubernetes-fullstack" }],
    },
    {
      total_count: 2,
      branch_policies: [
        ...branchPolicy.branch_policies,
        { name: "*", type: "tag" },
      ],
    },
  ])(
    "blocks missing, truncated, wildcard, extra or mismatched branch policies (%j)",
    (policies) => {
      expect(() =>
        validateApprovalEnvironment(repository, environment, policies),
      ).toThrow(/branch/);
    },
  );
  it.each([
    [null],
    [1],
    [{}],
    [{ type: "User", reviewer: { id: "1" } }],
    [{ type: "User", reviewer: { id: -1 } }],
    [{ type: "Bot", reviewer: { id: 1 } }],
  ])("rejects malformed reviewer entries (%j)", (reviewers) => {
    expect(() =>
      validateApprovalEnvironment(
        repository,
        {
          ...environment,
          protection_rules: [{ ...environment.protection_rules[0], reviewers }],
        },
        branchPolicy,
      ),
    ).toThrow(/reviewer/);
  });
  it("rejects malformed protection rules even alongside an otherwise valid reviewer rule", () => {
    for (const malformed of [null, [], {}, 1, { type: 42 }])
      expect(() =>
        validateApprovalEnvironment(
          repository,
          {
            ...environment,
            protection_rules: [...environment.protection_rules, malformed],
          },
          branchPolicy,
        ),
      ).toThrow(/reviewer/);
  });
  it("accepts explicit self-review modes and valid teams without treating this metadata check as approval", () => {
    validateApprovalEnvironment(repository, environment, branchPolicy);
    validateApprovalEnvironment(
      repository,
      {
        ...environment,
        protection_rules: [
          {
            type: "required_reviewers",
            prevent_self_review: true,
            reviewers: [{ type: "Team", reviewer: { id: 2 } }],
          },
        ],
      },
      branchPolicy,
    );
    for (const rules of [
      [{ ...environment.protection_rules[0], prevent_self_review: undefined }],
      [...environment.protection_rules, ...environment.protection_rules],
    ])
      expect(() =>
        validateApprovalEnvironment(
          repository,
          { ...environment, protection_rules: rules },
          branchPolicy,
        ),
      ).toThrow(/reviewer/);
  });
  it("requires a successful push CI result for the exact candidate, branch, repository and workflow", () => {
    expect(() => validateSuccessfulCI(successfulCI, sha)).not.toThrow();
    for (const data of [
      null,
      {},
      { workflow_runs: [] },
      { workflow_runs: [null] },
    ])
      expect(() => validateSuccessfulCI(data, sha)).toThrow(/CI/);
    for (const change of [
      { head_sha: "c".repeat(40) },
      { head_branch: "main" },
      { event: "pull_request" },
      { status: "in_progress" },
      { conclusion: "failure" },
      { conclusion: "skipped" },
      { path: "other.yml" },
      { repository: { full_name: "fork/Happy_Fatun" } },
    ])
      expect(() =>
        validateSuccessfulCI(
          { workflow_runs: [{ ...successfulCI.workflow_runs[0], ...change }] },
          sha,
        ),
      ).toThrow(/CI/);
  });
  it("blocks policy/CI API denial and network/malformed responses; no fallback to old branch or prior CI", async () => {
    const env = {
      GITHUB_EVENT_NAME: context.event,
      GITHUB_REPOSITORY: context.repository,
      GITHUB_REF: context.ref,
      GITHUB_SHA: sha,
      REVIEWED_COMMIT: sha,
      GH_TOKEN: "isolated-read-token",
    };
    for (const failedStage of [2, 3]) {
      const data = [repository, environment, branchPolicy, successfulCI];
      const request = vi.fn<typeof fetch>();
      for (let i = 0; i <= failedStage; i++)
        request.mockResolvedValueOnce(
          i === failedStage
            ? new Response("Do not log provider response", { status: 403 })
            : new Response(JSON.stringify(data[i])),
        );
      await expect(checkManualDeployment(env, request)).rejects.toThrow(
        /HTTP 403/,
      );
    }
    const invalid = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify(repository)))
      .mockResolvedValueOnce(new Response(JSON.stringify(environment)))
      .mockResolvedValueOnce(
        new Response("not-json isolated-sensitive-response"),
      );
    await expect(checkManualDeployment(env, invalid)).rejects.toThrow(
      "Cannot verify GitHub approval configuration: malformed JSON; deployment is blocked.",
    );
    const network = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("isolated-sensitive-network-credential"));
    await expect(checkManualDeployment(env, network)).rejects.toThrow(
      /unavailable/,
    );
  });
  it("prepares a disposable checkout config without exposing a token or modifying the source target", () => {
    const temp = mkdtempSync(join(tmpdir(), "aaranya-target-test-"));
    const file = join(temp, "wrangler.preview.jsonc");
    const original = readFileSync("wrangler.preview.jsonc", "utf8");
    try {
      writeFileSync(file, original);
      const script = resolve("scripts/prepare-preview-target.mjs");
      const env = {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: account,
        CLOUDFLARE_D1_DATABASE_ID: database,
        CLOUDFLARE_API_TOKEN: "isolated-token-never-for-Cloudflare",
      };
      const success = spawnSync(process.execPath, [script], {
        cwd: temp,
        env,
        encoding: "utf8",
      });
      expect(success.status).toBe(0);
      expect(success.stdout + success.stderr).not.toContain(
        env.CLOUDFLARE_API_TOKEN,
      );
      const result = JSON.parse(readFileSync(file, "utf8"));
      expect(result.account_id).toBe(account);
      expect(result.d1_databases[0].database_id).toBe(database);
      expect(readFileSync("wrangler.preview.jsonc", "utf8")).toBe(original);
      const guard = resolve("scripts/deploy.mjs");
      const checked = spawnSync(
        process.execPath,
        [guard, "--preview", "--check"],
        { cwd: temp, env, encoding: "utf8" },
      );
      expect(checked.status).toBe(0);
      for (const drift of [
        { CLOUDFLARE_ACCOUNT_ID: "c".repeat(32) },
        { CLOUDFLARE_D1_DATABASE_ID: "22222222-2222-4222-8222-222222222222" },
      ]) {
        const blocked = spawnSync(
          process.execPath,
          [guard, "--preview", "--check"],
          { cwd: temp, env: { ...env, ...drift }, encoding: "utf8" },
        );
        expect(blocked.status).not.toBe(0);
        expect(blocked.stderr).toContain("differs from the reviewed config");
        expect(blocked.stderr).not.toContain(env.CLOUDFLARE_API_TOKEN);
      }
      writeFileSync(file, original);
      const fail = spawnSync(process.execPath, [script], {
        cwd: temp,
        env: { ...env, CLOUDFLARE_D1_DATABASE_ID: "" },
        encoding: "utf8",
      });
      expect(fail.status).not.toBe(0);
      expect(readFileSync(file, "utf8")).toBe(original);
      expect(fail.stdout + fail.stderr).not.toContain(env.CLOUDFLARE_API_TOKEN);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
  it("keeps publishing separate from verification, migrations, arbitrary refs and credential-bearing steps", () => {
    const workflow = readFileSync(
      ".github/workflows/cloudflare-preview.yml",
      "utf8",
    );
    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).not.toMatch(
      /^\s+(push|pull_request|pull_request_target|workflow_run|schedule):/m,
    );
    expect(
      workflow.match(
        /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/g,
      ),
    ).toHaveLength(1);
    const verification = workflow.split("  deploy:")[0];
    expect(verification).not.toContain("secrets.");
    expect(workflow).toContain("needs: verify");
    expect(
      workflow.match(
        /if: github.repository == 'Vishnu063\/Happy_Fatun' && github.ref == 'refs\/heads\/feat\/aws-kubernetes-fullstack'/g,
      ),
    ).toHaveLength(2);
    expect(workflow).not.toContain("refs/heads/feat/furniture-platform");
    expect(
      workflow.match(/run: node scripts\/check-manual-deployment.mjs/g),
    ).toHaveLength(2);
    const publish = workflow.slice(
      workflow.indexOf("      - name: Publish approved preview"),
    );
    expect(publish).toMatch(
      /set -euo pipefail\s+node scripts\/check-manual-deployment.mjs/,
    );
    expect(
      publish.indexOf("node scripts/check-manual-deployment.mjs"),
    ).toBeLessThan(publish.indexOf("node scripts/deploy.mjs --preview"));
    expect(publish).toContain("GH_TOKEN: ${{ github.token }}");
    expect(publish).toContain("REVIEWED_COMMIT: ${{ inputs.reviewed_commit }}");
    expect(publish).not.toMatch(/continue-on-error|always\(\)|if:|\|\| true/);
    expect(workflow).toContain("name: cloudflare-preview");
    expect(workflow.match(/ref: \$\{\{ github.sha \}\}/g)).toHaveLength(2);
    expect(workflow).not.toMatch(
      /--remote|migrations apply|secret put|wrangler-action|pull_request_target|secrets: inherit/,
    );
    for (const action of workflow.matchAll(/uses: (.+)/g))
      expect(action[1]).toMatch(/@[a-f0-9]{40}(?:\s|$)/);
  });
});
