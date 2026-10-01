import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteWorkspaceUsers, maintenanceError } from "@/lib/workspaceMaintenance";
import type { AppUser } from "@/types";

export default function DeleteUsersDialog({ users, onClose, onDeleted }: { users: AppUser[]; onClose: () => void; onDeleted: (uids: string[]) => void }) {
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const remaining = users.filter((u) => !removed.includes(u.uid));
  const remove = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || confirmation !== "DELETE USERS" || !remaining.length) return;
    setBusy(true); setError(null);
    try {
      const result = await deleteWorkspaceUsers(remaining.map((u) => u.uid), confirmation);
      setRemoved((current) => [...current, ...result.deleted]); onDeleted(result.deleted);
      if (result.failed.length) setError(`${result.failed.length} accounts could not be deleted. They are disabled; retry here.`);
      else { toast.success(`${result.deleted.length} user accounts deleted`); onClose(); }
    } catch (err) { setError(maintenanceError(err)); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] overflow-y-auto rounded-3xl" onEscapeKeyDown={(event) => { if (busy) event.preventDefault(); }} onPointerDownOutside={(event) => { if (busy) event.preventDefault(); }}>
    <DialogHeader><DialogTitle>Delete {remaining.length} user accounts?</DialogTitle><DialogDescription>These people will lose email and mobile sign-in to this workspace. Historical project records remain. This cannot be undone.</DialogDescription></DialogHeader>
    <ul className="max-h-48 space-y-2 overflow-y-auto rounded-xl border p-3 text-sm">{remaining.map((u) => <li key={u.uid}><p className="font-bold">{u.name}</p><p className="text-muted-foreground">{u.email || u.phone || u.uid}</p></li>)}</ul>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <form onSubmit={remove} className="space-y-4"><label className="block text-sm font-bold">Type DELETE USERS to continue<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" disabled={busy} className="mt-2 min-h-12 w-full rounded-xl border bg-background px-3" /></label><div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-xl border px-4 text-sm font-bold">Cancel</button><button disabled={busy || confirmation !== "DELETE USERS" || !remaining.length} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">{busy ? "Deleting accounts…" : "Delete permanently"}</button></div></form>
  </DialogContent></Dialog>;
}
