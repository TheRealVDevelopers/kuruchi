import type { AppNotification, Consignment, Crate, Project } from "@/types";

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
