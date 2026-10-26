import type { Env } from "./index";
import { priorityCategories, categoryLabel } from "../shared/catalog";
export const publicColumns =
  "id,name,category_id,description,material,finish,length,width,height,price,status,images,colors,materials,model,seo_title,seo_description";
export function decode(row: Record<string, unknown>) {
  return {
    ...row,
    images: JSON.parse(String(row.images)),
    colors: JSON.parse(String(row.colors)),
    materials: JSON.parse(String(row.materials)),
  };
}
export async function publicProducts(
  env: Env,
  selection: { id?: string; category?: string } = {},
) {
  const params = selection.id
    ? [selection.id]
    : selection.category
      ? [selection.category]
      : [...priorityCategories];
  const condition = selection.id
    ? "id=?"
    : selection.category
      ? "category_id=?"
      : `category_id IN (${priorityCategories.map(() => "?").join(",")})`;
  const [products, media] = await Promise.all([
    env.DB.prepare(
      `SELECT ${publicColumns} FROM products WHERE status!='archived' AND ${condition} ORDER BY name`,
    )
      .bind(...params)
      .all(),
    env.DB.prepare(
      `SELECT p.id AS product_id,j.value AS url,
      COALESCE(t.alt,m.alt,p.name||' — illustrative view '||(CAST(j.key AS INTEGER)+1)) AS alt,
      COALESCE(m.kind,CASE WHEN p.status='concept' OR j.value LIKE '/assets/%' THEN 'illustrative' ELSE 'photo' END) AS kind
      FROM products p,json_each(p.images) j
      LEFT JOIN media_objects m ON '/media/'||m.id=j.value AND m.product_id=p.id
      LEFT JOIN product_image_text t ON t.product_id=p.id AND t.url=j.value
      WHERE p.status!='archived' AND p.${condition}`,
    )
      .bind(...params)
      .all(),
  ]);
  const metadata = new Map<
    string,
    Record<string, { alt: unknown; kind: unknown }>
  >();
  for (const image of media.results) {
    const id = String(image.product_id),
      images = metadata.get(id) || {};
    images[String(image.url)] = { alt: image.alt, kind: image.kind };
    metadata.set(id, images);
  }
  // Retain stored legacy model assignments privately; initial release uses images only.
  return products.results.map((row) => ({
    ...decode(row),
    model: null,
    image_metadata: metadata.get(String(row.id)) || {},
  }));
}
export async function publicCategories(env: Env, legacyId?: string) {
  const ids = [
    ...new Set<string>([
      ...priorityCategories,
      ...(legacyId ? [legacyId] : []),
    ]),
  ];
  const rows = await env.DB.prepare(
    `SELECT id,name,seo_title,seo_description FROM categories WHERE id IN (${ids.map(() => "?").join(",")})`,
  )
    .bind(...ids)
    .all<{
      id: string;
      name: string;
      seo_title: string;
      seo_description: string;
    }>();
  return ids.flatMap((id) =>
    rows.results.filter((c) => c.id === id).map(categoryLabel),
  );
}
