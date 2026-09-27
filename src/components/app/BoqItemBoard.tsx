import type { AppUser, BoqItem, ItemStatus } from "@/types";
import { ITEM_STATUS_META } from "@/lib/statuses";
import { ItemStatusBadge } from "@/components/app/StatusBadge";
import { StatusControl } from "@/components/app/StatusControl";

type ItemView = Pick<BoqItem, "id" | "name" | "qty" | "unit" | "zone" | "status" | "replacementFor">;

const FLOW: Array<{ icon: string; label: string; stages: ItemStatus[] }> = [
  { icon: "🏭", label: "Making", stages: ["IN_PRODUCTION", "PO_PLACED", "QC_PENDING", "QC_FAILED", "READY_TO_PACK", "REPLACEMENT_REQUESTED"] },
  { icon: "🚚", label: "Moving", stages: ["PACKED", "DISPATCHED", "IN_TRANSIT"] },
  { icon: "🛠️", label: "At site", stages: ["DELIVERED_AT_SITE", "RECEIVED_OK", "INSTALL_ASSIGNED", "INSTALL_IN_PROGRESS", "INSTALLED", "SNAG_OPEN", "HANDED_OVER"] },
];

/** The one BOQ view used everywhere: users follow the items, not an abstract project stage. */
export function BoqItemBoard({ items, user, editable = false, title = "Items in this BOQ", limit }: { items: ItemView[]; user?: AppUser; editable?: boolean; title?: string; limit?: number }) {
  const shown = typeof limit === "number" ? items.slice(0, limit) : items;
  return <section className="rounded-3xl border bg-card p-5 sm:p-6"><div className="flex items-end justify-between gap-3"><div><p className="eyebrow">BOQ item tracker</p><h2 className="mt-1 text-xl font-extrabold">{title}</h2></div><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{items.length} items</span></div><p className="mt-2 text-sm text-muted-foreground">Each item moves independently. A replacement returns to making without holding up the rest.</p><div className="mt-5 grid gap-3 md:grid-cols-2">{shown.map((item) => <article key={item.id} className="rounded-2xl border bg-muted/30 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-extrabold leading-snug">{item.name}</p><p className="mt-1 text-sm text-muted-foreground">{item.qty} {item.unit} · {item.zone || "Showroom"}{item.replacementFor ? " · Replacement" : ""}</p></div>{editable && user ? <StatusControl item={item as BoqItem} user={user} /> : <ItemStatusBadge status={item.status} />}</div><div className="mt-4 grid grid-cols-3 gap-1.5">{FLOW.map((step) => { const active = step.stages.includes(item.status); const done = FLOW.findIndex((candidate) => candidate.stages.includes(item.status)) > FLOW.indexOf(step); return <div key={step.label} className={`rounded-xl px-2 py-2 text-center text-[11px] font-bold ${active ? "bg-primary text-primary-foreground" : done ? "bg-primary/15 text-primary" : "bg-background text-muted-foreground"}`}><span className="block text-base">{step.icon}</span><span className="mt-0.5 block">{step.label}</span></div>; })}</div><p className="mt-3 text-xs font-semibold text-muted-foreground">Now: {ITEM_STATUS_META[item.status].label}</p></article>)}</div>{items.length === 0 && <p className="mt-5 rounded-2xl bg-muted/60 p-4 text-sm text-muted-foreground">The BOQ does not have items yet.</p>}{typeof limit === "number" && items.length > limit && <p className="mt-4 text-sm font-bold text-primary">+ {items.length - limit} more items in this BOQ</p>}</section>;
}
