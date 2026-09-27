import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { STAGES, STAGE_LABELS, type Stage } from "@/lib/statuses";
import { Check } from "lucide-react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        <h1 className="text-2xl leading-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-1.5">{actions}</div>}
    </div>
  );
}

/**
 * A figure in the instrument strip.
 *
 * These sit shoulder to shoulder in a ruled row rather than as separate floating
 * cards — on a terminal the numbers are one panel, not six objects. Only a tile
 * with something wrong takes a colour.
 */
export function StatCard({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card px-4 py-4 shadow-sm",
        tone === "good" && "bg-emerald-50/50",
        tone === "warn" && "bg-amber-50/60",
        tone === "bad" && "bg-red-50/50"
      )}
    >
      <p className="eyebrow">{label}</p>
      <p
        className={cn(
          "figure mt-1",
          tone === "good" && "text-emerald-700",
          tone === "warn" && "text-amber-700",
          tone === "bad" && "text-primary"
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** Wraps a row of StatCards into one ruled instrument strip. */
export function StatStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4",
        className
      )}
    >
      {children}
    </div>
  );
}

export function SectionHead({
  title,
  count,
  hint,
  icon,
  action,
}: {
  title: string;
  count?: number;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        {icon}
        <h2 className="text-[15px] font-bold">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-primary">
            {count}
          </span>
        )}
        {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="rounded border border-dashed bg-card px-4 py-8 text-center">
      <p className="text-[13px] font-bold">{title}</p>
      {hint && <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">{hint}</p>}
      {action && <div className="mt-3 flex justify-center">{action}</div>}
    </div>
  );
}

/** The client-facing progress tracker. No internal statuses leak into it. */
export function StageTracker({ current, progress }: { current: Stage; progress: number }) {
  const idx = STAGES.indexOf(current);
  return (
    <div>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
        {STAGES.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s} className="flex items-center gap-1">
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 text-[11px] font-bold",
                  done && "border-emerald-300 bg-emerald-50 text-emerald-800",
                  active && "border-primary bg-primary text-primary-foreground",
                  !done && !active && "border-dashed text-muted-foreground"
                )}
              >
                {done && <Check className="h-2.5 w-2.5" />}
                {STAGE_LABELS[s]}
              </span>
              {i < STAGES.length - 1 && (
                <span className="text-muted-foreground/40" aria-hidden>›</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted">
          <div
            className="h-full bg-primary transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-[13px] font-bold tabular-nums">{progress}%</span>
      </div>
    </div>
  );
}
