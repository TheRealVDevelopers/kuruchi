import { useRef, useState, type FormEvent } from "react";
import { Pencil, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/AuthContext";
import { renameInvoice } from "@/data/actions";
import { repo } from "@/data/repo";
import { commit } from "@/data/store";
import { sharedWorkspaceStatus, waitForSharedWorkspaceSave } from "@/data/cloudSync";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Invoice } from "@/types";

export function InvoiceNumberDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  const { user } = useAuth();
  const [original] = useState(invoice.number);
  const [number, setNumber] = useState(invoice.number);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const applied = useRef(false);
  if (user?.role !== "ACCOUNTS") return null;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user || busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      if (!sharedWorkspaceStatus.connected) throw new Error("Reconnect to the shared workspace before saving this invoice number.");
      if (applied.current) {
        if (repo.invoices().find((entry) => entry.id === invoice.id)?.number !== number.trim().toUpperCase()) throw new Error("The invoice changed while saving. Reload the current invoice before trying again.");
        commit();
      } else {
        renameInvoice(user, invoice.id, number, original);
        applied.current = true; setPending(true);
      }
      await waitForSharedWorkspaceSave();
      toast.success("Invoice number updated", { description: "The updated number is available in Accounts and the franchisee workspace." });
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The updated number could not be confirmed. Please retry.");
    } finally {
      busy.current = false; setSaving(false);
    }
  }

  return <Dialog open onOpenChange={(open) => { if (!open && !busy.current) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl">
      <DialogHeader><span className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><Pencil className="h-5 w-5"/></span><DialogTitle>Edit invoice number</DialogTitle><DialogDescription>Update the number shown in Accounts, receipts and the franchisee’s invoice. An audit record keeps the previous number.</DialogDescription></DialogHeader>
      <form onSubmit={(event) => void save(event)} className="space-y-4">
        <p className="rounded-xl bg-muted/50 p-3 text-sm"><span className="text-muted-foreground">Current number: </span><b className="break-all">{original}</b></p>
        <label className="block text-sm font-bold" htmlFor="edit-invoice-number">New invoice number<input id="edit-invoice-number" required maxLength={64} autoComplete="off" value={number} disabled={saving || pending} onChange={(event) => setNumber(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border bg-background px-3 font-mono font-normal disabled:opacity-60"/></label>
        <p className="text-xs text-muted-foreground">Letters, numbers, slashes and hyphens are supported. Each invoice number must be unique.</p>
        {error && <div role="alert" className="space-y-2 rounded-xl border border-destructive/25 bg-destructive/5 p-3 text-sm"><p>{error}</p>{pending && <button type="button" onClick={() => window.location.reload()} className="min-h-9 font-bold text-primary">Reload current invoice</button>}</div>}
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border px-4 text-sm font-bold">Cancel</button><button type="submit" disabled={saving || (!pending && number.trim().toUpperCase() === original)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:opacity-50"><Save className="h-4 w-4"/>{saving ? "Saving…" : pending ? "Retry save" : "Save invoice number"}</button></div>
      </form>
    </DialogContent>
  </Dialog>;
}
