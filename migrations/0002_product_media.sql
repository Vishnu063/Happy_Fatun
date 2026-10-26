CREATE TABLE media_objects (
 id TEXT PRIMARY KEY,
 product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
 storage_key TEXT NOT NULL UNIQUE,
 content_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL,
 alt TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('illustrative','photo')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX media_product ON media_objects(product_id);
