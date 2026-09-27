import { EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";
import { canSeeCost, canSeeSellingPrice } from "@/lib/rules";
import { formatINR } from "@/lib/money";

type Kind = "cost" | "selling" | "margin";

/**
 * Role-aware money. Rules AC-02 and AC-03.
 *
 * This component never receives a value it should not show — repo.redactItem
 * strips it first. This is the second line of defence, and the visible one:
 * if a field is hidden, the reader is told it exists rather than seeing a zero.
 */
export function MoneyField({
  value,
  role,
  kind,
  className,
  showHidden = false,
}: {
  value: number | undefined;
  role: Role;
  kind: Kind;
  className?: string;
  /** render a "hidden" marker instead of nothing — useful in tables */
  showHidden?: boolean;
}) {
  const allowed =
    kind === "selling" ? canSeeSellingPrice(role) : canSeeCost(role);

  if (!allowed || value === undefined) {
    if (!showHidden) return <span className="text-muted-foreground">—</span>;
    return (
      <span
        className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground", className)}
        title="Hidden for your role — rules AC-02 / AC-03"
      >
        <EyeOff className="h-3 w-3" />
        hidden
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums", className)}>{formatINR(value)}</span>
  );
}

export function MarginPill({ pct, className }: { pct: number; className?: string }) {
  const tone =
    pct < 0 ? "bg-red-50 text-red-700 border-red-200"
      : pct < 15 ? "bg-amber-50 text-amber-800 border-amber-300"
      : "bg-emerald-50 text-emerald-700 border-emerald-200";
  return (
    <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-xs font-medium tabular-nums", tone, className)}>
      {pct.toFixed(1)}%
    </span>
  );
}
