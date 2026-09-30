import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, PackagePlus, Route, Truck } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { pendingConsignments, repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate } from "@/lib/useAction";
import { formatINR } from "@/lib/money";
import { canDispatch } from "@/lib/rules";
import { EmptyState, PageHeader, StatCard, StatStrip } from "@/components/app/Shell";
import { InlinePhotoCapture } from "@/components/app/SiteKit";
import type { Consignment } from "@/types";

export default function DispatchBoardPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const projects = repo.projects(user);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [crateCode, setCrateCode] = useState("");
  const project = projects.find((entry) => entry.id === projectId);
  const readyItems = repo.itemsRaw(projectId).filter((item) => (item.qtyReadyToPack ?? 0) > 0);
  const waiting = pendingConsignments(user);
  const inTransit = repo.consignments().filter((entry) => entry.status === "DISPATCHED" || entry.status === "IN_TRANSIT");
  const blocked = waiting.filter((entry) => !canDispatch(entry).ok).length;
  if (!user || !project) return <EmptyState title="Create a project first" />;

  const setQuantity = (id: string, value: number, available: number) => setQuantities((current) => ({ ...current, [id]: value > 0 ? available : 0 }));
  const selectedItems = readyItems.filter((item) => (quantities[item.id] ?? 0) > 0);
  const changeProject = (id: string) => { setProjectId(id); setQuantities({}); setCrateCode(""); };

  return <>
    <PageHeader eyebrow="Delivery" title="Send material to site" description="Choose items ready from production, place them in a crate, then add transport details." />
    <StatStrip>
      <StatCard label="Ready to pack" value={readyItems.length} tone={readyItems.length ? "good" : "default"} />
      <StatCard label="Waiting to send" value={waiting.length} tone={blocked ? "warn" : "default"} />
      <StatCard label="On the road" value={inTransit.length} />
      <StatCard label="Needs attention" value={blocked} tone={blocked ? "bad" : "default"} />
    </StatStrip>

    <section className="mb-6 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Step 1 · Pack a crate</p><h2 className="mt-1 text-lg font-extrabold">Choose items ready to send</h2><p className="mt-1 text-sm text-muted-foreground">Only production-ready items can be packed for the showroom.</p></div><select value={projectId} onChange={(event) => changeProject(event.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm font-bold">{projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.site.city} · {entry.code}</option>)}</select></div>
      {readyItems.length === 0 ? <EmptyState title="Nothing ready to pack for this showroom" hint="Items will appear here after Kurchi marks them ready from production." /> : <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{readyItems.map((item) => { const available = item.qtyReadyToPack ?? 0; const quantity = quantities[item.id] ?? 0; return <div key={item.id} className={`rounded-xl border-2 p-3 ${quantity ? "border-primary bg-primary/10" : "border-border bg-background"}`}><span className="flex justify-between gap-2 font-extrabold">{item.name}{quantity > 0 && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}</span><span className="mt-1 block text-xs text-muted-foreground">{available} {item.unit} ready to pack · {item.spec}</span><label className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">Include this BOQ line<input checked={quantity > 0} type="checkbox" onChange={(event) => setQuantity(item.id, event.target.checked ? available : 0, available)} className="h-5 w-5 accent-primary" /></label></div>; })}</div>}
      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-muted/60 p-3 sm:flex-row"><input value={crateCode} onChange={(event) => setCrateCode(event.target.value)} placeholder="Crate code, e.g. DEL-04" className="min-h-11 flex-1 rounded-xl border bg-background px-3 text-sm font-bold"/><button disabled={!selectedItems.length || !crateCode.trim()} type="button" onClick={() => { const allocations = selectedItems.map((item) => ({ itemId: item.id, qty: quantities[item.id] })); const saved = run(() => act.createDispatchBatch(user, { projectId, allocations, crateCode }), "Crate created", "Add a packing photo and delivery details before dispatch."); if (saved) { setQuantities({}); setCrateCode(""); } }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"><PackagePlus className="h-4 w-4" /> Create crate</button></div>
    </section>

    <section className="mb-7"><div className="mb-3"><p className="eyebrow">Step 2 · Send it</p><h2 className="mt-1 text-lg font-extrabold">Crates waiting for dispatch</h2></div>{waiting.length === 0 ? <EmptyState title="No crates waiting to go" hint="Create a crate from ready items above." /> : <div className="grid gap-4 xl:grid-cols-2">{waiting.map((entry) => <ReadyShipmentCard key={entry.consignment.id} entry={entry} />)}</div>}</section>

    <section><div className="mb-3"><p className="eyebrow">Step 3 · Track it</p><h2 className="mt-1 text-lg font-extrabold">On the road</h2></div>{inTransit.length === 0 ? <EmptyState title="No vehicle on the road" /> : <div className="grid gap-3 lg:grid-cols-2">{inTransit.map((consignment) => <TransitCard key={consignment.id} consignment={consignment} />)}</div>}</section>
  </>;
}

function ReadyShipmentCard({ entry }: { entry: ReturnType<typeof pendingConsignments>[number] }) {
  const { user } = useAuth();
  const run = useAction();
  const [editing, setEditing] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [invoiceItems, setInvoiceItems] = useState<string[]>([]);
  const [invoiceDeliveryMethod, setInvoiceDeliveryMethod] = useState<"DIRECT_TRUCK" | "THIRD_PARTY_DELIVERY">(consignment.deliveryMethod ?? "THIRD_PARTY_DELIVERY");
  if (!user) return null;
  const { consignment, project, crates } = entry;
  const shipmentItems = [...new Set(crates.flatMap((crate) => crate.itemIds))].map((id) => repo.itemById(id)).filter(Boolean);
  const verdict = canDispatch(entry);
  return <article className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{project.site.city}</p><h3 className="mt-1 text-lg font-extrabold">{crates.map((crate) => crate.crateCode).join(", ")}</h3><p className="mt-1 text-sm text-muted-foreground">{crates.length} crate{crates.length === 1 ? "" : "s"} · {formatINR(consignment.taxableValue)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${verdict.ok ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{verdict.ok ? "Ready to send" : "Needs details"}</span></div>
    <div className="mt-4 space-y-2">{crates.map((crate) => <div key={crate.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"><div><p className="font-bold">{crate.crateCode}</p><p className="text-xs text-muted-foreground">{crate.itemIds.length} BOQ item{crate.itemIds.length === 1 ? "" : "s"} · {crate.photos.length ? "Packing photo added" : "Packing photo needed"}</p></div><InlinePhotoCapture label={crate.photos.length ? "Add photo" : "Add packing photo"} onAdd={(photo) => run(() => act.addCratePhoto(user, crate.id, photo), "Packing photo saved")} /></div>)}</div>
    {!verdict.ok && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Before dispatch</p><ul className="mt-1 space-y-1">{verdict.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setEditing((open) => !open)} className="min-h-11 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted">{editing ? "Close checklist" : consignment.rtsCheckedAt ? "View RTS checklist" : "Complete RTS checklist"}</button>{!consignment.invoiceId && <button type="button" onClick={() => { setInvoiceItems(shipmentItems.map((item) => item!.id)); setInvoiceOpen(true); }} className="min-h-11 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted">Request invoice</button>}{verdict.ok && <button type="button" onClick={() => run(() => act.dispatchConsignment(user, consignment.id), "Marked dispatched", `${project.site.city} has been notified.`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-extrabold text-primary-foreground"><Truck className="h-4 w-4" /> Mark dispatched</button>}</div>
    {invoiceOpen && <div className="mt-4 rounded-xl border-2 border-primary/20 bg-primary/5 p-4"><p className="font-extrabold">Request invoice from Accounts</p><p className="mt-1 text-xs text-muted-foreground">Select only the products for this shipment and how they will be delivered. Accounts receives both details with the request.</p><label className="mt-3 block text-sm font-bold">Delivery method<select value={invoiceDeliveryMethod} onChange={(event) => setInvoiceDeliveryMethod(event.target.value as typeof invoiceDeliveryMethod)} className="mt-1.5 min-h-11 w-full rounded-lg border bg-background px-3 text-sm"><option value="THIRD_PARTY_DELIVERY">Delivery partner</option><option value="DIRECT_TRUCK">Direct truck</option></select></label><div className="mt-3 space-y-2">{shipmentItems.map((item) => item && <label key={item.id} className="flex items-center gap-3 rounded-lg bg-background p-3 text-sm font-bold"><input type="checkbox" checked={invoiceItems.includes(item.id)} onChange={() => setInvoiceItems((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}/>{item.name} × {item.qty}</label>)}</div><div className="mt-3 flex gap-2"><button type="button" onClick={() => { const saved = run(() => act.requestShipmentInvoice(user, consignment.id, invoiceItems, invoiceDeliveryMethod), "Invoice requested", "Accounts has received the selected products and delivery method."); if (saved) setInvoiceOpen(false); }} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground">Send to Accounts</button><button type="button" onClick={() => setInvoiceOpen(false)} className="min-h-10 rounded-xl border px-4 text-sm font-bold">Cancel</button></div></div>}
    {editing && <ShipmentDetails consignment={consignment} onSaved={() => setEditing(false)} />}
  </article>;
}

function ShipmentDetails({ consignment, onSaved }: { consignment: Consignment; onSaved: () => void }) {
  const { user } = useAuth(); const run = useAction();
  const [form, setForm] = useState({
    boxCounts: consignment.boxCounts?.join(", ") ?? "", deliveryMethod: consignment.deliveryMethod ?? "THIRD_PARTY_DELIVERY" as "DIRECT_TRUCK" | "THIRD_PARTY_DELIVERY",
    lrNumber: consignment.lrNumber ?? "", transporterName: consignment.transporterName ?? "", vehicleNo: consignment.vehicleNo ?? "",
    driverName: consignment.driverName ?? "", driverPhone: consignment.driverPhone ?? "", driverLicenceNo: consignment.driverLicenceNo ?? "",
  });
  if (!user) return null;
  const isDirect = form.deliveryMethod === "DIRECT_TRUCK";
  return <form onSubmit={(event) => { event.preventDefault(); const boxCounts = form.boxCounts.split(",").map((entry) => Number(entry.trim())).filter((entry) => entry > 0); const saved = run(() => act.completeRtsChecklist(user, consignment.id, { ...form, boxCounts }), "RTS checklist complete", "Accounts can now create this shipment's challan and invoice."); if (saved) onSaved(); }} className="mt-4 rounded-xl border-2 border-primary/20 bg-primary/5 p-4"><p className="eyebrow">Ready to ship</p><h4 className="mt-1 font-extrabold">Confirm boxes and transport</h4><p className="mt-1 text-xs text-muted-foreground">The delivery date is calculated automatically after you save this checklist.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input required value={form.boxCounts} onChange={(event) => setForm({ ...form, boxCounts: event.target.value })} placeholder="Box counts, e.g. 7, 13, 11" className="min-h-11 rounded-lg border bg-background px-3 text-sm sm:col-span-2"/><select value={form.deliveryMethod} onChange={(event) => setForm({ ...form, deliveryMethod: event.target.value as typeof form.deliveryMethod })} className="min-h-11 rounded-lg border bg-background px-3 text-sm"><option value="THIRD_PARTY_DELIVERY">Third-party delivery</option><option value="DIRECT_TRUCK">Direct truck</option></select><input required value={form.transporterName} onChange={(event) => setForm({ ...form, transporterName: event.target.value })} placeholder={isDirect ? "Truck operator / company" : "Delivery service name"} className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input required value={form.vehicleNo} onChange={(event) => setForm({ ...form, vehicleNo: event.target.value })} placeholder="Vehicle number" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input required value={form.lrNumber} onChange={(event) => setForm({ ...form, lrNumber: event.target.value })} placeholder="LR number" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/>{isDirect && <><input required value={form.driverName} onChange={(event) => setForm({ ...form, driverName: event.target.value })} placeholder="Driver name" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input required value={form.driverPhone} onChange={(event) => setForm({ ...form, driverPhone: event.target.value })} placeholder="Driver mobile number" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input required value={form.driverLicenceNo} onChange={(event) => setForm({ ...form, driverLicenceNo: event.target.value })} placeholder="Driver licence number" className="min-h-11 rounded-lg border bg-background px-3 text-sm sm:col-span-2"/></>}</div><button className="mt-3 min-h-10 rounded-lg bg-primary px-3.5 text-sm font-bold text-primary-foreground">Save RTS checklist</button></form>;
}

function TransitCard({ consignment }: { consignment: Consignment }) {
  const { user } = useAuth(); const run = useAction();
  const project = repo.projects(user).find((entry) => entry.id === consignment.projectId);
  if (!user) return null;
  return <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><div><p className="eyebrow">{project?.site.city ?? "Showroom"}</p><h3 className="mt-1 font-extrabold">{consignment.lrNumber || "LR pending"}</h3><p className="mt-1 text-sm text-muted-foreground">{consignment.transporterName || "Transporter pending"} · ETA {consignment.eta ? formatDate(consignment.eta) : "not set"}</p></div>{consignment.status === "DISPATCHED" ? <button type="button" onClick={() => run(() => act.markInTransit(user, consignment.id), "Vehicle marked in transit")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted"><Route className="h-4 w-4" />Vehicle started</button> : <Link to={`/site/${consignment.projectId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted"><Route className="h-4 w-4" />Open site receipt</Link>}</article>;
}
