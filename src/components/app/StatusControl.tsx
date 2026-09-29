import { Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import type { AppUser, BoqItem, ItemStatus } from "@/types";
import { ITEM_STATUS_META, ITEM_TRANSITIONS, TONE_CLASS } from "@/lib/statuses";
import { ItemStatusBadge } from "./StatusBadge";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { cn } from "@/lib/utils";

/**
 * The control Admin uses all day: move one item to its next state.
 *
 * Options come from the state machine, so only legal moves are ever offered —
 * you cannot skip QC or dispatch something that was never packed. Illegal moves
 * aren't hidden so much as impossible, which is the point.
 */
export function StatusControl({
  item,
  user,
  disabled,
  className,
}: {
  item: BoqItem;
  user: AppUser;
  disabled?: boolean;
  className?: string;
}) {
  const run = useAction();
  const [open, setOpen] = useState(false);
  const next = ITEM_TRANSITIONS[item.status];

  if (disabled || next.length === 0) {
    return <ItemStatusBadge status={item.status} className={className} />;
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className={cn("inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-extrabold hover:bg-card", className)}>
      Update item <ChevronRight className="h-3.5 w-3.5" />
    </button>
    {open && <div className="fixed inset-0 z-[70] flex items-end bg-black/35 p-3 sm:items-center sm:justify-center" role="dialog" aria-modal="true" aria-label={`Update ${item.name}`}>
      <section className="w-full max-w-md rounded-[2rem] bg-card p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Update one BOQ item</p><h2 className="mt-1 text-xl font-extrabold">{item.name}</h2><p className="mt-1 text-sm text-muted-foreground">{item.qty} {item.unit} · {item.zone || "Showroom"}</p></div><button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border" aria-label="Close update"><X className="h-4 w-4" /></button></div>
        <div className="mt-5 rounded-2xl bg-muted/65 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Current status</p><div className="mt-2"><ItemStatusBadge status={item.status} /></div></div>
        <p className="mt-5 text-sm font-bold">What happened next?</p><p className="mt-1 text-sm text-muted-foreground">Choose one simple update. Only valid next steps are shown.</p>
        <div className="mt-3 space-y-2">{next.map((to) => <button key={to} type="button" onClick={() => { const saved = run(() => act.setItemStatus(user, item.id, to), `${item.name} → ${ITEM_STATUS_META[to].label}`); if (saved) setOpen(false); }} className="flex min-h-14 w-full items-center justify-between rounded-2xl border bg-background px-4 text-left transition hover:border-primary hover:bg-primary/5"><span><span className="block font-extrabold">{ITEM_STATUS_META[to].label}</span><span className="mt-0.5 block text-xs text-muted-foreground">Set this item as {ITEM_STATUS_META[to].label.toLowerCase()}.</span></span><span className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span></button>)}</div>
      </section>
    </div>}
  </>;
}

/**
 * Move everything sitting at one status to the next one, in a click.
 * "All 6 chairs passed QC" is a single action, not six.
 */
export function BulkStatusBar({
  items,
  selectedIds = [],
  onClear,
  user,
  disabled,
}: {
  items: BoqItem[];
  selectedIds?: string[];
  onClear?: () => void;
  user: AppUser;
  disabled?: boolean;
}) {
  const run = useAction();
  if (disabled) return null;

  const selected = items.filter((item) => selectedIds.includes(item.id));
  const working = selected.length ? selected : items;
  // Group live items by status, keep only groups that have somewhere to go.
  const groups = new Map<ItemStatus, BoqItem[]>();
  working.forEach((i) => {
    if (i.status === "CANCELLED" || i.status === "HANDED_OVER") return;
    if (ITEM_TRANSITIONS[i.status].length === 0) return;
    groups.set(i.status, [...(groups.get(i.status) ?? []), i]);
  });

  if (groups.size === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-bold">Move the line along</h3>
      <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
        {selected.length ? `${selected.length} selected line${selected.length === 1 ? "" : "s"}. Choose a valid next step.` : "Everything at the same stage, moved together."}
      </p>
      {selected.length > 0 && <button type="button" onClick={onClear} className="mb-3 rounded-md border px-3 py-1.5 text-xs font-bold">Clear selection</button>}
      <div className="flex flex-wrap gap-2">
        {[...groups.entries()].map(([status, group]) => {
          const target = ITEM_TRANSITIONS[status][0];
          return (
            <button
              key={status}
              type="button"
              onClick={() => { let detail = ""; run(() => { const result = act.setManyStatuses(user, group.map((i) => i.id), target); detail = result.notMoved.length ? `${result.moved.length} moved; ${result.notMoved.map((entry) => `${entry.name}: ${entry.reason}`).join(" · ")}` : `${result.moved.length} moved to ${ITEM_STATUS_META[target].label}`; }, "Status update complete", detail); }}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
            >
              <span className={cn(
                "rounded-full border px-1.5 py-0.5 text-[11px]",
                TONE_CLASS[ITEM_STATUS_META[status].tone]
              )}>
                {group.length}
              </span>
              {ITEM_STATUS_META[status].label}
              <span className="text-muted-foreground">→</span>
              {ITEM_STATUS_META[target].label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
