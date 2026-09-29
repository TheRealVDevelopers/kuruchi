import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Camera, EyeOff, MessageCircle, Send, ShieldCheck } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate } from "@/lib/useAction";
import { EmptyState, PageHeader, StageTracker } from "@/components/app/Shell";
import { StageRail } from "@/components/app/StageRail";
import { ItemStatusBadge } from "@/components/app/StatusBadge";
import { RuleGate } from "@/components/app/RuleGate";
import { PhotoCapture } from "@/components/app/SiteKit";
import { canRaiseHandover } from "@/lib/rules";
import { formatINR } from "@/lib/money";
import { ITEM_STATUS_META, STAGES, projectProgress, type Stage } from "@/lib/statuses";
import { cn } from "@/lib/utils";
import type { SnagSeverity } from "@/types";

const TABS = ["progress", "activity", "timeline", "scope", "deliveries", "documents", "messages", "snags", "handover"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  progress: "Progress", activity: "Activity", timeline: "Timeline", scope: "Scope", deliveries: "Deliveries",
  documents: "Documents", messages: "Messages", snags: "Snags", handover: "Handover",
};

export default function PortalProjectPage() {
  useDb();
  const { projectId = "" } = useParams();
  const { user } = useAuth();
  const run = useAction();
  const [tab, setTab] = useState<Tab>("progress");
  const [message, setMessage] = useState("");

  const project = repo.projectById(user, projectId);
  if (!project || !user) return <EmptyState title="Project not found" />;

  // AC-02 — redacted at the data boundary: no cost, no vendor, no margin.
  const items = repo.items(project.id, user.role);
  const rawItems = repo.itemsRaw(project.id);
  const progress = projectProgress(rawItems.map((i) => i.status));
  const logs = repo.progressLogs(project.id);
  const consignments = repo.consignments(project.id);
  const snags = repo.snags(project.id);
  const signed = repo.handoverSigned(project.id);
  const clientActivity = repo.audit().map((entry) => {
    const projectEvent = entry.entity === `projects/${project.id}`;
    const itemEvent = entry.entity.startsWith("items/") && repo.itemById(entry.entity.slice(6))?.projectId === project.id;
    const shipmentEvent = entry.entity.startsWith("consignments/") && repo.consignmentById(entry.entity.slice(13))?.projectId === project.id;
    if (!projectEvent && !itemEvent && !shipmentEvent) return null;
    const text = entry.detail;
    const label = /showroom request|submitted/i.test(text) ? "Showroom request submitted" : /payment verified/i.test(text) ? "Payment verified by Accounts" : /accepted.*showroom|accepted by Kurchi/i.test(text) ? "Accepted by Kurchi" : /BOQ approved/i.test(text) ? "BOQ approved by Ola" : /in production|production started/i.test(text) ? "Production started" : /dispatch/i.test(text) ? "Shipment dispatched" : /delivered/i.test(text) ? "Delivered at site" : /installation started/i.test(text) ? "Installation started" : /handover signed/i.test(text) ? "Handover signed" : /completed|opened/i.test(text) ? "Showroom completed" : null;
    return label ? { ...entry, label } : null;
  }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry)).slice(0, 30);
  const schedule = repo.scheduleTasks(project.id);
  const documents = repo.documents(project.id).filter((document) =>
    ["BOQ", "CHALLAN", "INVOICE", "HANDOVER"].includes(document.type)
  );
  const messages = repo.comments(project.id);

  const earliest = rawItems.reduce<Stage>((acc, i) => {
    const stage = ITEM_STATUS_META[i.status].stage;
    return STAGES.indexOf(stage) < STAGES.indexOf(acc) ? stage : acc;
  }, "COMPLETE");

  return (
    <>
      <Link to="/portal" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> My showrooms
      </Link>

      <PageHeader eyebrow={project.code} title={`Ola ${project.site.city}`} description={project.site.address} />

      <section className="relative mb-5 overflow-hidden rounded-[1.5rem] border border-white/10 bg-card p-5 sm:p-6">
        <img src="/images/showroom-hero-v1.png" alt="Contemporary Kurchi showroom interior" className="absolute inset-0 h-full w-full object-cover object-right opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/25" />
        <div className="relative max-w-md"><p className="eyebrow text-primary">Your showroom journey</p><h2 className="mt-1 text-2xl font-bold">From Bengaluru workshop to {project.site.city} opening.</h2><p className="mt-2 text-sm text-muted-foreground">Track the work, delivery and installation in one clear view.</p></div>
      </section>

      <div className="mb-6 rounded-lg border bg-card p-4 sm:p-5">
        <StageTracker current={earliest} progress={progress} />
        <div className="mt-5 border-t pt-4">
          <p className="eyebrow mb-2">Where the {rawItems.length} items are</p>
          <StageRail statuses={rawItems.map((i) => i.status)} showLegend />
        </div>
      </div>

      <nav className="mb-5 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold",
              tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            )}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </nav>

      {tab === "progress" && (
        <div className="space-y-3">
          {logs.map((l) => (
            <article key={l.id} className="rounded-lg border bg-card p-4">
              <p className="text-sm">{l.note}</p>
              <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{formatDate(l.at, { day: "numeric", month: "long" })}</span>
                {l.photos.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <Camera className="h-3 w-3" /> {l.photos.length} site photos
                  </span>
                )}
              </p>
            </article>
          ))}
          {logs.length === 0 && <EmptyState title="No updates posted yet" />}
        </div>
      )}

      {tab === "activity" && <section className="rounded-lg border bg-card p-4 sm:p-5"><h3 className="font-bold">Showroom activity</h3><p className="mt-1 text-sm text-muted-foreground">Your latest showroom updates, newest first.</p><div className="mt-4 space-y-3">{clientActivity.length ? clientActivity.map((entry) => <article key={entry.id} className="border-l-2 border-primary/30 pl-3"><p className="text-sm font-bold">{entry.label}</p><p className="mt-1 text-xs text-muted-foreground">{entry.actorName} · {formatDate(entry.at, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p></article>) : <EmptyState title="No showroom activity yet" hint="Updates will appear as Kurchi moves the showroom forward." />}</div></section>}
      {tab === "timeline" && (
        <div className="space-y-3">
          {schedule.length === 0 ? <EmptyState title="Timeline is being prepared" hint="Kurchi will publish milestone dates here shortly." /> : schedule.map((task) => (
            <article key={task.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
              <div><p className="font-semibold">{task.title}</p><p className="mt-1 text-sm text-muted-foreground">Planned {formatDate(task.plannedStart)} – {formatDate(task.plannedEnd)}</p>{task.note && <p className="mt-1 text-sm text-muted-foreground">{task.note}</p>}</div>
              <span className={cn("rounded-full border px-2.5 py-1 text-xs font-bold", task.status === "DONE" ? "border-red-200 bg-red-50 text-red-700" : task.status === "BLOCKED" ? "border-red-200 bg-red-50 text-red-700" : "bg-muted text-muted-foreground")}>{task.status.replace(/_/g, " ").toLowerCase()}</span>
            </article>
          ))}
        </div>
      )}

      {tab === "scope" && (
        <>
          <p className="mb-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Cost, supplier and margin are internal to Kurchi and are not shown here.
          </p>
          <ul className="space-y-2.5 md:hidden">
            {items.map((item) => (
              <li key={item.id} className="rounded-lg border bg-card p-3.5">
                <p className="font-semibold">{item.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">{item.spec} · {item.zone ?? "—"}</p>
                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5">
                  <span className="text-sm tabular-nums">
                    ×{item.qty} @ {item.finalPrice !== undefined ? formatINR(item.finalPrice) : "—"}
                  </span>
                  <ItemStatusBadge status={item.status} />
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-lg border bg-card md:block">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  {["Item", "Zone", "Qty", "Rate", "Status"].map((h) => (
                    <th key={h} className="px-4 py-2.5 font-semibold text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-semibold">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.spec}</p>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.zone ?? "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{item.qty}</td>
                    <td className="px-4 py-2.5 tabular-nums">
                      {item.finalPrice !== undefined ? formatINR(item.finalPrice) : "—"}
                    </td>
                    <td className="px-4 py-2.5"><ItemStatusBadge status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "deliveries" && (
        <div className="space-y-3">
          {consignments.map((c) => (
            <article key={c.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {c.crateIds.length} crate{c.crateIds.length === 1 ? "" : "s"}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {c.lrNumber ? `LR ${c.lrNumber}` : "Awaiting dispatch"}
                    {c.transporterName ? ` · ${c.transporterName}` : ""}
                  </p>
                </div>
                <p className="text-sm font-semibold">
                  {c.deliveredAt ? `Delivered ${formatDate(c.deliveredAt)}`
                    : c.eta ? `ETA ${formatDate(c.eta)}`
                    : "Not scheduled"}
                </p>
              </div>
            </article>
          ))}
          {consignments.length === 0 && <EmptyState title="Nothing dispatched yet" />}
        </div>
      )}

      {tab === "documents" && (
        <div className="space-y-3">
          {documents.length === 0 ? <EmptyState title="No documents shared yet" hint="Approved BOQs, challans, invoices and handover certificates appear here." /> : documents.map((document) => (
            <article key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4"><div><p className="font-semibold">{document.name}</p><p className="mt-1 text-xs text-muted-foreground">{document.type} · shared {formatDate(document.addedAt)}</p></div>{document.fileUrl && <a href={document.fileUrl} download={document.name} className="rounded-md border px-3 py-2 text-sm font-bold hover:bg-muted">Download</a>}</article>
          ))}
        </div>
      )}

      {tab === "messages" && (
        <section className="visual-card p-4 sm:p-5"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary"><MessageCircle className="h-4 w-4" /></span><div><h3 className="font-bold">Project conversation</h3><p className="text-xs text-muted-foreground">Keep decisions, questions and updates with the showroom—not in WhatsApp.</p></div></div><div className="mt-5 space-y-3">{messages.length === 0 ? <EmptyState title="No messages yet" hint="Ask Kurchi a question about this showroom." /> : messages.map((item) => <article key={item.id} className={cn("max-w-[88%] rounded-2xl p-3", item.byRole === "CLIENT" ? "ml-auto bg-primary text-primary-foreground" : "border bg-muted/60")}><p className="text-sm">{item.body}</p><p className={cn("mt-2 text-[11px] font-semibold", item.byRole === "CLIENT" ? "text-primary-foreground/75" : "text-muted-foreground")}>{item.byName} · {formatDate(item.at, { day: "numeric", month: "short" })}</p></article>)}</div><form onSubmit={(event) => { event.preventDefault(); if (message.trim()) { run(() => act.addComment(user, project.id, message), "Message sent to Kurchi"); setMessage(""); } }} className="mt-5 flex gap-2 border-t pt-4"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask Kurchi about this showroom…" className="min-h-11 min-w-0 flex-1 rounded-xl border bg-background px-3 text-sm"/><button aria-label="Send message" className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground"><Send className="h-4 w-4" /></button></form></section>
      )}

      {tab === "snags" && (
        <div className="space-y-4">
          <ClientSnagForm
            onSubmit={(v) =>
              run(() => act.raiseSnag(user, { projectId: project.id, ...v }), "Snag raised", "Kurchi has been notified.")
            }
          />
          {snags.map((s) => (
            <article key={s.id} className="rounded-lg border bg-card p-4">
              <p className="text-sm">{s.description}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {s.severity.toLowerCase()} · {s.status.toLowerCase()} · raised {formatDate(s.raisedAt)} by {s.raisedBy}
              </p>
            </article>
          ))}
          {snags.length === 0 && <EmptyState title="No snags raised" />}
        </div>
      )}

      {tab === "handover" && (
        <section className="rounded-lg border bg-card p-4 sm:p-5">
          {signed ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-4">
              <p className="flex items-center gap-2 font-bold text-red-900">
                <ShieldCheck className="h-5 w-5" /> Handover accepted
              </p>
              <p className="mt-1 text-sm text-red-800">
                Signed by {signed.by} on {formatDate(signed.at, { day: "numeric", month: "long", year: "numeric" })}.
                {project.dlpEndDate && ` Defect liability runs to ${formatDate(project.dlpEndDate, { day: "numeric", month: "long", year: "numeric" })}.`}
              </p>
            </div>
          ) : (
            <>
              <h3 className="font-bold">Completion certificate</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Signing confirms the showroom is accepted and starts the {project.dlpMonths}-month
                defect liability period.
              </p>
              <div className="mt-4">
                <RuleGate verdict={canRaiseHandover(rawItems, snags)}>
                  <OtpSign
                    onSign={(otp) =>
                      run(
                        () => act.signHandover(user, project.id, otp),
                        "Handover signed",
                        "Thank you — Kurchi has been notified."
                      )
                    }
                  />
                </RuleGate>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}

function OtpSign({ onSign }: { onSign: (otp: string) => boolean }) {
  const [otp, setOtp] = useState("");
  const [sent, setSent] = useState(false);

  if (!sent) {
    return (
      <button
        type="button"
        onClick={() => setSent(true)}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground sm:w-auto"
      >
        Send code to my mobile
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to your registered mobile. (Demo: any 6 digits work.)
      </p>
      <label htmlFor="otp" className="sr-only">Six digit code</label>
      <input
        id="otp"
        inputMode="numeric"
        maxLength={6}
        value={otp}
        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
        placeholder="000000"
        className="w-full max-w-[12rem] rounded-md border bg-background px-3 py-3 text-center text-lg font-bold tracking-[0.4em] tabular-nums"
      />
      <button
        type="button"
        disabled={otp.length !== 6}
        onClick={() => { if (onSign(otp)) setOtp(""); }}
        className="w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40 sm:w-auto"
      >
        Sign and accept
      </button>
    </div>
  );
}

function ClientSnagForm({
  onSubmit,
}: { onSubmit: (v: { description: string; severity: SnagSeverity; photos: string[] }) => boolean }) {
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SnagSeverity>("MINOR");
  const [photos, setPhotos] = useState<string[]>([]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 font-bold">Raise a snag</h3>
      <textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Something not right? Tell us and attach a photo."
        aria-label="Snag description"
        className="w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm"
      />
      <div className="mt-2 grid grid-cols-3 gap-2">
        {(["MINOR", "MAJOR", "CRITICAL"] as SnagSeverity[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverity(s)}
            aria-pressed={severity === s}
            className={cn(
              "rounded-md border px-2 py-2.5 text-xs font-semibold capitalize",
              severity === s ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted"
            )}
          >
            {s.toLowerCase()}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <PhotoCapture
          photos={photos}
          required
          label="Add a photo of the snag"
          onAdd={(photo) => setPhotos((p) => [...p, photo ?? `client-snag-${p.length + 1}.jpg`])}
          onRemove={(i) => setPhotos((p) => p.filter((_, index) => index !== i))}
        />
      </div>
      <button
        type="button"
        disabled={!description.trim() || !photos.length}
        onClick={() => { if (onSubmit({ description, severity, photos })) { setDescription(""); setPhotos([]); } }}
        className="mt-2 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-40"
      >
        Raise snag
      </button>
    </section>
  );
}
