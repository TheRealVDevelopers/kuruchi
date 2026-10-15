import type { AppNotification, Consignment, Crate, Project } from "@/types";

export interface AccountsInboxEntry extends AppNotification {
  requestCategory?: "PAYMENT" | "INVOICE";
  requestStatus?: "WAITING" | "ON_HOLD" | "COMPLETED" | "RETURNED" | "ARCHIVED";
}

/** Project current work over historical alerts without changing the audit trail. */
export function accountsInboxEntry(notification: AppNotification, projects: Project[] = [], shipments: Consignment[] = [], crates: Crate[] = []): AccountsInboxEntry {
  const link = accountsInboxLink(notification, projects, shipments, crates);
  const entry: AccountsInboxEntry = { ...notification, link };
  if (/payment|receipt|collection|advance/i.test(notification.title) || link?.startsWith("/accounts/payments")) entry.requestCategory = "PAYMENT";
  else if (/invoice|billing|challan|e-way|eway/i.test(notification.title) || link?.startsWith("/accounts/invoices")) entry.requestCategory = "INVOICE";

  if (["Payment verification needed", "Corrected payment needs verification"].includes(notification.title)) {
    const id = new URLSearchParams(link?.split("?")[1] ?? "").get("verify");
    const project = projects.find((project) => project.id === id);
    const payment = project?.initialPayment;
    if (!project || !payment) {
      const matching = projects.filter((candidate) => notification.detail.startsWith(`${candidate.name} ·`));
      if (id || matching.length === 0) return { ...entry, title: "Previous payment request", detail: "This showroom payment request is no longer available. Open the verification queue to review current requests.", requestStatus: "ARCHIVED" };
      return entry;
    }
    if (payment.status === "VERIFIED") return { ...entry, title: "Payment verified", detail: `${project.name} · Payment approved by Accounts. No verification is pending.`, requestStatus: "COMPLETED" };
    if (payment.status === "REJECTED") return { ...entry, title: "Payment returned to Ola", detail: `${project.name} · ${payment.rejectionReason || "Waiting for corrected payment details from Ola."}`, requestStatus: "RETURNED" };
    if (payment.status === "ON_HOLD") return { ...entry, title: "Payment on hold", detail: `${project.name} · ${payment.holdReason || "Review the payment before approving."}`, requestStatus: "ON_HOLD" };
    return { ...entry, requestStatus: "WAITING" };
  }
  if (entry.requestCategory === "INVOICE") {
    const id = new URLSearchParams(link?.split("?")[1] ?? "").get("shipment");
    const shipment = shipments.find((shipment) => shipment.id === id);
    if (shipment?.invoiceId || (shipment?.billingExempt && shipment.challanId)) {
      const project = projects.find((project) => project.id === shipment.projectId);
      return { ...entry, title: shipment.invoiceId ? "Shipment invoice created" : "Replacement documents created", detail: `${project?.name || "Showroom"} · The requested billing documents are ready to view.`, requestStatus: "COMPLETED" };
    }
    if (shipment) return { ...entry, requestStatus: "WAITING" };
    const matching = projects.filter((project) => notification.detail.startsWith(`${project.name} ·`) || notification.detail.startsWith(`${project.site.city}:`));
    if (id || matching.length === 0) return { ...entry, title: "Previous invoice request", detail: "This previous request no longer identifies an active shipment. Open the invoice queue to review current billing work.", requestStatus: "ARCHIVED" };
  }
  return entry;
}

/** Resolve older inbox entries without changing their saved records. */
export function accountsInboxLink(notification: AppNotification, projects: Project[] = [], shipments: Consignment[] = [], crates: Crate[] = []): string | undefined {
  const link = notification.link;
  const detail = notification.detail ?? "";
  if (link?.startsWith("/accounts#shipment-")) {
    const id = link.slice("/accounts#shipment-".length);
    return id === "invoices" ? "/accounts/invoices?requests=1" : `/accounts/invoices?shipment=${id}`;
  }
  if (notification.role === "ALL" && link?.startsWith("/admin/projects/")) {
    const id = link.slice("/admin/projects/".length).split(/[?#/]/)[0];
    return `/accounts/cost-centres?project=${id}`;
  }
  if (link && link !== "/accounts" && link !== "/accounts/") return link;

  const matchingProjects = projects.filter((project) => detail.startsWith(`${project.name} ·`) || detail.startsWith(`${project.site.city}:`));
  const project = matchingProjects.length === 1 ? matchingProjects[0] : undefined;
  switch (notification.title) {
    case "Payment verification needed":
    case "Corrected payment needs verification":
      return project ? `/accounts/payments?verify=${encodeURIComponent(project.id)}` : "/accounts/payments?verification=1";
    case "Invoice requested by Admin":
    case "Shipment ready for billing":
    case "Shipment ready for documents": {
      const packedCrate = crates.find((crate) => detail.includes(`: ${crate.crateCode} is packed.`));
      const matching = packedCrate
        ? shipments.filter((shipment) => shipment.crateIds.includes(packedCrate.id))
        : project ? shipments.filter((shipment) => shipment.projectId === project.id && (notification.title !== "Invoice requested by Admin" || Boolean(shipment.invoiceRequestItemIds?.length))) : [];
      return matching.length === 1 ? `/accounts/invoices?shipment=${encodeURIComponent(matching[0].id)}` : "/accounts/invoices?requests=1";
    }
    case "Project ready for closure":
      return project ? `/accounts/cost-centres?project=${encodeURIComponent(project.id)}` : "/accounts/cost-centres";
    default:
      return link;
  }
}
