-- Optional overrides; empty values retain shared safe defaults.
ALTER TABLE products ADD COLUMN seo_title TEXT NOT NULL DEFAULT '';
ALTER TABLE products ADD COLUMN seo_description TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN seo_title TEXT NOT NULL DEFAULT '';
ALTER TABLE categories ADD COLUMN seo_description TEXT NOT NULL DEFAULT '';
CREATE TABLE product_image_text (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  alt TEXT NOT NULL,
  PRIMARY KEY(product_id,url)
);
