-- Reviewed PostgreSQL counterpart; original D1 migration remains unchanged.
CREATE TABLE owner_sessions (id TEXT PRIMARY KEY, expires_at BIGINT NOT NULL);
CREATE INDEX session_expiry ON owner_sessions(expires_at);
