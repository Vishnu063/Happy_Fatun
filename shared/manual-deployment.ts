import { validatePreview, type PreviewConfig } from "./deployment.ts";
export const deploymentRepository = "Vishnu063/Happy_Fatun";
export const deploymentBranch = "refs/heads/feat/furniture-platform";
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
      "Manual deployment requires this repository, feat/furniture-platform, and its exact reviewed 40-character event commit; no branch/tag/main fallback is allowed.",
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
export function validateApprovalEnvironment(
  repositoryData: unknown,
  environmentData: unknown,
) {
  const repository = repositoryData as {
    private?: boolean;
    full_name?: string;
  } | null;
  const environment = environmentData as {
    name?: string;
    protection_rules?: { type?: string; reviewers?: unknown[] }[];
  } | null;
  if (
    repository?.private !== false ||
    repository.full_name !== deploymentRepository
  )
    throw new Error(
      "This free preview workflow requires the reviewed public repository; stop if visibility or plan changes. Private Free repositories cannot enforce required environment reviewers.",
    );
  if (
    environment?.name !== deploymentEnvironment ||
    !Array.isArray(environment?.protection_rules) ||
    !environment.protection_rules.some(
      (rule) =>
        rule?.type === "required_reviewers" &&
        Array.isArray(rule.reviewers) &&
        rule.reviewers.length > 0,
    )
  )
    throw new Error(
      "Configure cloudflare-preview with at least one required reviewer before dispatch; an unprotected environment is not an approval gate.",
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
    const response = await request(
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
    if (!response.ok)
      throw new Error(
        `Cannot verify GitHub approval configuration (HTTP ${response.status}); deployment is blocked.`,
      );
    return response.json();
  };
  const repository = await get("");
  const environment = await get(`/environments/${deploymentEnvironment}`);
  validateApprovalEnvironment(repository, environment);
}
