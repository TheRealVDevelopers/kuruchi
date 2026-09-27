import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, CheckCircle2, Circle, MapPin, Phone, Send } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate, formatDateTime } from "@/lib/useAction";
import { PageHeader, StatCard, EmptyState, StatStrip } from "@/components/app/Shell";
import { ItemStatusBadge, ProjectStatusBadge, SlaPill } from "@/components/app/StatusBadge";
import { BulkStatusBar, StatusControl } from "@/components/app/StatusControl";
import { AddBoqLine } from "@/features/admin/pages/AddBoqLine";
import { MarginPill, MoneyField } from "@/components/app/MoneyField";
import { RuleGate, RuleTag } from "@/components/app/RuleGate";
import { ResponsiveTable, type Column } from "@/components/app/ResponsiveTable";
import { InlinePhotoCapture } from "@/components/app/SiteKit";
import { canDispatch, canRaiseFinalInvoice, canRaiseHandover, canSendForApproval, readinessLabel } from "@/lib/rules";
import { formatCompactINR, formatINR, itemMoney, rollUp } from "@/lib/money";
import { projectProgress } from "@/lib/statuses";
import { cn } from "@/lib/utils";
import type { BoqItem, Project } from "@/types";

const TABS = [
  { id: "summary", label: "Summary" },
  { id: "boq", label: "BOQ" },
  { id: "dispatch", label: "Dispatch" },
  { id: "site", label: "Site" },
  { id: "installation", label: "Installation" },
  { id: "finance", label: "Finance" },
  { id: "comments", label: "Comments" },
] as const;

