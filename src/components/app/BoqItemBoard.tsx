import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { LayoutGrid, List, X } from "lucide-react";
import type { AppUser, BoqItem, ItemStatus } from "@/types";
import { ITEM_STATUS_META } from "@/lib/statuses";
import { SHIPPING_STAGES, commonProductionTargets, shippingStage } from "@/lib/shippingStages";
import { ItemStatusBadge } from "./StatusBadge";
import { StatusControl } from "./StatusControl";
import { TransitDialog } from "./TransitDialog";
import { repo } from "@/data/repo";
import { commit } from "@/data/store";
import { setManyStatuses } from "@/data/actions";
import { sharedWorkspaceStatus, waitForSharedWorkspaceSave } from "@/data/cloudSync";
import { toast } from "sonner";

type ItemView = Pick<BoqItem, "id" | "projectId" | "consignmentId" | "name" | "qty" | "unit" | "zone" | "status" | "replacementFor">;
const ICONS = ["🏭", "📦", "✅", "🚚"];

export function BoqItemBoard({ items, user, editable = false, title = "Items in this BOQ", limit }: { items: ItemView[]; user?: AppUser; editable?: boolean; title?: string; limit?: number }) {
  const [view, setView] = useState<"tiles" | "list">(() => { try { return localStorage.getItem("kurchi.boq.view") === "list" ? "list" : "tiles"; } catch { return "tiles"; } });
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [transitOpen, setTransitOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingResult, setPendingResult] = useState<ReturnType<typeof setManyStatuses> | null>(null);
  const busy = useRef(false);
  const shown = typeof limit === "number" ? items.slice(0, limit) : items;
  const canEdit = editable && user?.role === "ADMIN";
  const selectable = shown.filter(item => !["CANCELLED", "HANDED_OVER"].includes(item.status));
  const selected = selectable.filter(item => selectedIds.includes(item.id));
  const targets = commonProductionTargets(selected.map(item => item.status));
  const shipment = selected[0]?.consignmentId ? repo.consignments(selected[0].projectId).find(entry => entry.id === selected[0].consignmentId) : undefined;
  const shipmentIds = shipment ? [...new Set(repo.crates(shipment.projectId).filter(crate => shipment.crateIds.includes(crate.id)).flatMap(crate => crate.itemIds))] : [];
  const exactShipment = shipment && ["READY", "DISPATCHED"].includes(shipment.status) && selected.length === shipmentIds.length && selected.every(item => shipmentIds.includes(item.id));
  const readyForShipment = selected.length > 0 && selected.every(item => ["READY_TO_PACK", "PACKED", "DISPATCHED"].includes(item.status));
  const allSelected = selectable.length > 0 && selectable.every(item => selectedIds.includes(item.id));
  const chooseView = (next: "tiles" | "list") => { setView(next); try { localStorage.setItem("kurchi.boq.view", next); } catch { /* View works without storage. */ } };
  const toggle = (id: string) => setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  const updateSelected = async (target?: ItemStatus) => {
    if (!user || busy.current) return;
    if (target === "READY_TO_PACK" && !window.confirm("Confirm quality checks are complete for the selected items.")) return;
    busy.current = true; setSaving(true); setError("");
    try {
      if (!sharedWorkspaceStatus.connected) throw new Error("Wait for the shared workspace to reconnect before updating items.");
      let result = pendingResult;
      if (!result) {
        if (!target || !targets.includes(target)) throw new Error("Select items that can move to the same next stage.");
        result = setManyStatuses(user, selected.map(item => item.id), target);
        if (!result.moved.length) throw new Error(result.notMoved.map(item => item.name + ": " + item.reason).join(" · "));
        setPendingResult(result);
      } else commit();
      await waitForSharedWorkspaceSave();
      toast.success(result.moved.length + " selected items updated", { description: result.notMoved.length ? result.notMoved.map(item => item.name + ": " + item.reason).join(" · ") : "Saved together in one workspace update." });
      setSelectedIds(result.notMoved.map(item => item.itemId)); setPendingResult(null); setBulkOpen(false);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Could not save the selected items."); }
    finally { busy.current = false; setSaving(false); }
  };
  const summary = (item: ItemView) => <><p className="font-extrabold leading-snug">{item.name}</p><p className="mt-1 text-sm text-muted-foreground">{item.qty} {item.unit} · {item.zone || "Showroom"}{item.replacementFor ? " · Replacement" : ""}</p></>;
  const selector = (item: ItemView) => canEdit && <input type="checkbox" aria-label={"Select " + item.name} checked={selectedIds.includes(item.id)} disabled={saving || Boolean(pendingResult) || ["CANCELLED", "HANDED_OVER"].includes(item.status)} onChange={() => toggle(item.id)} className="mt-1 h-5 w-5 shrink-0 accent-primary"/>;
  const control = (item: ItemView) => canEdit && user ? <StatusControl disabled={saving || Boolean(pendingResult)} item={item as BoqItem} user={user}/> : <ItemStatusBadge status={item.status}/>;

  return <section className="rounded-3xl border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">BOQ item tracker</p><h2 className="mt-1 text-xl font-extrabold">{title}</h2></div><div className="flex items-center gap-2"><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{items.length} items</span><div role="group" aria-label="Item view" className="flex rounded-xl border p-1"><button type="button" aria-pressed={view === "tiles"} onClick={() => chooseView("tiles")} className={"inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold " + (view === "tiles" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><LayoutGrid className="h-4 w-4"/>Tiles</button><button type="button" aria-pressed={view === "list"} onClick={() => chooseView("list")} className={"inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-bold " + (view === "list" ? "bg-primary text-primary-foreground" : "hover:bg-muted")}><List className="h-4 w-4"/>List</button></div></div></div>
    <p className="mt-2 text-sm text-muted-foreground">{canEdit ? "Select items being worked on together, then update their status in one action." : "Track each item's production, packaging and delivery."}</p>
    {canEdit && selectable.length > 0 && <div className="sticky top-20 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-3 shadow-sm"><label className="inline-flex min-h-10 items-center gap-2 text-sm font-bold"><input type="checkbox" aria-label="Select all displayed items" checked={allSelected} disabled={saving || Boolean(pendingResult)} onChange={() => setSelectedIds(allSelected ? [] : selectable.map(item => item.id))} className="h-5 w-5 accent-primary"/>Select all{typeof limit === "number" ? " displayed" : ""}</label><span className="text-sm text-muted-foreground">{selected.length} selected</span><button type="button" disabled={!selected.length || saving} onClick={() => { setError(""); setBulkOpen(true); }} className="min-h-10 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">{pendingResult ? "Retry saving update" : "Update selected"}</button>{selected.length > 0 && <button type="button" disabled={saving || Boolean(pendingResult)} onClick={() => setSelectedIds([])} className="min-h-10 rounded-xl border px-3 text-sm font-bold">Clear selection</button>}</div>}
    {view === "tiles" ? <div className="mt-5 grid gap-3 md:grid-cols-2">{shown.map(item => <article key={item.id} className={"rounded-2xl border p-4 " + (selectedIds.includes(item.id) ? "border-primary bg-primary/5" : "bg-muted/30")}><div className="flex items-start gap-3">{selector(item)}<div className="min-w-0 flex-1">{summary(item)}</div>{control(item)}</div><div className="mt-4 grid grid-cols-4 gap-1.5">{SHIPPING_STAGES.map((label, index) => <div key={label} className={"rounded-xl px-2 py-2 text-center text-[11px] font-bold " + (shippingStage(item.status) === index ? "bg-primary text-primary-foreground" : shippingStage(item.status) > index ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground")}><span className="block text-base">{ICONS[index]}</span><span className="mt-0.5 block">{label}</span></div>)}</div><p className="mt-3 text-xs font-semibold text-muted-foreground">Now: {ITEM_STATUS_META[item.status].label}</p></article>)}</div> : <div className="mt-5 divide-y overflow-hidden rounded-2xl border">{shown.map(item => <article key={item.id} className={"flex flex-wrap items-start gap-3 p-4 sm:items-center " + (selectedIds.includes(item.id) ? "bg-primary/5" : "bg-muted/20")}>{selector(item)}<div className="min-w-0 flex-1">{summary(item)}</div><div className="flex flex-wrap items-center gap-2"><ItemStatusBadge status={item.status}/>{canEdit && control(item)}</div></article>)}</div>}
    {!items.length && <p className="mt-5 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">The BOQ does not have items yet.</p>}
    {typeof limit === "number" && items.length > limit && <p className="mt-4 text-sm font-bold text-primary">+ {items.length - limit} more items in this BOQ</p>}
    {bulkOpen && <div role="dialog" aria-modal="true" aria-label="Update selected BOQ items" className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-card p-6"><div className="flex justify-between gap-3"><div><h2 className="text-xl font-extrabold">Update {selected.length} selected items</h2><p className="mt-2 text-sm text-muted-foreground">Only checked items change. Unselected items are untouched.</p></div><button aria-label="Close bulk update" disabled={saving} type="button" onClick={() => setBulkOpen(false)} className="h-10 w-10 shrink-0 rounded-xl border"><X className="mx-auto h-4 w-4"/></button></div><div className="mt-4 max-h-40 space-y-2 overflow-y-auto rounded-xl bg-muted p-3">{selected.map(item => <p key={item.id} className="text-sm">{item.name} × {item.qty} · {ITEM_STATUS_META[item.status].label}</p>)}</div>{pendingResult ? <button disabled={saving} type="button" onClick={() => void updateSelected()} className="mt-4 min-h-11 w-full rounded-xl bg-primary font-bold text-primary-foreground">{saving ? "Saving…" : "Retry saving changes"}</button> : <div className="mt-4 space-y-2">{targets.map(target => <button key={target} disabled={saving} type="button" onClick={() => void updateSelected(target)} className="min-h-12 w-full rounded-xl border px-4 text-left font-bold hover:bg-primary/5">{ITEM_STATUS_META[target].label}</button>)}{readyForShipment && (exactShipment ? <button type="button" onClick={() => { setBulkOpen(false); setTransitOpen(true); }} className="min-h-12 w-full rounded-xl border px-4 text-left font-bold">In transit · add delivery details</button> : <Link to={"/admin/dispatch?project=" + selected[0].projectId + "&items=" + encodeURIComponent(selected.map(item => item.id).join(","))} className="block rounded-xl border p-4 text-sm font-bold">Prepare shipment for these items →</Link>)}{!targets.length && !readyForShipment && <p className="rounded-xl bg-muted p-3 text-sm">These items are at different stages or need the site workflow. Select items with the same available next step.</p>}</div>}{error && <p role="alert" className="mt-4 rounded-xl border border-destructive p-3 text-sm text-destructive">{error}</p>}</section></div>}
    {transitOpen && shipment && user && <TransitDialog shipment={shipment} user={user} onClose={() => { setTransitOpen(false); setSelectedIds([]); }}/>}
  </section>;
}
