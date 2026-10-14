import { useState } from "react";
import { Link } from "react-router-dom";
import type { AppUser, Consignment } from "@/types";
import { startShipmentTransit } from "@/data/actions";
import { waitForSharedWorkspaceSave, sharedWorkspaceStatus } from "@/data/cloudSync";
import { toast } from "sonner";

export function TransitDialog({ shipment, user, onClose }: { shipment: Consignment; user: AppUser; onClose: () => void }) {
  const [mode, setMode] = useState(shipment.deliveryMethod ?? "DIRECT_TRUCK");
  const [truck, setTruck] = useState(shipment.vehicleNo ?? "");
  const [driver, setDriver] = useState(shipment.driverName ?? "");
  const [phone, setPhone] = useState(shipment.driverPhone ?? "");
  const [eta, setEta] = useState("");
  const [awb, setAwb] = useState(shipment.awbNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const direct = mode === "DIRECT_TRUCK";
  return <div role="dialog" aria-modal="true" aria-label="Start transit" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"><form className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6" onSubmit={async (event) => {
    event.preventDefault(); if (saving) return; setSaving(true); setError("");
    try {
      if (!sharedWorkspaceStatus.connected) throw new Error("Wait for the shared workspace to reconnect.");
      if (!changed) { startShipmentTransit(user, shipment.id, { deliveryMethod: mode, vehicleNo: truck, driverName: driver, driverPhone: phone, eta, awbNumber: awb }); setChanged(true); }
      else { const { commit } = await import("@/data/store"); commit(); }
      await waitForSharedWorkspaceSave(); toast.success("Shipment is in transit"); onClose();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Transit could not be saved."); } finally { setSaving(false); }
  }}><h2 className="text-xl font-extrabold">Move to In transit</h2><p className="mt-2 text-sm text-muted-foreground">Confirm the delivery method before the shipment leaves. Packing and Accounts documents must be complete.</p><fieldset disabled={saving || changed} className="mt-5 space-y-3"><label className="block text-sm font-bold">Delivery method<select value={mode} onChange={e => setMode(e.target.value as typeof mode)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"><option value="DIRECT_TRUCK">Direct truck</option><option value="THIRD_PARTY_DELIVERY">Delhivery</option></select></label>{direct ? <>
    <Input label="Truck number" value={truck} onChange={setTruck}/><Input label="Driver name" value={driver} onChange={setDriver}/><Input label="Driver phone number" value={phone} onChange={setPhone} type="tel"/><Input label="Expected delivery date and time" value={eta} onChange={setEta} type="datetime-local"/>
  </> : <><Input label="Delhivery AWB number" value={awb} onChange={setAwb}/><p className="text-sm text-muted-foreground">Tracking status and ETA update from Delhivery when the Admin API connection is configured. No delivery date is invented.</p><Link className="text-sm font-bold text-primary" to="/admin/logistics">Open API settings</Link></>}</fieldset>{error && <p role="alert" className="mt-4 rounded-xl border border-destructive p-3 text-sm text-destructive">{error}</p>}<div className="mt-5 flex gap-2"><button disabled={saving} className="min-h-11 rounded-xl bg-primary px-4 font-bold text-primary-foreground">{saving ? "Saving…" : changed ? "Retry save" : "Confirm In transit"}</button><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border px-4 font-bold">Cancel</button></div></form></div>;
}
function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="block text-sm font-bold">{label}<input required type={type} value={value} onChange={e => onChange(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label>; }
