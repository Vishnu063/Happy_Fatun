/** Owner-requested expansion. Existing furniture categories and records are retained. */
export const merchandiseCategories = [
  { id: "shoes", name: "Shoes" },
  { id: "phones", name: "Phones" },
  { id: "clothing", name: "Clothing" },
  { id: "laptops", name: "Laptops" },
  { id: "audio", name: "Audio" },
  { id: "bags", name: "Bags" },
  { id: "watches", name: "Watches" },
  { id: "kitchen", name: "Kitchen essentials" },
  { id: "lighting", name: "Lighting" },
  { id: "sports", name: "Sports accessories" },
] as const;
export const isMerchandise = (category: string) =>
  merchandiseCategories.some((c) => c.id === category);
