import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo, NOW } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate } from "@/lib/useAction";
import { PageHeader, StatCard, EmptyState, StatStrip } from "@/components/app/Shell";
import { RuleTag } from "@/components/app/RuleGate";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { TicketCause, TicketDecision } from "@/types";

const CAUSES: Array<{ id: TicketCause; label: string; lands: string }> = [
  { id: "TRANSIT", label: "Transit", lands: "Claim on the transporter" },
  { id: "MANUFACTURING", label: "Manufacturing", lands: "Cost to production; QC flag" },
  { id: "HANDLING_AT_SITE", label: "Site handling", lands: "Cost to the installation vendor" },
  { id: "SHORT_SUPPLY", label: "Short supply", lands: "Packing error; re-dispatch" },
];

const DECISIONS: Array<{ id: TicketDecision; label: string; note: string }> = [
  { id: "REPLACE", label: "Replace", note: "Spawns a linked item into production, books full rework" },
  { id: "REPAIR", label: "Repair", note: "Books ~30% of base price as rework" },
  { id: "WAIVE", label: "Waive", note: "Client accepts as-is; no cost booked" },
];

export default function TicketsQueuePage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [open, setOpen] = useState<string | null>(null);
  if (!user) return null;

  const all = repo.tickets();
  const projects = repo.projects(user);
  const openTickets = all.filter((t) => t.status !== "RESOLVED");
  const untriaged = openTickets.filter((t) => !t.decision);
  const totalRework = all.reduce((s, t) => s + t.costImpact, 0);

  return (
    <>
      <PageHeader
        eyebrow="Quality"
        title="Damage & shortage"
        description="Triage decides who carries the cost. That choice is the difference between knowing your margin and guessing it."
      />

      <StatStrip>
        <StatCard label="Open" value={openTickets.length} tone={openTickets.length ? "warn" : "default"} />
        <StatCard label="Awaiting triage" value={untriaged.length} tone={untriaged.length ? "bad" : "default"} />
        <StatCard label="Rework booked" value={formatINR(totalRework)} tone={totalRework ? "bad" : "default"} />
        <StatCard label="Resolved" value={all.length - openTickets.length} tone="good" />
      </StatStrip>

      {all.length === 0 ? (
        <EmptyState title="No tickets" hint="Nothing has been reported damaged or short." />
      ) : (
        <div className="space-y-4">
          {all.map((t) => {
            const project = projects.find((p) => p.id === t.projectId);
            const item = repo.itemById(t.itemId);
            const ageDays = Math.floor((NOW.getTime() - new Date(t.reportedAt).getTime()) / 86_400_000);
            return (
              <section key={t.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold">
                      {t.type === "DAMAGE" ? "Damage" : "Shortage"} · {item?.name ?? t.itemId}
                      <span className="ml-1.5 font-normal text-muted-foreground">×{t.qtyAffected}</span>
                    </h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      <Link to={`/admin/projects/${t.projectId}?tab=site`} className="hover:underline">
                        {project?.site.city}
                      </Link>{" "}
                      · {t.reportedBy} · {formatDate(t.reportedAt)} · {ageDays}d old
                    </p>
                    <p className="mt-2 text-sm">{t.note}</p>
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Camera className="h-3.5 w-3.5" />
                      {t.photos.length} photo{t.photos.length === 1 ? "" : "s"} on file
                      {t.photos.length > 0 && <RuleTag id="ST-02" />}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-xs font-semibold",
                      t.status === "RESOLVED"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : t.decision
                          ? "border-sky-200 bg-sky-50 text-sky-800"
                          : "border-red-200 bg-red-50 text-red-700"
                    )}>
                      {t.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                    {t.costImpact > 0 && (
                      <span className="text-xs font-semibold text-primary">
                        {formatINR(t.costImpact)} rework
                      </span>
                    )}
                  </div>
                </div>

                {t.decision ? (
                  <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-sm">
                    <span className="text-muted-foreground">
                      Decided <strong className="text-foreground">{t.decision.toLowerCase()}</strong>, cause{" "}
                      <strong className="text-foreground">{t.cause.replace(/_/g, " ").toLowerCase()}</strong>
                      {t.replacementItemId && " · replacement is back in production"}
                    </span>
                    {t.status !== "RESOLVED" && (
                      <button
                        type="button"
                        onClick={() => run(() => act.resolveTicket(user, t.id), "Ticket resolved")}
                        className="rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-muted"
                      >
                        Mark resolved
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 border-t pt-3">
                    {open === t.id ? (
                      <TriageForm
                        defaultCause={t.cause}
                        onCancel={() => setOpen(null)}
                        onConfirm={(decision, cause) => {
                          const ok = run(
                            () => act.triageTicket(user, t.id, decision, cause),
                            `Ticket triaged — ${decision.toLowerCase()}`,
                            decision === "REPLACE" ? "Replacement created and rework booked to the project." : undefined
                          );
                          if (ok) setOpen(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpen(t.id)}
                        className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Triage
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function TriageForm({
  defaultCause,
  onConfirm,
  onCancel,
}: {
  defaultCause: TicketCause;
  onConfirm: (d: TicketDecision, c: TicketCause) => void;
  onCancel: () => void;
}) {
  const [cause, setCause] = useState<TicketCause>(defaultCause);
  const [decision, setDecision] = useState<TicketDecision>("REPLACE");

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Cause — decides who carries the cost
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {CAUSES.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCause(c.id)}
              aria-pressed={cause === c.id}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                cause === c.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
              )}
            >
              <span className="font-semibold">{c.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{c.lands}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Decision
        </legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {DECISIONS.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setDecision(d.id)}
              aria-pressed={decision === d.id}
              className={cn(
                "rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                decision === d.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted"
              )}
            >
              <span className="font-semibold">{d.label}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{d.note}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onConfirm(decision, cause)}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Confirm — {decision.toLowerCase()}
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
          Cancel
        </button>
      </div>
    </div>
  );
}
