import { useCallback, useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { manageWorkspaceData, maintenanceError, RECORD_LABELS, type CleanupPreview, type CleanupScope } from "@/lib/workspaceMaintenance";

export default function DeleteDataDialog({ scope, projectIds = [], onClose, onDeleted }: {
  scope: CleanupScope; projectIds?: string[]; onClose: () => void; onDeleted?: () => void;
}) {
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const ids = JSON.stringify(projectIds);
  const loadPreview = useCallback(async () => {
    setLoading(true); setPreview(null); setConfirmation(""); setError(null);
    try { setPreview(await manageWorkspaceData(scope, JSON.parse(ids))); }
    catch (err) { setError(maintenanceError(err)); }
    finally { setLoading(false); }
  }, [scope, ids]);
  useEffect(() => { void loadPreview(); }, [loadPreview]);
  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!preview || busy || confirmation !== preview.confirmation) return;
    setBusy(true); setError(null);
    try {
      const result = await manageWorkspaceData(scope, JSON.parse(ids), preview, confirmation);
      toast.success(scope === "CLEAR_WORKSPACE" ? "Workspace work data cleared" : "Selected projects deleted", { description: `${result.total} records removed from the shared workspace.` });
      onDeleted?.(); onClose();
    } catch (err) { setError(maintenanceError(err)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
      <DialogHeader><DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5 text-primary" />{scope === "CLEAR_WORKSPACE" ? "Start with a clean workspace" : "Delete selected projects"}</DialogTitle>
        <DialogDescription>This removes shared records for everyone, not just this browser. It cannot be undone in the app.</DialogDescription></DialogHeader>
      {loading && <p role="status" className="text-sm text-muted-foreground">Checking the latest saved records…</p>}
      {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}<button type="button" disabled={busy} onClick={() => void loadPreview()} className="ml-2 font-bold underline">Refresh preview</button></div>}
      {preview && <form onSubmit={remove} className="space-y-4">
        {preview.projects.length > 0 && <p className="rounded-xl bg-muted p-3 text-sm font-bold">{preview.projects.map((p) => p.code || p.name).join(", ")}</p>}
        <div className="rounded-2xl border p-4"><p className="mb-3 text-sm font-extrabold">{preview.total} records will be removed</p>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">{Object.entries(preview.counts).filter(([, count]) => count > 0).map(([key, count]) => <div key={key} className="flex justify-between gap-2"><dt className="text-muted-foreground">{RECORD_LABELS[key] || key}</dt><dd className="font-bold">{count}</dd></div>)}</dl>
        </div>
        <p className="text-sm text-muted-foreground">{scope === "CLEAR_WORKSPACE" ? "Your company GST, bank details, document numbering, and real user logins are kept. Delete unwanted logins separately in Users. Add the real Ola account and partners again before assigning users to them." : "Company details, catalogue, BOQ kits and user logins are kept. All records belonging to these projects—including amounts and advances—are removed."} Uploaded files remain in Firebase Storage; this removes their app records.</p>
        <label className="block text-sm font-bold">Type <span className="text-primary">{preview.confirmation}</span> to continue<input autoComplete="off" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border bg-background px-3" /></label>
        <div className="flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onClose} className="min-h-11 rounded-xl border px-4 text-sm font-bold">Cancel</button><button disabled={busy || confirmation !== preview.confirmation} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">{busy ? "Deleting…" : "Delete permanently"}</button></div>
      </form>}
    </DialogContent>
  </Dialog>;
}
