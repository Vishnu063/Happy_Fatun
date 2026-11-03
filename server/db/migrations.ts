import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type pg from "pg";
export async function migrationCatalog(directory = "migrations/postgres") {
  const files = (await readdir(directory))
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort();
  if (!files.length) throw new Error("No reviewed PostgreSQL migrations found");
  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(`${directory}/${name}`, "utf8");
      return {
        name,
        sql,
        checksum: createHash("sha256").update(sql).digest("hex"),
      };
    }),
  );
}
export async function migrate(
  pool: pg.Pool,
  directory = "migrations/postgres",
) {
  const catalog = await migrationCatalog(directory),
    files = catalog.map((m) => m.name);
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(583291,1)");
    const history = await client.query(
      "SELECT to_regclass('schema_migrations') AS history,to_regclass('products') AS products",
    );
    if (!history.rows[0].history && history.rows[0].products)
      throw new Error(
        "Existing schema has no migration history; reconcile without reseeding",
      );
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
    );
    const applied = await client.query(
      "SELECT name,checksum FROM schema_migrations",
    );
    if (applied.rows.some((r) => !files.includes(r.name)))
      throw new Error("Database has unknown migration history");
    let count = 0;
    for (const { name, sql, checksum } of catalog) {
      const previous = applied.rows.find((r) => r.name === name);
      if (previous) {
        if (previous.checksum !== checksum)
          throw new Error("Applied migration checksum mismatch");
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [name, checksum],
        );
        await client.query("COMMIT");
        count++;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    return count;
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(583291,1)");
    } finally {
      client.release();
    }
  }
}
