import { useState } from "react";
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

  const setQuantity = (id: string, value: number, available: number) => setQuantities((current) => ({ ...current, [id]: Math.max(0, Math.min(available, Math.floor(value) || 0)) }));
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
      {readyItems.length === 0 ? <EmptyState title="Nothing ready to pack for this showroom" hint="Items will appear here after Kurchi marks them ready from production." /> : <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{readyItems.map((item) => { const available = item.qtyReadyToPack ?? 0; const quantity = quantities[item.id] ?? 0; return <div key={item.id} className={`rounded-xl border-2 p-3 ${quantity ? "border-primary bg-primary/10" : "border-border bg-background"}`}><span className="flex justify-between gap-2 font-extrabold">{item.name}{quantity > 0 && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}</span><span className="mt-1 block text-xs text-muted-foreground">{available} {item.unit} ready to pack · {item.spec}</span><label className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">Qty in this crate<input min="0" max={available} type="number" value={quantity || ""} onChange={(event) => setQuantity(item.id, Number(event.target.value), available)} className="min-h-9 w-20 rounded-lg border bg-background px-2 text-right text-sm font-bold text-foreground" /></label></div>; })}</div>}
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
  if (!user) return null;
  const { consignment, project, crates } = entry;
  const verdict = canDispatch(entry);
  return <article className="rounded-2xl border bg-card p-4 sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{project.site.city}</p><h3 className="mt-1 text-lg font-extrabold">{crates.map((crate) => crate.crateCode).join(", ")}</h3><p className="mt-1 text-sm text-muted-foreground">{crates.length} crate{crates.length === 1 ? "" : "s"} · {formatINR(consignment.taxableValue)}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${verdict.ok ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>{verdict.ok ? "Ready to send" : "Needs details"}</span></div>
    <div className="mt-4 space-y-2">{crates.map((crate) => <div key={crate.id} className="flex items-center justify-between gap-3 rounded-xl border bg-background p-3"><div><p className="font-bold">{crate.crateCode}</p><p className="text-xs text-muted-foreground">{crate.itemIds.length} BOQ item{crate.itemIds.length === 1 ? "" : "s"} · {crate.photos.length ? "Packing photo added" : "Packing photo needed"}</p></div><InlinePhotoCapture label={crate.photos.length ? "Add photo" : "Add packing photo"} onAdd={(photo) => run(() => act.addCratePhoto(user, crate.id, photo), "Packing photo saved")} /></div>)}</div>
    {!verdict.ok && <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-950"><p className="font-bold">Before dispatch</p><ul className="mt-1 space-y-1">{verdict.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul></div>}
    <div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setEditing((open) => !open)} className="min-h-11 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted">{editing ? "Close details" : "Add transport details"}</button>{verdict.ok && <button type="button" onClick={() => run(() => act.dispatchConsignment(user, consignment.id), "Marked dispatched", `${project.site.city} has been notified.`)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-3.5 text-sm font-extrabold text-primary-foreground"><Truck className="h-4 w-4" /> Mark dispatched</button>}</div>
    {editing && <ShipmentDetails consignment={consignment} onSaved={() => setEditing(false)} />}
  </article>;
}

function ShipmentDetails({ consignment, onSaved }: { consignment: Consignment; onSaved: () => void }) {
  const { user } = useAuth(); const run = useAction();
  const [form, setForm] = useState({ lrNumber: consignment.lrNumber ?? "", transporterName: consignment.transporterName ?? "", vehicleNo: consignment.vehicleNo ?? "", ewayBillNo: consignment.ewayBillNo ?? "", eta: consignment.eta?.slice(0, 10) ?? "" });
  if (!user) return null;
  return <form onSubmit={(event) => { event.preventDefault(); const saved = run(() => act.updateConsignment(user, consignment.id, { ...form, vehicleNo: form.vehicleNo.toUpperCase(), eta: form.eta ? new Date(form.eta).toISOString() : undefined }), "Transport details saved"); if (saved) onSaved(); }} className="mt-4 rounded-xl border bg-muted/40 p-3"><p className="font-bold">Transport details</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><input required value={form.transporterName} onChange={(event) => setForm({ ...form, transporterName: event.target.value })} placeholder="Transporter name" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input required value={form.vehicleNo} onChange={(event) => setForm({ ...form, vehicleNo: event.target.value })} placeholder="Vehicle number" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input required value={form.lrNumber} onChange={(event) => setForm({ ...form, lrNumber: event.target.value })} placeholder="LR number" className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input type="date" required value={form.eta} onChange={(event) => setForm({ ...form, eta: event.target.value })} className="min-h-11 rounded-lg border bg-background px-3 text-sm"/><input value={form.ewayBillNo} onChange={(event) => setForm({ ...form, ewayBillNo: event.target.value })} placeholder="E-way bill number if required" className="min-h-11 rounded-lg border bg-background px-3 text-sm sm:col-span-2"/></div><button className="mt-3 min-h-10 rounded-lg bg-foreground px-3.5 text-sm font-bold text-background">Save details</button></form>;
}

function TransitCard({ consignment }: { consignment: Consignment }) {
  const { user } = useAuth(); const run = useAction();
  const project = repo.projects(user).find((entry) => entry.id === consignment.projectId);
  if (!user) return null;
  return <article className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4"><div><p className="eyebrow">{project?.site.city ?? "Showroom"}</p><h3 className="mt-1 font-extrabold">{consignment.lrNumber || "LR pending"}</h3><p className="mt-1 text-sm text-muted-foreground">{consignment.transporterName || "Transporter pending"} · ETA {consignment.eta ? formatDate(consignment.eta) : "not set"}</p></div><button type="button" onClick={() => run(() => consignment.status === "DISPATCHED" ? act.markInTransit(user, consignment.id) : act.markDelivered(user, consignment.id), consignment.status === "DISPATCHED" ? "Vehicle marked in transit" : "Marked delivered")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted"><Route className="h-4 w-4" />{consignment.status === "DISPATCHED" ? "Vehicle started" : "Arrived at site"}</button></article>;
}