export default function ProjectDetailPage() {
  useDb();
  const { projectId = "" } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const run = useAction();
  const tab = params.get("tab") ?? "summary";
  const [comment, setComment] = useState("");
  const [override, setOverride] = useState<string | null>(null);

  const project = repo.projectById(user, projectId);
  if (!project || !user) {
    return <EmptyState title="Project not found" hint="It may belong to another team." />;
  }

  // AC-01 — Super Admin reads everything and writes nothing but comments.
  const readOnly = user.role === "SUPER_ADMIN";
  const backTo = readOnly ? "/hq/projects" : "/admin/projects";

  const items = repo.itemsRaw(project.id);
  const money = rollUp(items);
  const progress = projectProgress(items.map((i) => i.status));
  const tickets = repo.tickets(project.id);
  const snags = repo.snags(project.id);
  const crates = repo.crates(project.id);
  const consignments = repo.consignments(project.id);
  const invoices = repo.invoices(project.id);
  const logs = repo.progressLogs(project.id);
  const comments = repo.comments(project.id);

  const boqColumns: Column<BoqItem>[] = [
    {
      key: "item", header: "Item", primary: true,
      cell: (i) => i.name,
    },
    {
      key: "spec", header: "Spec", subtitle: true,
      cell: (i) => (
        <span className="text-xs">
          {i.spec} · {i.zone ?? "unzoned"} · ×{i.qty}
        </span>
      ),
    },
    { key: "base", header: "Base", cell: (i) => <MoneyField value={i.pricing.basePrice} role={user.role} kind="cost" showHidden /> },
    { key: "selling", header: "Selling", cell: (i) => <MoneyField value={i.pricing.sellingPrice} role={user.role} kind="selling" showHidden /> },
    { key: "final", header: "Final", cell: (i) => <MoneyField value={i.pricing.finalPrice} role={user.role} kind="selling" showHidden /> },
    {
      key: "landed", header: "Landed",
      cell: (i) => {
        const m = itemMoney(i);
        return (
          <span className="whitespace-nowrap">
            <MoneyField value={m.landedCost} role={user.role} kind="cost" showHidden />
            {m.rework > 0 && <span className="ml-1 text-[11px] text-primary">+rework</span>}
          </span>
        );
      },
    },
    { key: "margin", header: "Margin", cell: (i) => <MarginPill pct={itemMoney(i).marginPct} /> },
    {
      key: "status", header: "Status",
      cell: (i) => <StatusControl item={i} user={user} disabled={readOnly} />,
    },
    { key: "sla", header: "Waiting", cell: (i) => <SlaPill status={i.status} since={i.statusUpdatedAt} /> },
  ];

  return (
    <>
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <PageHeader
        eyebrow={project.code}
        title={project.name}
        description={`${project.site.address}, ${project.site.city} ${project.site.pincode}`}
        actions={<ProjectStatusBadge status={project.status} className="px-3 py-1.5 text-sm" />}
      />

      {readOnly && (
        <p className="mb-4 flex flex-wrap items-center gap-1.5 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          <RuleTag id="AC-01" /> You can read everything here and comment. Nothing else is editable.
        </p>
      )}

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setParams({ tab: t.id })}
            className={cn(
              "shrink-0 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* ------------------------------------------------------------ summary */}
      {tab === "summary" && (
        <div className="space-y-6">
          <StatStrip>
            <StatCard label="Progress" value={`${progress}%`} sub={`${project.totals.installedCount} of ${items.length} installed`} />
            <StatCard label="Value" value={formatCompactINR(money.revenue)} sub="Σ final price" />
            <StatCard
              label="Real margin"
              value={formatCompactINR(money.realMargin)}
              sub={`quoted ${formatCompactINR(money.quotedMargin)}`}
              tone={money.realMargin < money.quotedMargin * 0.7 ? "warn" : "good"}
            />
            <StatCard
              label="Erosion"
              value={formatCompactINR(money.erosion)}
              sub={money.quotedMargin ? `${((money.erosion / money.quotedMargin) * 100).toFixed(0)}% of expected` : "—"}
              tone={money.erosion > 0 ? "bad" : "default"}
            />
          </StatStrip>

          <div className="grid gap-4 lg:grid-cols-3">
            <section className="rounded-lg border bg-card p-4 lg:col-span-2">
              <h3 className="font-bold">Site readiness</h3>
              <p className="mb-3 mt-1 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                All six must be green before a vehicle leaves — <RuleTag id="DS-05" />
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {(Object.keys(project.siteReadiness) as Array<keyof Project["siteReadiness"]>).map((k) => {
                  const ok = project.siteReadiness[k];
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() =>
                          run(
                            () => act.setSiteReadiness(user, project.id, k, !ok),
                            ok ? `${readinessLabel(k)} marked not ready` : `${readinessLabel(k)} confirmed`
                          )
                        }
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md border px-3 py-2.5 text-left text-sm transition-colors",
                          ok ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50",
                          !readOnly && "hover:opacity-80"
                        )}
                      >
                        {ok ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-red-500" />
                        )}
                        <span className={cn("capitalize", !ok && "font-semibold text-red-700")}>
                          {readinessLabel(k)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <h3 className="mb-3 font-bold">Site contact</h3>
              <p className="flex items-start gap-2 text-sm">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                {project.site.address}, {project.site.city}
              </p>
              <a href={`tel:${project.site.contactPhone}`} className="mt-2 flex items-center gap-2 text-sm hover:underline">
                <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
                {project.site.contactName} · {project.site.contactPhone}
              </a>
              <dl className="mt-4 space-y-1.5 border-t pt-3 text-sm">
                <Row k="Installation team" v={repo.vendorById(project.installationTeamId)?.name ?? "—"} />
                <Row k="Target" v={formatDate(project.targetCompletionDate, { day: "numeric", month: "short", year: "numeric" })} />
                <Row k="Retention" v={`${project.retentionPct}%`} />
                <Row k="DLP" v={`${project.dlpMonths} months`} />
                {project.dlpEndDate && <Row k="DLP ends" v={formatDate(project.dlpEndDate, { day: "numeric", month: "short", year: "numeric" })} />}
              </dl>
            </section>
          </div>

          <section>
            <h3 className="mb-3 font-bold">Recent site activity</h3>
            {logs.length ? (
              <ul className="space-y-3">
                {logs.map((l) => (
                  <li key={l.id} className="rounded-lg border bg-card p-4">
                    <p className="text-sm">{l.note}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span>{l.by}</span>
                      <span>{formatDate(l.at)}</span>
                      {l.photos.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Camera className="h-3 w-3" />{l.photos.length}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No site updates yet" />
            )}
          </section>
        </div>
      )}

      {/* ---------------------------------------------------------------- BOQ */}
      {tab === "boq" && (
        <div className="space-y-4">
          {project.status === "DRAFT" && !readOnly && (
            <RuleGate verdict={canSendForApproval(project, items)}>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
                <div className="min-w-0">
                  <p className="font-bold">This BOQ is still a draft</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Adjust quantities and prices freely. Once the client approves it, changes need a change order — <RuleTag id="PR-03" />
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => run(() => act.sendBoqForApproval(user, project.id), "Sent to the client", "It is now in their approvals queue.")}
                  className="shrink-0 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  Send for approval
                </button>
              </div>
            </RuleGate>
          )}
          {project.status === "DRAFT" && !readOnly && (
            <AddBoqLine projectId={project.id} user={user} />
          )}
          <BulkStatusBar items={items} user={user} disabled={readOnly} />
          <ResponsiveTable
            data={items}
            columns={boqColumns}
            keyOf={(i) => i.id}
            minWidth="min-w-[960px]"
            footer={
              <tr className="font-bold">
                <td className="px-4 py-3" colSpan={3}>Totals</td>
                <td className="px-4 py-3"><MoneyField value={money.baseCost} role={user.role} kind="cost" /></td>
                <td className="px-4 py-3" />
                <td className="px-4 py-3"><MoneyField value={money.revenue} role={user.role} kind="selling" /></td>
                <td className="px-4 py-3"><MoneyField value={money.landedCost} role={user.role} kind="cost" /></td>
                <td className="px-4 py-3"><MarginPill pct={money.marginPct} /></td>
                <td className="px-4 py-3" colSpan={2} />
              </tr>
            }
          />
          <div className="rounded-lg border bg-card p-4 md:hidden">
            <h3 className="mb-2 font-bold">Totals</h3>
            <dl className="space-y-1.5 text-sm">
              <Row k="Revenue" v={formatINR(money.revenue)} />
              <Row k="Landed cost" v={formatINR(money.landedCost)} />
              <Row k="Real margin" v={`${formatINR(money.realMargin)} · ${money.marginPct.toFixed(1)}%`} />
            </dl>
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------- dispatch */}
      {tab === "dispatch" && (
        <div className="space-y-5">
          {consignments.map((c) => {
            const cCrates = crates.filter((cr) => c.crateIds.includes(cr.id));
            const verdict = canDispatch({ project, consignment: c, crates: cCrates });
            return (
              <section key={c.id} className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold">Consignment {c.lrNumber || "— no LR yet"}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {cCrates.length} crate{cCrates.length === 1 ? "" : "s"} · {formatINR(c.taxableValue)} ·{" "}
                      {c.interState ? "inter-state" : "intra-state"} · {c.status.toLowerCase()}
                    </p>
                  </div>
                  {c.eta && <p className="text-sm text-muted-foreground">ETA {formatDate(c.eta)}</p>}
                </div>

                <dl className="mb-4 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Row k="Transporter" v={c.transporterName || "—"} />
                  <Row k="Vehicle" v={c.vehicleNo || "—"} />
                  <Row k="E-way bill" v={c.ewayBillNo || "—"} />
                  <Row k="Challan" v={c.challanId ? repo.challans().find((x) => x.id === c.challanId)?.number ?? "issued" : "—"} />
                </dl>

                <div className="mb-4 space-y-2">
                  {cCrates.map((cr) => (
                    <div key={cr.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2.5 text-sm">
                      <span className="font-mono text-xs font-semibold">{cr.crateCode}</span>
                      <span className="text-muted-foreground">
                        {cr.itemIds.length} item{cr.itemIds.length === 1 ? "" : "s"}
                        {cr.weightKg ? ` · ${cr.weightKg}kg` : ""}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 text-xs",
                        cr.photos.length ? "text-emerald-700" : "font-semibold text-red-700"
                      )}>
                        <Camera className="h-3.5 w-3.5" />
                        {cr.photos.length} photo{cr.photos.length === 1 ? "" : "s"}
                      </span>
                      {!readOnly && c.status === "READY" && (
                        <InlinePhotoCapture
                          label="Add photo"
                          onAdd={(photo) => run(() => act.addCratePhoto(user, cr.id, photo), `Photo added to ${cr.crateCode}`)}
                        />
                      )}
                    </div>
                  ))}
                </div>

                {c.status === "READY" && !readOnly ? (
                  <>
                    <RuleGate
                      verdict={verdict}
                      onOverride={() => setOverride(override === c.id ? null : c.id)}
                    >
                      <button
                        type="button"
                        onClick={() => run(() => act.dispatchConsignment(user, c.id), "Consignment dispatched", "Site and client notified.")}
                        className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                      >
                        Mark dispatched
                      </button>
                    </RuleGate>

                    {override === c.id && (
                      <OverrideForm
                        onCancel={() => setOverride(null)}
                        onConfirm={(reason) => {
                          const ok = run(
                            () => act.dispatchConsignment(user, c.id, reason),
                            "Dispatched with override",
                            "Logged and shown on the Super Admin dashboard."
                          );
                          if (ok) setOverride(null);
                        }}
                      />
                    )}
                  </>
                ) : c.status === "DISPATCHED" || c.status === "IN_TRANSIT" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      Dispatched {formatDate(c.dispatchedAt)}
                    </p>
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => run(() => act.markDelivered(user, c.id), "Marked delivered at site")}
                        className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
                      >
                        Mark delivered
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Delivered {formatDate(c.deliveredAt)}
                  </p>
                )}
              </section>
            );
          })}
          {consignments.length === 0 && <EmptyState title="Nothing packed for dispatch yet" />}
        </div>
      )}

      {/* --------------------------------------------------------------- site */}
      {tab === "site" && (
        <div className="space-y-4">
          {tickets.length ? (
            tickets.map((t) => {
              const item = repo.itemById(t.itemId);
              return (
                <section key={t.id} className="rounded-lg border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold">
                        {t.type === "DAMAGE" ? "Damage" : "Shortage"} · {t.qtyAffected} unit
                        {t.qtyAffected === 1 ? "" : "s"} · {item?.name}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">{t.note}</p>
                    </div>
                    <span className={cn(
                      "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                      t.status === "RESOLVED"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-amber-300 bg-amber-50 text-amber-800"
                    )}>
                      {t.status.replace(/_/g, " ").toLowerCase()}
                    </span>
                  </div>
                  <dl className="mt-3 grid gap-x-6 gap-y-1.5 border-t pt-3 text-sm sm:grid-cols-2">
                    <Row k="Cause" v={t.cause.replace(/_/g, " ").toLowerCase()} />
                    <Row k="Reported" v={`${t.reportedBy}, ${formatDate(t.reportedAt)}`} />
                    <Row k="Decision" v={t.decision ?? "pending triage"} />
                    <Row k="Rework booked" v={t.costImpact ? formatINR(t.costImpact) : "—"} />
                    <Row k="Evidence" v={`${t.photos.length} photo${t.photos.length === 1 ? "" : "s"}`} />
                  </dl>
                  {!readOnly && !t.decision && (
                    <p className="mt-3 text-sm">
                      <Link to="/admin/tickets" className="font-semibold text-primary hover:underline">
                        Triage this ticket →
                      </Link>
                    </p>
                  )}
                </section>
              );
            })
          ) : (
            <EmptyState title="No damage or shortage reported" hint="Site confirms receipt crate by crate." />
          )}
        </div>
      )}

      {/* ------------------------------------------------------- installation */}
      {tab === "installation" && (
        <div className="space-y-5">
          <section className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 font-bold">Snag list</h3>
            {snags.length ? (
              <ul className="space-y-2">
                {snags.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-start justify-between gap-3 rounded border px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">{s.description}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {s.raisedBy} · {formatDate(s.raisedAt)}
                        {s.dueDate && ` · due ${formatDate(s.dueDate)}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <SeverityPill severity={s.severity} />
                      {s.status === "OPEN" && !readOnly ? (
                        <button
                          type="button"
                          onClick={() => run(() => act.closeSnag(user, s.id), "Snag closed")}
                          className="rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
                        >
                          Close
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">{s.status.toLowerCase()}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No snags raised.</p>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h3 className="mb-3 font-bold">Handover</h3>
            <RuleGate verdict={canRaiseHandover(items, snags)}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() =>
                  run(
                    () => act.requestHandover(user, project.id),
                    "Certificate generated",
                    "Sent to the client to sign."
                  )
                }
                className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Generate handover certificate
              </button>
            </RuleGate>
            {repo.handoverSigned(project.id) && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                Signed by {repo.handoverSigned(project.id)!.by} on{" "}
                {formatDate(repo.handoverSigned(project.id)!.at, { day: "numeric", month: "long", year: "numeric" })}.
              </p>
            )}
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------ finance */}
      {tab === "finance" && (
        <div className="space-y-5">
          <StatStrip>
            <StatCard label="Revenue" value={formatCompactINR(money.revenue)} />
            <StatCard label="Landed cost" value={formatCompactINR(money.landedCost)} sub="the actual price" />
            <StatCard label="Real margin" value={formatCompactINR(money.realMargin)} tone="good" />
            <StatCard label="Rework" value={formatCompactINR(money.rework)} tone={money.rework ? "bad" : "default"} />
          </StatStrip>

          <section className="rounded-lg border bg-card">
            <h3 className="border-b px-4 py-3 font-bold">Invoices</h3>
            {invoices.length ? (
              <ul className="divide-y">
                {invoices.map((inv) => (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div>
                      <p className="font-mono text-xs font-semibold">{inv.number}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.taxMode.replace("_", "+")} · issued {formatDate(inv.issuedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular-nums font-semibold">{formatINR(inv.netPayable)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatINR(inv.amountReceived)} received · {inv.status.replace(/_/g, " ").toLowerCase()}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-sm text-muted-foreground">No invoices raised.</p>
            )}
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h3 className="mb-1 font-bold">Final invoice</h3>
            <p className="mb-3 flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
              Blocked until the client signs the handover — <RuleTag id="FN-04" />
            </p>
            <RuleGate verdict={canRaiseFinalInvoice(project)}>
              <button
                type="button"
                disabled={readOnly}
                onClick={() =>
                  run(
                    () => act.issueInvoice(user, project.id, { final: true, percent: 100, description: `${project.name} — final` }),
                    "Final invoice raised"
                  )
                }
                className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Raise final invoice
              </button>
            </RuleGate>
          </section>
        </div>
      )}

      {/* ----------------------------------------------------------- comments */}
      {tab === "comments" && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              act.addComment(user, project.id, comment);
              setComment("");
            }}
            className="rounded-lg border bg-card p-3"
          >
            <label htmlFor="comment" className="sr-only">Add a comment</label>
            <textarea
              id="comment"
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Every role can comment here, including Super Admin."
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!comment.trim()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              <Send className="h-3.5 w-3.5" /> Post
            </button>
          </form>

          {comments.map((c) => (
            <article key={c.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold">{c.byName}</span>
                <span className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {c.byRole.replace(/_/g, " ").toLowerCase()}
                </span>
                <span className="text-xs text-muted-foreground">{formatDateTime(c.at)}</span>
              </div>
              <p className="mt-2 text-sm">{c.body}</p>
            </article>
          ))}
          {comments.length === 0 && <EmptyState title="No comments yet" />}
        </div>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}

function SeverityPill({ severity }: { severity: "MINOR" | "MAJOR" | "CRITICAL" }) {
  return (
    <span className={cn(
      "rounded border px-1.5 py-0.5 text-[11px] font-semibold",
      severity === "CRITICAL" && "border-red-200 bg-red-50 text-red-700",
      severity === "MAJOR" && "border-amber-300 bg-amber-50 text-amber-800",
      severity === "MINOR" && "border-slate-200 bg-slate-50 text-slate-700"
    )}>
      {severity.toLowerCase()}
    </span>
  );
}

function OverrideForm({ onConfirm, onCancel }: { onConfirm: (reason: string) => void; onCancel: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3 rounded-md border border-red-300 bg-red-50 p-3">
      <label htmlFor="override-reason" className="mb-1.5 block text-sm font-semibold text-red-900">
        Why are you dispatching anyway?
      </label>
      <textarea
        id="override-reason"
        rows={2}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="This is logged against your name and shown to the Super Admin."
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={reason.trim().length < 10}
          onClick={() => onConfirm(reason.trim())}
          className="rounded-md bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40"
        >
          Dispatch anyway
        </button>
        <button type="button" onClick={onCancel} className="rounded-md border bg-background px-3 py-2 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </div>
  );
}
