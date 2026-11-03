/** Deliberately bounded SQLite compatibility for the existing, trusted application SQL. */
export function splitSQL(source: string): string[] {
  const statements: string[] = [];
  let quote = "",
    comment = false,
    block = false,
    start = 0;
  for (let i = 0; i < source.length; i++) {
    const c = source[i],
      n = source[i + 1];
    if (comment) {
      if (c === "\n") comment = false;
      continue;
    }
    if (block) {
      if (c === "*" && n === "/") {
        block = false;
        i++;
      }
      continue;
    }
    if (quote) {
      if (c === quote) {
        if (n === quote) i++;
        else quote = "";
      }
      continue;
    }
    if (c === "-" && n === "-") {
      comment = true;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      block = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      continue;
    }
    if (c === ";") {
      if (source.slice(start, i).trim())
        statements.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote || block) throw new Error("Unterminated SQL literal/comment");
  if (source.slice(start).trim()) statements.push(source.slice(start).trim());
  return statements;
}
export function postgresSQL(source: string): string {
  let sql = source.trim().replace(/;\s*$/, "");
  if (/\bPRAGMA\b/i.test(sql))
    throw new Error("SQLite PRAGMA is not executable on PostgreSQL");
  sql = sql.replace(
    /datetime\('now','([+-]\d+) minutes'\)/g,
    (_, minutes: string) =>
      `to_char(statement_timestamp() AT TIME ZONE 'UTC' + interval '${minutes} minutes','YYYY-MM-DD HH24:MI:SS')`,
  );
  sql = sql.replace(
    /\bCURRENT_TIMESTAMP\b/g,
    "to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS')",
  );
  sql = sql.replace(
    /json_set\(configuration,'\$\.notes',''\)/g,
    "jsonb_set(configuration::jsonb,'{notes}',to_jsonb(''::text))::text",
  );
  sql = sql.replace(
    /json_each\(([\w.]+)\)\s+j\b/g,
    "jsonb_array_elements_text($1::jsonb) WITH ORDINALITY AS j(value,ordinality)",
  );
  sql = sql.replace(
    /,\s*(jsonb_array_elements_text\()/g,
    " CROSS JOIN LATERAL $1",
  );
  sql = sql
    .replace(/json_each\(([\w.]+)\)/g, "jsonb_array_elements_text($1::jsonb)")
    .replace(/\bj\.key\b/g, "(j.ordinality-1)");
  if (/\bINSERT OR IGNORE\b/i.test(sql)) {
    sql = sql.replace(/\bINSERT OR IGNORE\b/i, "INSERT");
    sql += " ON CONFLICT DO NOTHING";
  }
  if (/INSERT INTO rate_limits/i.test(sql))
    sql = sql
      .replace(/WHEN expires_at/g, "WHEN rate_limits.expires_at")
      .replace(/ELSE count\+1/g, "ELSE rate_limits.count+1")
      .replace(/ELSE expires_at/g, "ELSE rate_limits.expires_at");
  let result = "",
    quote = "",
    comment = false,
    block = false,
    index = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i],
      n = sql[i + 1];
    if (comment) {
      result += c;
      if (c === "\n") comment = false;
      continue;
    }
    if (block) {
      result += c;
      if (c === "*" && n === "/") {
        result += n;
        i++;
        block = false;
      }
      continue;
    }
    if (quote) {
      result += c;
      if (c === quote) {
        if (n === quote) {
          result += n;
          i++;
        } else quote = "";
      }
      continue;
    }
    if (c === "-" && n === "-") {
      comment = true;
      result += c + n;
      i++;
      continue;
    }
    if (c === "/" && n === "*") {
      block = true;
      result += c + n;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      result += c;
      continue;
    }
    const comparison =
      i === 0 || !/[\w]/.test(sql[i - 1])
        ? sql.slice(i).match(/^IS(\s+NOT)?\s+\?/i)
        : null;
    if (comparison) {
      result +=
        (comparison[1] ? "IS DISTINCT FROM " : "IS NOT DISTINCT FROM ") +
        `$${++index}`;
      i += comparison[0].length - 1;
      continue;
    }
    result += c === "?" ? `$${++index}` : c;
  }
  if (quote || block) throw new Error("Unterminated SQL literal/comment");
  return result;
}
