export interface Product {
  id: string;
  name: string;
  category_id: string;
  description: string;
  material: string;
  finish: string;
  length: number;
  width: number;
  height: number;
  price: number | null;
  status: string;
  images: string[];
  colors: string[];
  materials: string[];
  model: "sofas" | "dining" | "desks" | null;
  internal_cost?: number;
}
export interface Category {
  id: string;
  name: string;
}
export const money = (value: number | null) =>
  value === null
    ? "Price on request"
    : new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(value / 100);
export async function api<T = Record<string, unknown>>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}
export const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});
