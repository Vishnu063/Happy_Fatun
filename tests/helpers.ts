import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
class Statement {
  constructor(
    private db: DatabaseSync,
    private sql: string,
    private args: unknown[] = [],
  ) {}
  bind(...args: unknown[]) {
    return new Statement(this.db, this.sql, args);
  }
  async first() {
    return this.db.prepare(this.sql).get(...(this.args as [])) ?? null;
  }
  async all() {
    return {
      results: this.db.prepare(this.sql).all(...(this.args as [])),
      success: true,
    };
  }
  async run() {
    return this.db.prepare(this.sql).run(...(this.args as []));
  }
}
export class Database {
  db = new DatabaseSync(":memory:");
  constructor() {
    for (const file of readdirSync("migrations")
      .filter((f) => f.endsWith(".sql"))
      .sort())
      this.db.exec(readFileSync(`migrations/${file}`, "utf8"));
  }
  prepare(sql: string) {
    return new Statement(this.db, sql);
  }
  async batch(statements: Statement[]) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
