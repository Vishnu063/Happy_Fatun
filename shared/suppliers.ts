/** These DTOs belong only to authenticated owner APIs/UI. Never add them to public products. */
export const availabilityOptions = {
  unknown: "Not verified",
  confirm: "Needs confirmation",
  available: "Owner-reported available",
  unavailable: "Owner-reported unavailable",
} as const;
export type Availability = keyof typeof availabilityOptions;
export interface Supplier {
  id: string;
  name: string;
  location: string | null;
  address: string | null;
  phone: string | null;
  notes: string | null;
  archived: number;
  updated_at: string;
}
export interface ProductSupplier {
  id: string;
  product_id: string;
  supplier_id: string;
  supplier_cost: number | null;
  selling_price: number | null;
  availability: Availability;
  lead_time: string | null;
  notes: string | null;
  archived: number;
  updated_at: string;
  product_name: string;
  shop_name: string;
  location: string | null;
  phone: string | null;
  address: string | null;
  shop_archived: number;
}
export const supplierMargin = (cost: number | null, price: number | null) =>
  cost !== null && price !== null && price > 0
    ? ((price - cost) / price) * 100
    : null;
