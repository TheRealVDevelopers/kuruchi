import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

export type CleanupScope = "PROJECTS" | "CLEAR_WORKSPACE";
export interface CleanupPreview {
  counts: Record<string, number>;
  total: number;
  confirmation: string;
  revision: number;
  projects: Array<{ id: string; code: string; name: string }>;
}
export const RECORD_LABELS: Record<string, string> = {
  products: "Catalogue products", kits: "BOQ kits", clients: "Ola accounts", programmes: "Programmes", vendors: "Franchisees & partners",
  projects: "Projects", items: "BOQ lines", crates: "Packing crates", consignments: "Shipments", tickets: "Damage, shortage & service reports",
  snags: "Snags", progressLogs: "Site updates", comments: "Messages", invoices: "Invoices", challans: "Delivery challans", payments: "Payments & advances",
  creditNotes: "Credit notes", changeOrders: "Change requests", inventory: "Stock records", vendorBills: "Purchase bills", costEntries: "Expenses",
  purchaseOrders: "Purchase orders", scheduleTasks: "Schedule tasks", documents: "Document records", notifications: "Notifications", enquiries: "Enquiries", audit: "Activity entries",
};

export async function manageWorkspaceData(scope: CleanupScope, projectIds: string[], preview?: CleanupPreview, confirmation?: string) {
  if (!functions) throw new Error("Workspace cleanup is unavailable. Reload and try again.");
  const response = await httpsCallable<unknown, CleanupPreview>(functions, "manageWorkspaceData")({
    scope, projectIds, dryRun: !preview, ...(preview ? { expectedRevision: preview.revision, confirmation } : {}),
  });
  return response.data;
}

export async function deleteWorkspaceUsers(uids: string[], confirmation: string) {
  if (!functions) throw new Error("User deletion is unavailable. Reload and try again.");
  const response = await httpsCallable<unknown, { deleted: string[]; failed: Array<{ uid: string; message: string }> }>(functions, "deleteWorkspaceUsers")({ uids, confirmation });
  return response.data;
}

export function maintenanceError(error: unknown) {
  return error instanceof Error ? error.message.replace(/^Firebase:\s*/, "") : "Could not complete this action. Please try again.";
}
