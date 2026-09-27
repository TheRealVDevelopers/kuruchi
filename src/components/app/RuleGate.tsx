import type { ReactNode } from "react";
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RuleVerdict } from "@/lib/rules";

/**
 * Wraps an action and, when a business rule blocks it, says WHICH rule and WHY.
 *
 * A greyed-out button with no explanation is the single fastest way to get
 * people working around a system. Every gate in docs/02-workflow.md renders
 * through here.
 */
export function RuleGate({
  verdict,
  children,
  onOverride,
  className,
}: {
  verdict: RuleVerdict;
  children: ReactNode;
  /** offered only when the rule is overridable and the user is Admin */
  onOverride?: () => void;
  className?: string;
}) {
  if (verdict.ok && verdict.blockedBy.length === 0) {
    return <div className={className}>{children}</div>;
  }

  // Passed, but with a caveat the user must see (e.g. IN-07 minor-snag waiver).
  if (verdict.ok) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            {verdict.reasons.map((r, i) => (
              <p key={i}>
                {r}{" "}
                <RuleTag id={verdict.blockedBy[i] ?? verdict.blockedBy[0]} tone="warn" />
              </p>
            ))}
          </div>
        </div>
        {children}
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="rounded-md border border-red-200 bg-red-50 p-3">
        <div className="flex items-start gap-2 text-sm text-red-900">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1.5">
            <p className="font-medium">
              Blocked by {verdict.blockedBy.length} rule
              {verdict.blockedBy.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-1">
              {verdict.reasons.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-1.5">
                  <RuleTag id={verdict.blockedBy[i]} tone="stop" />
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {verdict.overridable && onOverride && (
          <button
            type="button"
            onClick={onOverride}
            className="mt-3 inline-flex items-center gap-1.5 rounded border border-red-300 bg-white px-2.5 py-1 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Override with a written reason
          </button>
        )}
      </div>
      <div className="pointer-events-none opacity-40">{children}</div>
    </div>
  );
}

export function RuleTag({ id, tone = "neutral" }: { id: string; tone?: "neutral" | "warn" | "stop" }) {
  return (
    <code
      className={cn(
        "rounded px-1.5 py-0.5 font-mono text-[11px] font-medium",
        tone === "stop" && "bg-red-100 text-red-800",
        tone === "warn" && "bg-amber-100 text-amber-900",
        tone === "neutral" && "bg-muted text-muted-foreground"
      )}
    >
      {id}
    </code>
  );
}
