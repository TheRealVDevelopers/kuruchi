import type { ItemStatus } from "@/types";
export const SHIPPING_STAGES = ["In production", "In packaging", "Ready to ship", "In transit"] as const;
export function productionNext(status: ItemStatus): ItemStatus[] {
  if (["APPROVED", "QC_FAILED", "REPLACEMENT_REQUESTED"].includes(status)) return ["IN_PRODUCTION"];
  if (["IN_PRODUCTION", "PO_PLACED"].includes(status)) return ["QC_PENDING"];
  if (status === "QC_PENDING") return ["READY_TO_PACK"];
  return [];
}
export function commonProductionTargets(statuses: ItemStatus[]): ItemStatus[] {
  return statuses.length ? productionNext(statuses[0]).filter(target => statuses.every(status => productionNext(status).includes(target))) : [];
}
/** Internal QC/packing codes remain for guards; people see one shared shipping flow. */
export function shippingStage(status: ItemStatus): number {
  if (["DRAFT", "APPROVED", "CANCELLED"].includes(status)) return -1;
  if (["IN_PRODUCTION", "PO_PLACED", "QC_FAILED", "REPLACEMENT_REQUESTED"].includes(status)) return 0;
  if (status === "QC_PENDING") return 1;
  if (["READY_TO_PACK", "PACKED", "DISPATCHED"].includes(status)) return 2;
  if (status === "IN_TRANSIT") return 3;
  return 4; // Receipt/installation is tracked separately after shipping.
}
export function showroomShippingStage(statuses: ItemStatus[]): number {
  const live = statuses.filter(status => status !== "CANCELLED");
  return live.length ? Math.min(...live.map(shippingStage)) : -1;
}
