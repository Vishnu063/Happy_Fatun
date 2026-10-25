-- Add only missing category names; preserve owner-created categories and every product.
INSERT OR IGNORE INTO categories(id,name) SELECT 'tables','Tables' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)='tables');
INSERT OR IGNORE INTO categories(id,name) SELECT 'cupboards','Cupboards' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)='cupboards');
INSERT OR IGNORE INTO categories(id,name) SELECT 'custom','Custom furniture' WHERE NOT EXISTS (SELECT 1 FROM categories WHERE lower(name)='custom furniture');
