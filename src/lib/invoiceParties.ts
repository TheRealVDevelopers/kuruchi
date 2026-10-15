import type { InvoiceParty, Project, Vendor } from "@/types";

/** Ola is the rollout account; the selected franchisee showroom is the buyer. */
export function franchiseeInvoiceParties(project?: Project, owner?: Vendor) {
  const site = project?.site;
  const recipient: InvoiceParty = {
    name: project?.name?.trim() || (site?.city ? `${site.city} Showroom` : "Franchisee details unavailable"),
    gstin: site?.gstin?.trim() || "",
    address: [site?.address, site?.city, site?.state, site?.pincode].filter(Boolean).join(", "),
    state: site?.state || "",
    contactName: site?.contactName || owner?.contactName || "",
    contactPhone: site?.contactPhone || owner?.contactPhone || "",
    email: owner?.email || "",
    noGstinReason: site?.noGstinReason,
  };
  return { billTo: { ...recipient }, shipTo: { ...recipient } };
}
