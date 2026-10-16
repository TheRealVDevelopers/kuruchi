import { useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { commit, useDb } from "@/data/store";
import { sharedWorkspaceStatus, waitForSharedWorkspaceSave } from "@/data/cloudSync";
import { formatINR } from "@/lib/money";
import * as act from "@/data/actions";
import { IS_LOCAL_DEMO } from "@/lib/demoMode";

export function PaymentApprovalTasks({ projectId }: { projectId?: string }) {
  useDb();
  const { user } = useAuth();
  const [savingApproval, setSavingApproval] = useState<string | null>(null);
  const [pendingApprovals, setPendingApprovals] = useState<string[]>([]);
  const approving = useRef(false);
  const pendingDecisions = useRef<Record<string, "APPROVE" | "DENY" | "HOLD">>({});
  if (!user) return null;
  const projects = repo.projects(user);
  const selectedProject = projectId ? projects.find((project) => project.id === projectId) : undefined;
  const approvals = projects.filter((project) => (!projectId || project.id === projectId) && (["PENDING_VERIFICATION", "ON_HOLD"].includes(project.initialPayment?.status ?? "") || pendingApprovals.includes(project.id)));
  const approvePayment = async (projectId: string, requestedDecision: "APPROVE" | "DENY" | "HOLD" = "APPROVE") => {
    if (approving.current) return;
    const decision = pendingDecisions.current[projectId] ?? requestedDecision;
    let reason = "";
    if (!pendingDecisions.current[projectId] && decision !== "APPROVE") {
      const answer = window.prompt(decision === "DENY" ? "Why are you denying this payment? Ola will see this reason." : "Why is this payment on hold? Ola will see this reason.");
      if (answer === null) return;
      reason = answer.trim();
      if (!reason) { toast.error("A reason is required"); return; }
    }
    approving.current = true;
    setSavingApproval(projectId);
    try {
      if (!IS_LOCAL_DEMO && !sharedWorkspaceStatus.connected) throw new Error("The shared workspace is not connected. Reconnect before approving this payment.");
      const project = repo.projectById(user, projectId);
      if (!project?.initialPayment) throw new Error("Payment request not found. Refresh the page.");
      if (pendingDecisions.current[projectId]) {
        commit(); // Retry the shared save, not the receipt or approval action.
      } else if (["PENDING_VERIFICATION", "ON_HOLD"].includes(project.initialPayment.status)) {
        if (decision === "HOLD") act.holdInitialPayment(user, projectId, reason);
        else act.verifyInitialPayment(user, projectId, decision === "APPROVE", reason);
        pendingDecisions.current[projectId] = decision;
      } else throw new Error("This payment is no longer waiting for approval. Refresh the page.");
      setPendingApprovals((current) => [...new Set([...current, projectId])]);
      await waitForSharedWorkspaceSave();
      setPendingApprovals((current) => current.filter((id) => id !== projectId));
      delete pendingDecisions.current[projectId];
      toast.success(decision === "APPROVE" ? "Payment approved" : decision === "DENY" ? "Payment denied" : "Payment put on hold", { description: decision === "APPROVE" ? "Kurchi Admin can now accept this showroom." : "Ola has been notified. Admin cannot start this showroom." });
    } catch (error) {
      toast.error("Approval not confirmed", { description: error instanceof Error ? error.message : "Please retry the approval." });
    } finally {
      approving.current = false;
      setSavingApproval(null);
    }
  };

  if (selectedProject && !approvals.length) return <p className="rounded-2xl bg-muted/55 p-4 text-sm"><b>{selectedProject.name}</b> · Payment status: {selectedProject.initialPayment?.status.replaceAll("_", " ").toLowerCase() ?? "not submitted"}. No verification is pending.</p>;
  return <>{approvals.length ? approvals.map((p) => <article key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-background p-4"><div><b>{p.name}</b><p className="mt-1 text-sm text-muted-foreground">{formatINR(p.initialPayment!.amount)} · {p.initialPayment!.percentage}% · UTR {p.initialPayment!.reference}</p>{p.initialPayment!.status === "ON_HOLD" && <p className="mt-2 text-sm font-bold text-primary">On hold: {p.initialPayment!.holdReason}</p>}{p.initialPayment!.status === "REJECTED" && <p className="mt-2 text-sm font-bold text-primary">Denied: {p.initialPayment!.rejectionReason}</p>}</div><div className="flex flex-wrap gap-2"><button disabled={Boolean(savingApproval)} onClick={() => void approvePayment(p.id)} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground">{savingApproval === p.id ? "Saving approval…" : pendingApprovals.includes(p.id) ? "Retry saving decision" : "Approve payment"}</button>{!pendingApprovals.includes(p.id) && <><button disabled={Boolean(savingApproval)} onClick={() => void approvePayment(p.id, "DENY")} className="min-h-11 rounded-xl border px-4 text-sm font-bold text-destructive">Deny payment</button><button disabled={Boolean(savingApproval)} onClick={() => void approvePayment(p.id, "HOLD")} className="min-h-11 rounded-xl border px-4 text-sm font-bold">Put on hold</button></>}</div></article>) : <Empty icon={<CheckCircle2/>} title="No payment approval waiting" hint="New Ola payment references appear here automatically."/>}</>;
}
function Empty({ title, hint }: { icon?: React.ReactNode; title: string; hint: string }) { return <div className="rounded-2xl bg-muted/55 p-4 text-sm"><CheckCircle2 className="text-primary"/><p className="mt-2 font-bold">{title}</p><p className="mt-1 text-muted-foreground">{hint}</p></div>; }
