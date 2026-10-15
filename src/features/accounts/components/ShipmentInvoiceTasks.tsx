import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { formatINR } from "@/lib/money";
import { printTaxInvoice } from "@/lib/printInvoice";

export function ShipmentInvoiceTasks({ shipmentId, projectId, pendingOnly = false, showEmpty = true }: { shipmentId?: string; projectId?: string; pendingOnly?: boolean; showEmpty?: boolean }) {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  if (!user) return null;
  const projects = repo.projects(user);
  const invoices = repo.invoices();
  const shipments = repo.consignments().filter((shipment) => (!projectId || shipment.projectId === projectId) && (shipmentId ? shipment.id === shipmentId :
    (shipment.status === "READY" || (pendingOnly && Boolean(shipment.invoiceRequestItemIds?.length))) && (!pendingOnly || (!shipment.invoiceId && !shipment.billingExempt))));
  if (!shipments.length) return showEmpty ? <p className="rounded-2xl bg-muted/55 p-4 text-sm">{shipmentId ? "This shipment request is no longer available." : "No shipment waiting for billing."}</p> : null;
  return <div className="space-y-3">{shipments.map((shipment) => {
    const project = projects.find((entry) => entry.id === shipment.projectId);
    const invoice = shipment.invoiceId ? invoices.find((entry) => entry.id === shipment.invoiceId) : undefined;
    const selected = shipment.invoiceRequestItemIds?.map((id) => repo.itemById(id)?.name).filter(Boolean);
    return <article key={shipment.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-background p-4 ${shipmentId ? "border-primary ring-2 ring-primary/20" : ""}`}>
      <div><b>{project?.name ?? project?.site.city ?? "Showroom"} · {formatINR(shipment.taxableValue)}</b>
        <p className="mt-1 text-sm text-muted-foreground">{selected?.length ? `Admin selected: ${selected.join(", ")}` : "All packed products will be billed."}</p>
        <p className="mt-1 text-xs font-bold text-primary">Delivery: {shipment.deliveryMethod === "DIRECT_TRUCK" ? "Direct truck" : "Delivery partner"}</p>
      </div>
      {shipment.billingExempt ? <span className="rounded-xl bg-muted px-4 py-3 text-sm font-extrabold">Replacement shipment · delivery challan only</span> : invoice ? <div className="flex gap-2">
        <button onClick={() => run(() => { printTaxInvoice(invoice, project, project ? repo.clientById(project.clientId) : null); })} className="min-h-11 rounded-xl border px-4 text-sm font-bold"><Printer className="mr-1 inline h-4 w-4"/>Print</button>
        <Link to={`/accounts/eway?shipment=${encodeURIComponent(shipment.id)}`} className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold">E-way bill</Link>
      </div> : <button onClick={() => run(() => act.createShipmentBillingPack(user, shipment.id), "Shipment documents created", "The delivery challan is ready. A GST invoice is created only for new sale items.")} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground">Create shipment documents</button>}
    </article>;
  })}</div>;
}
