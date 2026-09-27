import { ChevronDown } from "lucide-react";
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
  const next = ITEM_TRANSITIONS[item.status];

  if (disabled || next.length === 0) {
    return <ItemStatusBadge status={item.status} className={className} />;
  }

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        aria-label={`Move ${item.name} from ${ITEM_STATUS_META[item.status].label}`}
        value=""
        onChange={(e) => {
          const to = e.target.value as ItemStatus;
          if (!to) return;
          run(
            () => act.setItemStatus(user, item.id, to),
            `${item.name} → ${ITEM_STATUS_META[to].label}`
          );
          e.target.value = "";
        }}
        className={cn(
          "cursor-pointer appearance-none rounded-full border py-0.5 pl-2 pr-6 text-xs font-medium",
          TONE_CLASS[ITEM_STATUS_META[item.status].tone]
        )}
      >
        <option value="">{ITEM_STATUS_META[item.status].label}</option>
        {next.map((s) => (
          <option key={s} value={s}>→ {ITEM_STATUS_META[s].label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 opacity-60" />
    </div>
  );
}

/**
 * Move everything sitting at one status to the next one, in a click.
 * "All 6 chairs passed QC" is a single action, not six.
 */
export function BulkStatusBar({
  items,
  user,
  disabled,
}: {
  items: BoqItem[];
  user: AppUser;
  disabled?: boolean;
}) {
  const run = useAction();
  if (disabled) return null;

  // Group live items by status, keep only groups that have somewhere to go.
  const groups = new Map<ItemStatus, BoqItem[]>();
  items.forEach((i) => {
    if (i.status === "CANCELLED" || i.status === "HANDED_OVER") return;
    if (ITEM_TRANSITIONS[i.status].length === 0) return;
    groups.set(i.status, [...(groups.get(i.status) ?? []), i]);
  });

  if (groups.size === 0) return null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="font-bold">Move the line along</h3>
      <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
        Everything at the same stage, moved together.
      </p>
      <div className="flex flex-wrap gap-2">
        {[...groups.entries()].map(([status, group]) => {
          const target = ITEM_TRANSITIONS[status][0];
          return (
            <button
              key={status}
              type="button"
              onClick={() =>
                run(
                  () => act.setManyStatuses(user, group.map((i) => i.id), target),
                  `${group.length} line${group.length === 1 ? "" : "s"} → ${ITEM_STATUS_META[target].label}`
                )
              }
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
