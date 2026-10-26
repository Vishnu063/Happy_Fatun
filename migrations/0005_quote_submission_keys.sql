ALTER TABLE quotes ADD COLUMN submission_key TEXT;
ALTER TABLE quotes ADD COLUMN request_hash TEXT;
CREATE UNIQUE INDEX quote_submission_key ON quotes(submission_key);
