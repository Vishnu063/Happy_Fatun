-- Reviewed PostgreSQL counterpart; original D1 migration remains unchanged.
ALTER TABLE quotes ADD COLUMN source TEXT NOT NULL DEFAULT 'direct';
ALTER TABLE quotes ADD COLUMN owner_notes TEXT NOT NULL DEFAULT '';
ALTER TABLE quotes ADD COLUMN follow_up_date TEXT;
CREATE INDEX inquiry_followup ON quotes(follow_up_date);
CREATE TABLE business_profile (id BIGINT PRIMARY KEY CHECK(id=1),phone TEXT,email TEXT,whatsapp TEXT,address TEXT,service_area TEXT,summary TEXT);
INSERT INTO business_profile(id) VALUES (1);
