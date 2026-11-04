import { validatePreview, type PreviewConfig } from "./deployment.ts";
export const deploymentRepository = "Vishnu063/Happy_Fatun";
export const deploymentBranch = "refs/heads/feat/aws-kubernetes-fullstack";
export const deploymentEnvironment = "cloudflare-preview";
export function validateManualDispatch(context: {
  event?: string;
  repository?: string;
  ref?: string;
  sha?: string;
  reviewed?: string;
}) {
  if (
    context.event !== "workflow_dispatch" ||
    context.repository !== deploymentRepository ||
    context.ref !== deploymentBranch ||
    !/^[a-f0-9]{40}$/.test(context.reviewed || "") ||
    context.reviewed !== context.sha
  )
    throw new Error(
      "Manual deployment requires this repository, feat/aws-kubernetes-fullstack, and its exact reviewed 40-character event commit; no branch/tag/main fallback is allowed.",
    );
}
export function preparePreviewTarget(
  config: PreviewConfig,
  account?: string,
  database?: string,
) {
  validatePreview(config);
  const prepared = structuredClone(config);
  prepared.account_id = account;
  prepared.d1_databases![0].database_id = database;
  validatePreview(prepared, true);
  if (
    (config.account_id !== "00000000000000000000000000000000" &&
      config.account_id !== account) ||
    (config.d1_databases![0].database_id !==
      "00000000-0000-0000-0000-000000000000" &&
      config.d1_databases![0].database_id !== database)
  )
    throw new Error(
      "Configured account/database differs from reviewed GitHub variables.",
    );
  return prepared;
}
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

export function validateApprovalEnvironment(
  repositoryData: unknown,
  environmentData: unknown,
  branchPolicyData: unknown,
) {
  const repository = record(repositoryData),
    environment = record(environmentData);
  if (
    repository?.private !== false ||
    repository.full_name !== deploymentRepository
  )
    throw new Error(
      "This free preview workflow requires the reviewed public repository; Private Free repositories cannot enforce required environment reviewers.",
    );
  const rules = environment?.protection_rules;
  const reviewers = Array.isArray(rules)
    ? rules.filter((rule) => record(rule)?.type === "required_reviewers")
    : [];
  const rule = reviewers.length === 1 ? record(reviewers[0]) : null;
  const entries = rule?.reviewers;
  if (
    environment?.name !== deploymentEnvironment ||
    !Array.isArray(rules) ||
    !rules.every(
      (value) =>
        typeof record(value)?.type === "string" &&
        String(record(value)?.type).length > 0,
    ) ||
    !Array.isArray(entries) ||
    entries.length < 1 ||
    entries.length > 6 ||
    typeof rule?.prevent_self_review !== "boolean" ||
    !entries.every((entry) => {
      const item = record(entry),
        reviewer = record(item?.reviewer);
      return (
        (item?.type === "User" || item?.type === "Team") &&
        Number.isSafeInteger(reviewer?.id) &&
        Number(reviewer?.id) > 0
      );
    })
  )
    throw new Error(
      "Approval requires one well-formed required-reviewers rule with valid User/Team reviewers and an explicit self-review setting.",
    );
  if (environment?.can_admins_bypass !== false)
    throw new Error(
      "Approval requires administrator bypass explicitly disabled.",
    );
  const policy = record(environment?.deployment_branch_policy);
  const branches = record(branchPolicyData),
    items = branches?.branch_policies;
  if (
    policy?.protected_branches !== false ||
    policy.custom_branch_policies !== true ||
    branches?.total_count !== 1 ||
    !Array.isArray(items) ||
    items.length !== 1 ||
    record(items[0])?.name !== deploymentBranch.slice("refs/heads/".length) ||
    record(items[0])?.type !== "branch"
  )
    throw new Error(
      "Approval requires exactly the intended preview branch; missing, wildcard, tag or additional deployment policies are blocked.",
    );
}

export function validateSuccessfulCI(data: unknown, sha: string) {
  const runs = record(data)?.workflow_runs;
  if (
    !Array.isArray(runs) ||
    !runs.some((value) => {
      const run = record(value);
      return (
        run?.head_sha === sha &&
        run.head_branch === deploymentBranch.slice("refs/heads/".length) &&
        run.event === "push" &&
        run.status === "completed" &&
        run.conclusion === "success" &&
        run.path === ".github/workflows/ci.yml" &&
        record(run.repository)?.full_name === deploymentRepository
      );
    })
  )
    throw new Error(
      "The exact candidate commit must have a successful completed push CI run for the intended branch before preview deployment.",
    );
}

export async function checkManualDeployment(
  env: Record<string, string | undefined> = process.env,
  request: typeof fetch = fetch,
) {
  validateManualDispatch({
    event: env.GITHUB_EVENT_NAME,
    repository: env.GITHUB_REPOSITORY,
    ref: env.GITHUB_REF,
    sha: env.GITHUB_SHA,
    reviewed: env.REVIEWED_COMMIT,
  });
  if (!env.GH_TOKEN)
    throw new Error(
      "GitHub read token is unavailable; approval configuration cannot be verified.",
    );
  const get = async (path: string) => {
    let response: Response;
    try {
      response = await request(
        `https://api.github.com/repos/${deploymentRepository}${path}`,
        {
          headers: {
            Authorization: `Bearer ${env.GH_TOKEN}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          redirect: "error",
        },
      );
    } catch {
      throw new Error(
        "Cannot verify GitHub approval configuration: network unavailable; deployment is blocked.",
      );
    }
    if (!response.ok)
      throw new Error(
        `Cannot verify GitHub approval configuration (HTTP ${response.status}); deployment is blocked.`,
      );
    try {
      return await response.json();
    } catch {
      throw new Error(
        "Cannot verify GitHub approval configuration: malformed JSON; deployment is blocked.",
      );
    }
  };
  const repository = await get("");
  const environment = await get(`/environments/${deploymentEnvironment}`);
  const policy = await get(
    `/environments/${deploymentEnvironment}/deployment-branch-policies?per_page=100`,
  );
  validateApprovalEnvironment(repository, environment, policy);
  const runs = await get(
    `/actions/workflows/ci.yml/runs?head_sha=${env.GITHUB_SHA}&event=push&per_page=100`,
  );
  validateSuccessfulCI(runs, env.GITHUB_SHA!);
}
