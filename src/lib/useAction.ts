import { useCallback } from "react";
import { toast } from "sonner";
import { RuleError, SellerProfileRequiredError } from "@/data/actions";
import { useSellerProfilePrompt } from "@/lib/sellerProfilePrompt";

/**
 * Runs a store action and reports the outcome.
 *
 * Missing seller details open the setup prompt. Other business-rule failures
 * show their reason and rule ID in a toast.
 */
export function useAction() {
  const promptSellerProfile = useSellerProfilePrompt();
  return useCallback(
    (fn: () => void, successMessage?: string, successDetail?: string) => {
      try {
        fn();
        if (successMessage) toast.success(successMessage, { description: successDetail });
        return true;
      } catch (err) {
        if (err instanceof SellerProfileRequiredError) {
          promptSellerProfile();
        } else if (err instanceof RuleError) {
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
    [promptSellerProfile]
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
