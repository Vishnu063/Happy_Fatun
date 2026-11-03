-- Reviewed PostgreSQL counterpart; original D1 migration remains unchanged.
-- Add only missing category names; preserve owner-created categories and every product.
INSERT INTO categories(id,name) SELECT 'tables','Tables' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)='tables') ON CONFLICT DO NOTHING;
INSERT INTO categories(id,name) SELECT 'cupboards','Cupboards' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)='cupboards') ON CONFLICT DO NOTHING;
INSERT INTO categories(id,name) SELECT 'custom','Custom furniture' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)='custom furniture') ON CONFLICT DO NOTHING;
