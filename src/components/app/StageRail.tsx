import type { ItemStatus } from "@/types";
import { ITEM_STATUS_META, STAGES, STAGE_LABELS, type Stage } from "@/lib/statuses";
import { cn } from "@/lib/utils";

/**
 * Where a project's items actually sit, as one bar.
 *
 * This business is things moving through six stages, and until now that was
 * invisible — a percentage told you "77%" without telling you that one item is
 * stuck in production while everything else is installed. The rail shows the
 * distribution, so a stalled tail is obvious at a glance instead of buried in a
 * table.
 */

const STAGE_FILL: Record<Stage, string> = {
  PLANNING: "bg-slate-300",
  PRODUCTION: "bg-amber-400",
  DISPATCH: "bg-orange-400",
  AT_SITE: "bg-sky-400",
  INSTALLATION: "bg-indigo-400",
  COMPLETE: "bg-emerald-500",
};

const STAGE_DOT: Record<Stage, string> = {
  PLANNING: "bg-slate-400",
  PRODUCTION: "bg-amber-500",
  DISPATCH: "bg-orange-500",
  AT_SITE: "bg-sky-500",
  INSTALLATION: "bg-indigo-500",
  COMPLETE: "bg-emerald-600",
};

export function stageCounts(statuses: ItemStatus[]): Record<Stage, number> {
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
  statuses.forEach((s) => {
    if (s === "CANCELLED") return;
    counts[ITEM_STATUS_META[s].stage] += 1;
  });
  return counts;
}

export function StageRail({
  statuses,
  showLegend = false,
  height = "h-2",
  className,
}: {
  statuses: ItemStatus[];
  showLegend?: boolean;
  height?: string;
  className?: string;
}) {
  const counts = stageCounts(statuses);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) {
    return <div className={cn("rounded-full bg-muted", height, className)} />;
  }

  const segments = STAGES.map((s) => ({ stage: s, count: counts[s] })).filter((s) => s.count > 0);

  return (
    <div className={className}>
      <div className={cn("flex overflow-hidden rounded-full bg-muted", height)}>
        {segments.map(({ stage, count }) => (
          <div
            key={stage}
            className={cn(STAGE_FILL[stage], "transition-all")}
            style={{ width: `${(count / total) * 100}%` }}
            title={`${count} ${STAGE_LABELS[stage]}`}
          />
        ))}
      </div>

      {showLegend && (
        <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
          {segments.map(({ stage, count }) => (
            <li key={stage} className="flex items-center gap-1.5 text-xs">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", STAGE_DOT[stage])} />
              <span className="font-semibold tabular-nums">{count}</span>
              <span className="text-muted-foreground">{STAGE_LABELS[stage]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The same six stages as a board — the Admin dashboard's primary object.
 * Each column is a stage, sized by how much work is sitting in it, with the
 * stale count called out because that is the one that costs money.
 */
export function PipelineBoard({
  statuses,
  staleByStage,
  onSelect,
  selected,
}: {
  statuses: ItemStatus[];
  staleByStage?: Partial<Record<Stage, number>>;
  onSelect?: (stage: Stage | null) => void;
  selected?: Stage | null;
}) {
  const counts = stageCounts(statuses);
  const peak = Math.max(1, ...Object.values(counts));

  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {STAGES.map((stage) => {
        const count = counts[stage];
        const stale = staleByStage?.[stage] ?? 0;
        const isSelected = selected === stage;

        return (
          <button
            key={stage}
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(isSelected ? null : stage)}
            className={cn(
              "group flex flex-col rounded-lg border bg-card p-3 text-left transition-colors",
              onSelect && "hover:border-foreground/25",
              isSelected && "border-primary ring-1 ring-primary",
              !onSelect && "cursor-default"
            )}
          >
            <span className="eyebrow leading-tight">{STAGE_LABELS[stage]}</span>

            <span className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-extrabold tabular-nums leading-none">{count}</span>
              {stale > 0 && (
                <span className="rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-900">
                  {stale} stale
                </span>
              )}
            </span>

            {/* proportional fill — a column with nothing in it reads as empty */}
            <span className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", STAGE_FILL[stage])}
                style={{ width: `${(count / peak) * 100}%` }}
              />
            </span>
          </button>
        );
      })}
    </div>
  );
}
