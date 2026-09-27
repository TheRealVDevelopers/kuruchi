import { useCallback } from "react";
import { toast } from "sonner";
import { RuleError } from "@/data/actions";

/**
 * Runs a store action and reports the outcome.
 *
 * A RuleError is not a crash — it is the system declining, and the reason is
 * worth showing verbatim along with the rule id, so people learn the rule
 * instead of hunting for a workaround.
 */
export function useAction() {
  return useCallback(
    (fn: () => void, successMessage?: string, successDetail?: string) => {
      try {
        fn();
        if (successMessage) toast.success(successMessage, { description: successDetail });
        return true;
      } catch (err) {
        if (err instanceof RuleError) {
          toast.error("Blocked", {
            description: err.rules.length ? `${err.rules.join(", ")} — ${err.message}` : err.message,
          });
        } else {
          toast.error("Something went wrong", {
            description: err instanceof Error ? err.message : String(err),
          });
        }
        return false;
      }
    },
    []
  );
}

export function formatDate(iso?: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", opts);
}

export function formatDateTime(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  });
}
