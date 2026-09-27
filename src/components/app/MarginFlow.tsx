import type { LineMoney } from "@/lib/money";
import { formatCompactINR, formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Where the revenue actually went, as one bar.
 *
 * Four separate stat boxes told you revenue, cost, margin and erosion but never
 * showed the relationship between them. This splits every rupee of revenue into
 * the four things that consume it, so "we quoted 35% and made 26%" stops being
 * two numbers and becomes a visible gap.
 */

const SEGMENTS = [
  { key: "base", label: "Base cost", fill: "bg-stone-400", note: "what we paid the factory or vendor" },
  { key: "freight", label: "Freight", fill: "bg-amber-400", note: "transport allocated to the line" },
  { key: "install", label: "Installation", fill: "bg-sky-400", note: "crew cost allocated to the line" },
  { key: "rework", label: "Rework", fill: "bg-primary", note: "damage, replacement, repair" },
  { key: "margin", label: "Real margin", fill: "bg-emerald-500", note: "what Kurchi actually kept" },
] as const;

export function MarginFlow({ money, className }: { money: LineMoney; className?: string }) {
  const revenue = Math.max(1, money.revenue);

  const values: Record<string, number> = {
    base: money.baseCost,
    freight: money.transport,
    install: money.install,
    rework: money.rework,
    margin: Math.max(0, money.realMargin),
  };

  const quotedPct = money.revenue ? (money.quotedMargin / money.revenue) * 100 : 0;
  const realPct = money.marginPct;

  return (
    <div className={cn("rounded-lg border bg-card p-4 sm:p-5", className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="eyebrow">Every rupee of revenue</p>
          <p className="figure-lg mt-1">{formatCompactINR(money.revenue)}</p>
        </div>
        <div className="text-right">
          <p className="eyebrow">Quoted → real margin</p>
          <p className="mt-1 flex items-baseline justify-end gap-2">
            <span className="text-lg font-bold tabular-nums text-muted-foreground line-through decoration-2">
              {quotedPct.toFixed(1)}%
            </span>
            <span className="text-2xl font-extrabold tabular-nums text-emerald-700">
              {realPct.toFixed(1)}%
            </span>
          </p>
        </div>
      </div>

      {/* the bar */}
      <div className="mt-4 flex h-9 overflow-hidden rounded-md">
        {SEGMENTS.map((s) => {
          const pct = (values[s.key] / revenue) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={s.key}
              className={cn(s.fill, "relative grid place-items-center transition-all")}
              style={{ width: `${pct}%` }}
              title={`${s.label} — ${formatINR(values[s.key])} (${pct.toFixed(1)}%)`}
            >
              {pct > 9 && (
                <span className={cn(
                  "px-1 text-[11px] font-bold tabular-nums",
                  s.key === "base" ? "text-stone-900" : "text-white"
                )}>
                  {pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* legend */}
      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-5">
        {SEGMENTS.map((s) => (
          <div key={s.key} className="min-w-0">
            <dt className="flex items-center gap-1.5">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-sm", s.fill)} />
              <span className="truncate text-xs font-semibold">{s.label}</span>
            </dt>
            <dd className="mt-0.5 pl-4 text-sm font-bold tabular-nums">
              {formatCompactINR(values[s.key])}
            </dd>
          </div>
        ))}
      </dl>

      {money.erosion > 0 && (
        <p className="mt-4 rounded-md border-l-[3px] border-primary bg-primary/5 px-3 py-2.5 text-sm">
          <strong className="font-bold">{formatCompactINR(money.erosion)} of expected margin is gone</strong>
          {" — "}
          <span className="text-muted-foreground">
            discount given away, freight under-estimated and rework absorbed. That is{" "}
            {money.quotedMargin ? ((money.erosion / money.quotedMargin) * 100).toFixed(0) : "0"}% of
            what the quote promised.
          </span>
        </p>
      )}
    </div>
  );
}
