import { databasePool, parseDatabaseURL } from "./db/postgres";
import { migrate } from "./db/migrations";
if (process.argv.slice(2).join(" ") !== "--apply")
  throw new Error(
    "Explicit --apply is required; startup never migrates automatically",
  );
const url = process.env.DATABASE_URL || "",
  host = parseDatabaseURL(url).hostname;
if (
  !["localhost", "127.0.0.1", "[::1]", "postgres"].includes(host) &&
  process.env.ALLOW_REMOTE_MIGRATIONS !== "true"
)
  throw new Error(
    "Remote migration requires separate explicit ALLOW_REMOTE_MIGRATIONS=true authorization",
  );
const pool = databasePool(url, process.env.DATABASE_SSL === "true");
try {
  console.log(`Applied ${await migrate(pool)} forward migrations`);
} catch {
  console.error(
    "Migration failed; inspect schema/history privately. No reset was performed.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
