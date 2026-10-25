export const leadStages = [
  "New",
  "Contacted",
  "Quote Sent",
  "Won",
  "Lost",
] as const;
export type LeadStage = (typeof leadStages)[number];
export const stageStatus: Record<LeadStage, string> = {
  New: "New",
  Contacted: "Reviewing",
  "Quote Sent": "Quoted",
  Won: "Confirmed",
  Lost: "Closed",
};
export function leadStage(status: string): LeadStage {
  return status === "Reviewing"
    ? "Contacted"
    : status === "Quoted"
      ? "Quote Sent"
      : ["Confirmed", "Manufacturing", "Delivered"].includes(status)
        ? "Won"
        : status === "Closed"
          ? "Lost"
          : "New";
}
export const leadSources = [
  "direct",
  "google",
  "instagram",
  "whatsapp",
  "referral",
  "contact",
  "other",
] as const;
