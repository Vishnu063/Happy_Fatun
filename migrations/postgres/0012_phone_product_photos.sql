-- Reviewed PostgreSQL counterpart; original D1 migration remains unchanged.
-- Link approved local phone images to their demo listings.
-- Only replace the original category placeholder; preserve owner-edited galleries.
UPDATE products SET images = '["/assets/merchandise/touchscreen-smartphone.jpg"]'
WHERE id = 'demo-phones-02' AND images = '["/assets/merchandise/phones.svg"]';
UPDATE products SET images = '["/assets/merchandise/foldable-smartphone.jpg"]'
WHERE id = 'demo-phones-09' AND images = '["/assets/merchandise/phones.svg"]';
UPDATE products SET images = '["/assets/merchandise/rugged-keypad-phone.jpg"]'
WHERE id = 'demo-phones-10' AND images = '["/assets/merchandise/phones.svg"]';
