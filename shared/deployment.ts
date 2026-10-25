export type DeploymentConfig = {
  vars?: Record<string, unknown>;
  env?: Record<string, { vars?: Record<string, unknown> }>;
};
export function validateDeployment(
  config: DeploymentConfig,
  args: string[] = [],
) {
  if (
    args.some(
      (arg) =>
        /^--(?:var|config)(?:=|$)/.test(arg) || ["-c", "-v"].includes(arg),
    )
  )
    throw new Error(
      "Configure production variables in the reviewed Wrangler configuration; CLI variable/config overrides are not accepted.",
    );
  const envArg = args.find((arg) => arg.startsWith("--env="));
  const index = args.findIndex((arg) => arg === "--env" || arg === "-e");
  const name = envArg?.slice(6) || (index >= 0 ? args[index + 1] : undefined);
  if (index >= 0 && !name) throw new Error("An environment name is required.");
  const vars = name ? config.env?.[name]?.vars : config.vars;
  if (vars?.ENVIRONMENT !== "production")
    throw new Error(
      "Deployment blocked: the selected environment must explicitly set ENVIRONMENT=production.",
    );
}
