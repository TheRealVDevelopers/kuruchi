import { useState } from "react";
import { AlertTriangle, Database, RotateCcw } from "lucide-react";
import { persistence, resetToSeed, useDb } from "@/data/store";
import { formatDateTime } from "@/lib/useAction";
import { cn } from "@/lib/utils";

/**
 * Says where the data actually lives, and offers a way back to a clean slate.
 *
 * People need to know whether what they just typed survives a reload, and
 * "it depends" is not an acceptable answer in an operations tool.
 */
export function DataStatus({ className }: { className?: string }) {
  useDb();
  const [confirming, setConfirming] = useState(false);

  const mode = persistence.available
      ? {
          label: "This browser",
          detail: persistence.lastSavedAt
            ? `Saved ${formatDateTime(persistence.lastSavedAt)}. Data lives on this device only.`
            : "Changes are saved to this device as you work.",
          tone: "default" as const,
        }
      : { label: "Memory only", detail: "Storage is blocked here — work will be lost on reload.", tone: "bad" as const };

  return (
    <section className={cn("rounded-lg border bg-card p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {mode.tone === "bad"
            ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            : <Database className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
          <div className="min-w-0">
            <p className="text-sm font-bold">
              Data is stored in: <span className={cn(mode.tone === "bad" && "text-primary")}>{mode.label}</span>
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">{mode.detail}</p>
            {persistence.reason && (
              <p className="mt-1 text-xs text-amber-700">{persistence.reason}</p>
            )}
          </div>
        </div>

        {persistence.available && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset demo data
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-4 rounded-md border-2 border-primary/30 bg-primary/5 p-3.5">
          <p className="text-sm font-bold">Reset everything back to the starting data?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Every project, ticket, invoice and status change you have made on this device
            will be discarded. This cannot be undone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { resetToSeed(); setConfirming(false); }}
              className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              Yes, reset
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border bg-card px-3.5 py-2 text-sm font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
