import { leadSources } from "../../shared/leads";
export type Business = {
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  address: string | null;
  service_area: string | null;
  summary: string | null;
};
export function whatsappURL(
  number: string | null,
  text = "Hello Aaranya Living, I would like to discuss custom furniture.",
) {
  if (!number || !/^\+?[1-9]\d{6,14}$/.test(number)) return null;
  return `https://wa.me/${number.replace("+", "")}?text=${encodeURIComponent(text)}`;
}
export function captureSource() {
  const query = new URLSearchParams(location.search);
  const input = (
    query.get("utm_source") ||
    query.get("source") ||
    ""
  ).toLowerCase();
  try {
    if (input)
      sessionStorage.setItem(
        "aaranya-source",
        leadSources.includes(input as (typeof leadSources)[number])
          ? input
          : "other",
      );
    return sessionStorage.getItem("aaranya-source") || "direct";
  } catch {
    return "direct";
  }
}
