import pg from "pg";
import { postgresSQL } from "./sql";
pg.types.setTypeParser(20, (value) => {
  const n = Number(value);
  if (!Number.isSafeInteger(n)) throw new Error("Unsafe database integer");
  return n;
});
export function parseDatabaseURL(value: string) {
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol))
      throw new Error();
    return parsed;
  } catch {
    throw new Error(
      "A valid PostgreSQL DATABASE_URL is required; connection details are redacted",
    );
  }
}
export function databasePool(url: string, ssl = false) {
  const parsed = parseDatabaseURL(url);
  if (
    ["sslmode", "sslcert", "sslkey", "sslrootcert", "uselibpqcompat"].some(
      (key) => parsed.searchParams.has(key),
    )
  )
    throw new Error(
      "Database TLS overrides in connection strings are blocked; use DATABASE_SSL and approved CA trust",
    );
  const pool = new pg.Pool({
    connectionString: url,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 10000,
    ssl: ssl ? { rejectUnauthorized: true } : false,
    options: "-c timezone=UTC",
  });
  pool.on("error", () => console.error("Database pool connection failed"));
  return pool;
}
export class Statement {
  constructor(
    readonly pool: pg.Pool,
    readonly sql: string,
    readonly values: unknown[] = [],
  ) {}
  bind(...values: unknown[]) {
    return new Statement(this.pool, this.sql, values);
  }
  async execute(client: pg.Pool | pg.PoolClient = this.pool) {
    const result = await client.query(postgresSQL(this.sql), this.values);
    return {
      results: result.rows,
      success: true,
      meta: { changes: result.rowCount || 0 },
    };
  }
  async all<T = Record<string, unknown>>() {
    return this.execute() as Promise<{
      results: T[];
      success: boolean;
      meta: { changes: number };
    }>;
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.execute();
    const row = result.results[0];
    return (column ? row?.[column] : row) ?? null;
  }
  async run() {
    return this.execute();
  }
}
export class PostgresDatabase {
  constructor(readonly pool: pg.Pool) {}
  prepare(sql: string) {
    return new Statement(this.pool, sql);
  }
  async batch(statements: Statement[]) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = [];
      for (const statement of statements) {
        if (statement.pool !== this.pool)
          throw new Error("Cross-pool transaction rejected");
        result.push(await statement.execute(client));
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
