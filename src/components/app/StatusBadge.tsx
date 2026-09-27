import { cn } from "@/lib/utils";
import type { ItemStatus, ProjectStatus } from "@/types";
import {
  ITEM_STATUS_META,
  PROJECT_STATUS_META,
  TONE_CLASS,
  daysInStatus,
  isStale,
} from "@/lib/statuses";
import { NOW } from "@/data/repo";

export function ItemStatusBadge({ status, className }: { status: ItemStatus; className?: string }) {
  const meta = ITEM_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[meta.tone],
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  const meta = PROJECT_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[meta.tone],
        className
      )}
    >
      {meta.label}
    </span>
  );
}

/**
 * Rule ES-01 made visible: how long this item has sat, and whether that is
 * past its SLA. Amber once it is stale, so a queue can be scanned at a glance.
 */
export function SlaPill({ status, since }: { status: ItemStatus; since: string }) {
  const days = daysInStatus(since, NOW);
  const stale = isStale(status, since, NOW);
  const sla = ITEM_STATUS_META[status].slaDays;

  if (sla === null) return <span className="text-xs text-muted-foreground">—</span>;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium tabular-nums",
        stale
          ? "border-amber-300 bg-amber-50 text-amber-800"
          : "border-transparent text-muted-foreground"
      )}
      title={stale ? `Past its ${sla}-day SLA — rule ES-01` : `${days} of ${sla} days`}
    >
      {days}d{stale && <span className="font-semibold">· stale</span>}
    </span>
  );
}
