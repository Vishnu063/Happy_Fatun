-- Independent of products: deletion must not erase an object cleanup obligation.
CREATE TABLE media_cleanup_queue (
  storage_key TEXT PRIMARY KEY,
  available_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TEXT
);
