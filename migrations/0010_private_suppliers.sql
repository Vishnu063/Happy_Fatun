-- Private owner-only sourcing data. No shop/contact/cost fixtures are seeded.
CREATE TABLE suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK(length(name) BETWEEN 2 AND 160),
  location TEXT, address TEXT, phone TEXT, notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE product_suppliers (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  supplier_cost INTEGER CHECK(supplier_cost IS NULL OR supplier_cost BETWEEN 0 AND 100000000),
  selling_price INTEGER CHECK(selling_price IS NULL OR selling_price BETWEEN 0 AND 100000000),
  availability TEXT NOT NULL DEFAULT 'unknown' CHECK(availability IN ('unknown','confirm','available','unavailable')),
  lead_time TEXT, notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id,supplier_id)
);
CREATE INDEX supplier_location ON suppliers(location);
CREATE INDEX product_supplier_product ON product_suppliers(product_id,archived);
CREATE INDEX product_supplier_shop ON product_suppliers(supplier_id,archived);
