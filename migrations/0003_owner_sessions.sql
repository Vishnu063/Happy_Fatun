CREATE TABLE owner_sessions (id TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE INDEX session_expiry ON owner_sessions(expires_at);
