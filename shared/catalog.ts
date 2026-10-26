/** Public pilot scope; legacy records remain in D1 and retain direct URLs. */
export const priorityCategories = [
  "dining",
  "beds",
  "wardrobes",
  "chairs",
  "coffee-tables",
] as const;
export const featuredProducts = [
  "pilot-dining",
  "pilot-bed",
  "pilot-wardrobe",
  "pilot-chair",
  "pilot-coffee",
];
export function categoryLabel<T extends { id: string; name: string }>(
  category: T,
): T {
  return category.id === "dining" && category.name === "Dining"
    ? { ...category, name: "Dining tables" }
    : category;
}
