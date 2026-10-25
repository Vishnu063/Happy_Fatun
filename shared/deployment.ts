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
