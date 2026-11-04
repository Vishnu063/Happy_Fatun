// Generates additive reviewed SQL and original vector placeholders; never contacts a DB.
import { writeFileSync, mkdirSync } from "node:fs";
import { merchandiseCategories } from "../shared/merchandise.ts";
const names = {
  shoes: [
    "Everyday sneakers",
    "Walking shoes",
    "Canvas low-tops",
    "Slip-on shoes",
    "Trail shoes",
    "Training shoes",
    "Formal lace-ups",
    "Loafers",
    "Casual sandals",
    "Ankle boots",
  ],
  phones: [
    "Compact smartphone",
    "Everyday smartphone",
    "Large-screen smartphone",
    "Camera-focused smartphone",
    "Travel smartphone",
    "Dual-SIM smartphone",
    "Work smartphone",
    "Starter smartphone",
    "Fold-style phone concept",
    "Classic keypad phone",
  ],
  clothing: [
    "Crew-neck T-shirt",
    "Polo shirt",
    "Casual shirt",
    "Linen-style shirt",
    "Hooded sweatshirt",
    "Lightweight jacket",
    "Everyday trousers",
    "Relaxed joggers",
    "Summer dress",
    "Everyday kurta",
  ],
  laptops: [
    "Compact notebook",
    "Everyday notebook",
    "Study laptop",
    "Work laptop",
    "Creative laptop",
    "Travel notebook",
    "Convertible notebook",
    "Large-screen notebook",
    "Entry notebook",
    "Portable workstation",
  ],
  audio: [
    "Wireless earbuds",
    "Over-ear headphones",
    "On-ear headphones",
    "Wired earphones",
    "Portable speaker",
    "Desk speakers",
    "Clip microphone",
    "USB microphone",
    "Conference speaker",
    "Compact soundbar",
  ],
  bags: [
    "Day backpack",
    "Laptop backpack",
    "Canvas tote",
    "Weekender bag",
    "Crossbody bag",
    "Messenger bag",
    "Gym duffel",
    "Travel organiser",
    "Compact sling",
    "Shopping tote",
  ],
  watches: [
    "Minimal dial watch",
    "Everyday analogue watch",
    "Digital watch",
    "Sports watch",
    "Classic strap watch",
    "Mesh strap watch",
    "Square dial watch",
    "Travel watch",
    "Smartwatch concept",
    "Compact dial watch",
  ],
  kitchen: [
    "Storage jar set",
    "Water bottle",
    "Coffee mug",
    "Serving tray",
    "Mixing bowl",
    "Lunch container",
    "Cutting board",
    "Utensil holder",
    "Spice organiser",
    "Kitchen towel set",
  ],
  lighting: [
    "Reading lamp",
    "Desk lamp",
    "Bedside lamp",
    "Pendant light",
    "Floor lamp",
    "Wall light",
    "Portable lantern",
    "Night light",
    "Shelf light",
    "Decorative light",
  ],
  sports: [
    "Yoga mat",
    "Resistance band",
    "Exercise ball",
    "Skipping rope",
    "Training towel",
    "Sports bottle",
    "Gym gloves",
    "Stretching strap",
    "Balance cushion",
    "Equipment carry bag",
  ],
};
const choices = {
  shoes: ["Size 6", "Size 7", "Size 8", "Size 9", "Size 10"],
  phones: ["Specification to confirm"],
  clothing: ["S", "M", "L", "XL"],
};
const sql = [
  "-- Adds 100 demo inquiry listings. No verified stock, brand, price or technical specifications.",
  "-- Legacy dimension fields are compatibility defaults, not merchandise specifications; hidden in UI.",
];
mkdirSync("public/assets/merchandise", { recursive: true });
const quote = (v) => "'" + String(v).replaceAll("'", "''") + "'";
const icons = {
  shoes: '<path d="M95 190l55-65 45 50 60 16 26 39H95z"/>',
  phones:
    '<rect x="150" y="65" width="100" height="190" rx="15"/><path d="M185 80h30m-20 155h10"/>',
  clothing:
    '<path d="M160 90l-65 45 35 45 25-15v95h90v-95l25 15 35-45-65-45c-10 30-70 30-80 0z"/>',
  laptops:
    '<rect x="115" y="85" width="170" height="120" rx="8"/><path d="M115 205l-35 35h240l-35-35M175 225h50"/>',
  audio:
    '<path d="M110 185v-30a90 90 0 0 1 180 0v30"/><rect x="100" y="160" width="40" height="90" rx="15"/><rect x="260" y="160" width="40" height="90" rx="15"/>',
  bags: '<rect x="120" y="125" width="160" height="135" rx="12"/><path d="M160 125v-25a40 40 0 0 1 80 0v25"/>',
  watches:
    '<path d="M175 115V60h50v55m-50 90v60h50v-60"/><circle cx="200" cy="160" r="50"/><path d="M200 130v30l25 15"/>',
  kitchen:
    '<path d="M120 110h125v135H120zm125 15h30c45 0 45 85 0 85h-30M145 85v-25m40 25v-25m40 25v-25"/>',
  lighting: '<path d="M145 65h110l40 100H105zm55 100v90m-55 0h110"/>',
  sports:
    '<rect x="105" y="95" width="190" height="150" rx="35"/><path d="M150 115v110m50-110v110m50-110v110"/>',
};
let count = 0;
for (const c of merchandiseCategories) {
  sql.push(
    `INSERT OR IGNORE INTO categories(id,name) VALUES (${quote(c.id)},${quote(c.name)});`,
  );
  writeFileSync(
    `public/assets/merchandise/${c.id}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="320" viewBox="0 0 400 320"><title>${c.name} demo placeholder</title><rect width="400" height="320" fill="#f1efe7"/><g stroke="#304a40" stroke-width="5" fill="none" stroke-linejoin="round" stroke-linecap="round">${icons[c.id]}</g><text x="200" y="297" text-anchor="middle" font-family="sans-serif" font-size="15" fill="#304a40">${c.name} · Demo placeholder</text></svg>\n`,
  );
  for (const [i, name] of names[c.id].entries()) {
    const variants = choices[c.id] || ["Details to confirm"];
    const description = `Demo listing for ${name.toLowerCase()}. Original category illustration only; not a product photograph or verified inventory. Ask the owner to confirm size, specifications, supplier, availability and final price before ordering. No brand, performance or stock claim is made.`;
    const values = [
      `demo-${c.id}-${String(i + 1).padStart(2, "0")}`,
      name,
      c.id,
      description,
      variants[0],
      "Details to confirm",
      20,
      20,
      10,
      null,
      "concept",
      JSON.stringify([`/assets/merchandise/${c.id}.svg`]),
      JSON.stringify(["To confirm"]),
      JSON.stringify(variants),
      null,
      0,
      `${name} — demo listing | Aaranya Living`,
      "Demo inquiry listing. Specifications, availability and price require owner confirmation. No verified inventory or product photograph.",
    ];
    sql.push(
      `INSERT OR IGNORE INTO products(id,name,category_id,description,material,finish,length,width,height,price,status,images,colors,materials,model,internal_cost,seo_title,seo_description) VALUES (${values.map((v) => (v === null ? "NULL" : typeof v === "number" ? v : quote(v))).join(",")});`,
    );
    count++;
  }
}
if (count !== 100) throw new Error("Expected exactly 100 additions");
writeFileSync("migrations/0011_merchandise_catalog.sql", sql.join("\n") + "\n");
console.log(
  "Generated 100 demo listings and 10 original vector placeholders; no database changed.",
);
