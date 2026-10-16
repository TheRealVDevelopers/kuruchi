import { useRef, useState } from "react";
import type { AppUser, BoqItem, Consignment } from "@/types";
import { requestSelectedBoqInvoice } from "@/data/actions";
import { repo } from "@/data/repo";
import { commit } from "@/data/store";
import { sharedWorkspaceStatus, waitForSharedWorkspaceSave } from "@/data/cloudSync";
import { toast } from "sonner";
import { IS_LOCAL_DEMO } from "@/lib/demoMode";

type InvoiceItem = Pick<BoqItem, "id" | "name" | "qty" | "unit" | "consignmentId">;

export function BoqInvoiceDialog({ items, user, onClose, onSaved }: { items: InvoiceItem[]; user: AppUser; onClose: () => void; onSaved: () => void }) {
  const shipments = repo.consignments().filter((shipment) => items.some((item) => item.consignmentId === shipment.id));
  const commonDetail = (field: "vehicleNo" | "driverName" | "driverPhone") => shipments.length && shipments.every((shipment) => shipment[field] === shipments[0][field]) ? shipments[0][field] ?? "" : "";
  const [deliveryMethod, setDeliveryMethod] = useState<NonNullable<Consignment["deliveryMethod"]>>(() => shipments.length && shipments.every((shipment) => shipment.deliveryMethod === shipments[0].deliveryMethod) ? shipments[0].deliveryMethod ?? "THIRD_PARTY_DELIVERY" : "THIRD_PARTY_DELIVERY");
  const [crateCode, setCrateCode] = useState("");
  const [vehicleNo, setVehicleNo] = useState(() => commonDetail("vehicleNo"));
  const [driverName, setDriverName] = useState(() => commonDetail("driverName"));
  const [driverPhone, setDriverPhone] = useState(() => commonDetail("driverPhone"));
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const needsCrate = items.some((item) => !item.consignmentId);

  return <div role="dialog" aria-modal="true" aria-label="Invoice selected BOQ items" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
    <form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6" onSubmit={async (event) => {
      event.preventDefault();
      if (busy.current) return;
      busy.current = true; setSaving(true); setError("");
      try {
        if (!IS_LOCAL_DEMO && !sharedWorkspaceStatus.connected) throw new Error("Wait for the shared workspace to reconnect before requesting an invoice.");
        if (pending) commit();
        else { requestSelectedBoqInvoice(user, items.map((item) => item.id), deliveryMethod, crateCode, { vehicleNo, driverName, driverPhone }); setPending(true); }
        await waitForSharedWorkspaceSave();
        toast.success("Invoice requested", { description: `Accounts received ${items.length} selected BOQ item${items.length === 1 ? "" : "s"}.` });
        onSaved();
      } catch (failure) { setError(failure instanceof Error ? failure.message : "The invoice request could not be saved."); }
      finally { busy.current = false; setSaving(false); }
    }}>
      <h2 className="text-xl font-extrabold">Invoice selected items</h2>
      <p className="mt-2 text-sm text-muted-foreground">Request an invoice from Accounts for {items.length === 1 ? "this checked item" : `these ${items.length} checked items`} after Ready to ship.</p>
      <ul className="mt-4 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-muted p-3">{items.map((item) => <li key={item.id} className="text-sm font-bold">{item.name} × {item.qty} {item.unit}</li>)}</ul>
      <fieldset disabled={saving || pending} className="mt-4 space-y-3">
        {needsCrate && <label className="block text-sm font-bold">Crate code<input required value={crateCode} onChange={(event) => setCrateCode(event.target.value)} placeholder="e.g. DEL-04" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/><span className="mt-1 block text-xs font-normal text-muted-foreground">A packing batch is needed for the selected items before Accounts creates their invoice.</span></label>}
        <label className="block text-sm font-bold">Delivery method<select value={deliveryMethod} onChange={(event) => setDeliveryMethod(event.target.value as typeof deliveryMethod)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="THIRD_PARTY_DELIVERY">Delivery partner</option><option value="DIRECT_TRUCK">Direct truck</option></select></label>
        <div className="space-y-3 rounded-xl border bg-muted/30 p-3">
          <p className="text-sm font-extrabold">{deliveryMethod === "DIRECT_TRUCK" ? "Truck and driver details" : "Delivery vehicle and driver details"}</p>
          <label className="block text-sm font-bold">Truck / vehicle number<input required value={vehicleNo} onChange={(event) => setVehicleNo(event.target.value.toUpperCase())} placeholder="e.g. KA01AB1234" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label>
          <label className="block text-sm font-bold">Driver name<input required value={driverName} onChange={(event) => setDriverName(event.target.value)} autoComplete="name" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label>
          <label className="block text-sm font-bold">Driver phone number<input required type="tel" inputMode="tel" value={driverPhone} onChange={(event) => setDriverPhone(event.target.value)} placeholder="e.g. +919876543210" className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label>
        </div>
      </fieldset>
      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive p-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 flex gap-2"><button disabled={saving} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground">{saving ? "Saving…" : pending ? "Retry saving request" : "Send to Accounts"}</button><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border px-4 font-bold">Cancel</button></div>
    </form>
  </div>;
}
