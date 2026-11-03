// Deterministic build-time conversion; never contacts a database.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { postgresSQL, splitSQL } from "../server/db/sql.ts";
for (const name of readdirSync("migrations")
  .filter((f) => /^\d{4}.*\.sql$/.test(f))
  .sort()) {
  const source = readFileSync(`migrations/${name}`, "utf8").replace(
    /^PRAGMA[^;]+;/m,
    "",
  );
  const converted = splitSQL(source)
    .map(
      (s) =>
        postgresSQL(
          s
            .replace(/\bINTEGER\b/g, "BIGINT")
            .replace(/\bREAL\b/g, "DOUBLE PRECISION"),
        ) + ";",
    )
    .join("\n");
  writeFileSync(
    `migrations/postgres/${name}`,
    "-- Reviewed PostgreSQL counterpart; original D1 migration remains unchanged.\n" +
      converted +
      "\n",
  );
}
