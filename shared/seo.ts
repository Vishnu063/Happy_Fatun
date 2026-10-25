import { guides, guideURL } from "./content";
export const brand = "Aaranya Living";
export const tagline = "Where Nature Meets Craftsmanship.";
export const slug = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "design";
export const productURL = (p: { id: string; name: string }) =>
  `/design/${slug(p.name)}/${encodeURIComponent(p.id)}`;
export const categoryURL = (c: { id: string; name: string }) =>
  `/collections/${slug(c.name)}/${encodeURIComponent(c.id)}`;
export function pageMetadata(
  path: string,
  product?: {
    name: string;
    description: string;
    seo_title?: string;
    seo_description?: string;
  },
  category?: { name: string; seo_title?: string; seo_description?: string },
  serviceArea?: string | null,
) {
  const local = serviceArea?.trim()
    ? ` | ${serviceArea.trim().slice(0, 80)}`
    : "";
  const guide = guides.find((g) => guideURL(g) === path);
  if (guide)
    return {
      title: `${guide.title} | ${brand}`,
      description: guide.description,
    };
  if (path === "/guides")
    return {
      title: `Furniture buying guides | ${brand}`,
      description:
        "Practical furniture measuring, material and quotation guides. Prepare an informed request without treating concepts as manufactured stock.",
    };
  if (product)
    return {
      title:
        product.seo_title || `${product.name} | Furniture design | ${brand}`,
      description:
        product.seo_description ||
        `${product.description.slice(0, 135)} Request a personal furniture quotation.`,
    };
  if (category)
    return {
      title:
        category.seo_title ||
        `${category.name} design concepts${local} | ${brand}`,
      description:
        category.seo_description ||
        `Explore ${category.name.toLowerCase()} design concepts, customize dimensions and request a quote. Feasibility, service area and final pricing require confirmation.`,
    };
  if (path === "/contact")
    return {
      title: `Discuss your furniture project${local} | ${brand}`,
      description:
        "Contact Aaranya Living about furniture ideas, customization and delivery feasibility. Use configured business contacts or request a personal quote.",
    };
  if (path === "/about")
    return {
      title: `How custom furniture inquiries work | ${brand}`,
      description:
        "Browse, customize, request a quote and discuss feasibility before any furniture order is confirmed. Clear concepts, personal conversations.",
    };
  if (path.startsWith("/admin"))
    return {
      title: `Private owner studio | ${brand}`,
      description: "Private owner access to furniture designs and inquiries.",
    };
  if (path !== "/")
    return {
      title: `Page not found | ${brand}`,
      description:
        "This page is unavailable. Explore the Aaranya Living design collection.",
    };
  return {
    title: `${brand} | Custom furniture concepts${local}`,
    description: `${tagline} Explore furniture concepts, customize your design and request a personal quote. Final details require review.`,
  };
}
