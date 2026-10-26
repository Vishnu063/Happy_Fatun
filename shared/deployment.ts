export type DeploymentConfig = {
  vars?: Record<string, unknown>;
  env?: Record<string, { vars?: Record<string, unknown> }>;
};
export function validateDeployment(
  config: DeploymentConfig,
  args: string[] = [],
) {
  let name: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--dry-run") continue;
    let selected: string | undefined;
    if (arg === "--env" || arg === "-e") selected = args[++i];
    else if (arg.startsWith("--env=")) selected = arg.slice(6);
    else
      throw new Error(
        "Deployment argument blocked. Only --dry-run and one explicit --env/-e selection are supported; configure other options in reviewed Wrangler configuration.",
      );
    if (!selected || selected.startsWith("-") || name !== undefined)
      throw new Error("Select exactly one nonempty deployment environment.");
    name = selected;
  }
  const vars = name
    ? Object.hasOwn(config.env || {}, name)
      ? config.env![name].vars
      : undefined
    : config.vars;
  if (vars?.ENVIRONMENT !== "production")
    throw new Error(
      "Deployment blocked: the selected environment must explicitly set ENVIRONMENT=production.",
    );
}

export type PreviewConfig = DeploymentConfig & {
  name?: string;
  routes?: unknown[];
  route?: unknown;
  unsafe?: unknown;
  account_id?: string;
  workers_dev?: boolean;
  r2_buckets?: unknown[];
  d1_databases?: {
    binding?: string;
    database_name?: string;
    database_id?: string;
    migrations_dir?: string;
  }[];
};
export function validatePreview(config: PreviewConfig, publishing = false) {
  validateDeployment(config);
  if (
    config.name !== "aaranya-living-preview" ||
    config.route ||
    config.routes?.length ||
    config.unsafe
  )
    throw new Error(
      "Preview must use its reviewed worker name without custom routes or unsafe bindings.",
    );
  if (config.r2_buckets?.length || Object.keys(config.env || {}).length)
    throw new Error("Preview must have no R2 binding or named environments.");
  if (
    config.workers_dev !== true ||
    config.vars?.PREVIEW_MODE !== "true" ||
    config.vars?.EMAIL_MODE !== "disabled"
  )
    throw new Error(
      "Preview requires workers.dev, PREVIEW_MODE=true and disabled email.",
    );
  const databases = config.d1_databases || [];
  if (
    databases.length !== 1 ||
    databases[0].binding !== "DB" ||
    databases[0].database_name !== "happy-fatun" ||
    databases[0].migrations_dir !== "migrations"
  )
    throw new Error(
      "Preview must bind only the reviewed happy-fatun database as DB.",
    );
  if (
    publishing &&
    (!/^[a-f0-9]{32}$/i.test(config.account_id || "") ||
      /^0+$/.test(config.account_id!) ||
      !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(
        databases[0].database_id || "",
      ) ||
      /^0{8}-(?:0{4}-){3}0{12}$/.test(databases[0].database_id!))
  )
    throw new Error(
      "Preview publication blocked: set the owner-reviewed non-secret account_id and existing D1 database_id first.",
    );
}

/** Wrangler's inherited target selectors must never override the reviewed config. */
export function validatePreviewTargetEnvironment(
  config: PreviewConfig,
  account?: string,
  database?: string,
) {
  if (
    (account !== undefined && account !== config.account_id) ||
    (database !== undefined &&
      database !== config.d1_databases?.[0].database_id)
  )
    throw new Error(
      "Preview deployment blocked: inherited account/database differs from the reviewed config.",
    );
}
