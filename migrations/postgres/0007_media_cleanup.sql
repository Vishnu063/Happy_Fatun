-- Reviewed PostgreSQL counterpart; original D1 migration remains unchanged.
-- Independent of products: deletion must not erase an object cleanup obligation.
CREATE TABLE media_cleanup_queue (
  storage_key TEXT PRIMARY KEY,
  available_at TEXT NOT NULL DEFAULT to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'),
  created_at TEXT NOT NULL DEFAULT to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI:SS'),
  attempts BIGINT NOT NULL DEFAULT 0,
  last_attempt_at TEXT
);
