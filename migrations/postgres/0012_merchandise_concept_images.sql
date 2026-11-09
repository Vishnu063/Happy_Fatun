-- Replace demo placeholders only. Preserve owner-edited galleries and descriptions.

UPDATE products
SET images = '["/assets/merchandise/touchscreen-smartphone.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-phones-02'
  AND status = 'concept'
  AND images = '["/assets/merchandise/phones.svg"]';

UPDATE products
SET images = '["/assets/merchandise/foldable-smartphone.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-phones-09'
  AND status = 'concept'
  AND images = '["/assets/merchandise/phones.svg"]';

UPDATE products
SET images = '["/assets/merchandise/rugged-keypad-phone.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-phones-10'
  AND status = 'concept'
  AND images = '["/assets/merchandise/phones.svg"]';

UPDATE products
SET images = '["/assets/merchandise/retro-running-sneakers.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-shoes-01'
  AND status = 'concept'
  AND images = '["/assets/merchandise/shoes.svg"]';

UPDATE products
SET images = '["/assets/merchandise/navy-wireless-headphones.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-audio-02'
  AND status = 'concept'
  AND images = '["/assets/merchandise/audio.svg"]';

UPDATE products
SET images = '["/assets/merchandise/canvas-hiking-backpack.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-bags-01'
  AND status = 'concept'
  AND images = '["/assets/merchandise/bags.svg"]';

UPDATE products
SET images = '["/assets/merchandise/sage-ceramic-mug.jpg"]',
    description = replace(description, 'Original category illustration only;', 'AI-generated concept image;')
WHERE id = 'demo-kitchen-03'
  AND status = 'concept'
  AND images = '["/assets/merchandise/kitchen.svg"]';
