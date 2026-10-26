import { pathToFileURL } from "node:url";
import { checkManualDeployment } from "../shared/manual-deployment.ts";
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  if (process.argv.length !== 2)
    throw new Error("No deployment guard overrides are supported.");
  await checkManualDeployment();
  console.log(
    "Reviewed event commit and required environment reviewers verified. This check does not approve or deploy anything.",
  );
}
