import { useRef, useState } from "react";
import type { AppUser, Project } from "@/types";
import { resubmitInitialPayment } from "@/data/actions";
import { commit } from "@/data/store";
import { sharedWorkspaceStatus, waitForSharedWorkspaceSave } from "@/data/cloudSync";
import { uploadPaymentProof } from "@/lib/firebaseFiles";
import { toast } from "sonner";

export function PaymentCorrection({ project, user }: { project: Project; user: AppUser }) {
  const [amount, setAmount] = useState(String(project.initialPayment?.amount ?? ""));
  const [reference, setReference] = useState(project.initialPayment?.reference ?? "");
  const [proof, setProof] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [staged, setStaged] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const allowed = user.role === "CLIENT" && user.clientId === project.clientId && !project.adminAcceptedAt && ["REJECTED", "ON_HOLD"].includes(project.initialPayment?.status ?? "");
  if (!allowed && !staged) return null;
  return <section className="mt-5 rounded-3xl border bg-card p-5"><h2 className="text-xl font-extrabold">Correct payment details</h2><p className="mt-2 text-sm text-muted-foreground">Update the amount and reference, then resend this same showroom to Accounts. No new showroom is created.</p><form className="mt-4 space-y-3" onSubmit={async event => {
    event.preventDefault(); if (busy.current) return; busy.current = true; setSaving(true); setError("");
    try {
      if (!sharedWorkspaceStatus.connected) throw new Error("Wait for the shared workspace to reconnect before resending.");
      if (!staged) {
        const uploaded = proof ? await uploadPaymentProof(proof, user.uid) : undefined;
        resubmitInitialPayment(user, project.id, { amount: Number(amount), reference, proofName: uploaded?.name, proofUrl: uploaded?.url });
        setStaged(true);
      } else commit();
      await waitForSharedWorkspaceSave(); setStaged(false);
      toast.success("Corrected payment sent to Accounts", { description: "Accounts can review the updated details on the existing showroom." });
    } catch (failure) { setError(failure instanceof Error ? failure.message : "The corrected payment could not be saved."); }
    finally { busy.current = false; setSaving(false); }
  }}><fieldset disabled={saving || staged} className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-bold">Amount paid<input required type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label><label className="text-sm font-bold">Corrected UTR / reference<input required value={reference} onChange={e => setReference(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3"/></label><label className="text-sm font-bold sm:col-span-2">Corrected payment proof (optional)<input type="file" accept="image/*,.pdf" onChange={e => setProof(e.target.files?.[0] ?? null)} className="mt-1 block w-full rounded-xl border p-2"/><span className="mt-1 block text-xs font-normal text-muted-foreground">The previous screenshot is not reused for the corrected claim. A UTR is enough to resend.</span></label></fieldset>{error && <p role="alert" className="rounded-xl border border-destructive p-3 text-sm text-destructive">{error}</p>}<button disabled={saving} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">{saving ? "Sending…" : staged ? "Retry save" : "Resend to Accounts"}</button></form></section>;
}
