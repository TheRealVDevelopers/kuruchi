import { useState } from "react";
import { Link } from "react-router-dom";
import { FilePlus2, ReceiptText, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo, receivablesAgeing, retentionQueue, NOW } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate } from "@/lib/useAction";
import { PageHeader, StatCard, EmptyState, StatStrip } from "@/components/app/Shell";
import { RuleTag } from "@/components/app/RuleGate";
import { ResponsiveTable, type Column } from "@/components/app/ResponsiveTable";
import { formatCompactINR, formatINR } from "@/lib/money";
import { EWAY_BILL_THRESHOLD, taxMode } from "@/lib/rules";
import { cn } from "@/lib/utils";
import type { Challan, Invoice, Payment } from "@/types";

/* ------------------------------------------------------------- dashboard */

export function AccountsDashboard() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  if (!user) return null;

  const invoices = repo.invoices();
  const ageing = receivablesAgeing(user);
  const outstanding = Object.values(ageing).reduce((a, b) => a + b, 0);
  const projects = repo.projects(user);
  const retention = retentionQueue(user).reduce((s, r) => s + r.held, 0);

  const pendingDocs = repo.consignments().filter(
    (c) =>
      c.status === "READY" &&
      (!c.challanId || (!c.ewayBillNo && (c.interState || c.taxableValue > EWAY_BILL_THRESHOLD)))
  );

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Dashboard"
        description="Create documents, track collections and clear dispatch requirements from one place."
      />

      <section className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <QuickAction to="/accounts/invoices" title="Create invoice" hint="GST tax invoice" Icon={FilePlus2} tone="primary" />
        <QuickAction to="/accounts/controls?tab=bills" title="Add vendor bill" hint="Supplier invoice" Icon={WalletCards} />
        <QuickAction to="/accounts/challans" title="Create challan" hint="For dispatch" Icon={ReceiptText} />
        <QuickAction to="/accounts/eway" title="E-way bill" hint="Vehicle & transport" Icon={Truck} />
      </section>

      <StatStrip>
        <StatCard label="Outstanding" value={formatCompactINR(outstanding)} sub={`${invoices.filter((i) => i.status !== "PAID").length} open invoices`} />
        <StatCard label="Over 60 days" value={formatCompactINR(ageing["61-90"] + ageing["90+"])} tone={ageing["61-90"] + ageing["90+"] > 0 ? "bad" : "default"} />
        <StatCard label="Docs pending" value={pendingDocs.length} sub="blocking dispatch" tone={pendingDocs.length ? "warn" : "default"} />
        <StatCard label="Retention held" value={formatCompactINR(retention)} sub="released after DLP" />
      </StatStrip>

      <h2 className="mb-3 text-lg font-bold tracking-tight">Waiting on Accounts</h2>
      {pendingDocs.length === 0 ? (
        <EmptyState title="Nothing waiting on documents" />
      ) : (
        <div className="space-y-3">
          {pendingDocs.map((c) => {
            const project = projects.find((p) => p.id === c.projectId);
            const needsEway = c.interState || c.taxableValue > EWAY_BILL_THRESHOLD;
            return (
              <article key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold">{project?.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatINR(c.taxableValue)} · {c.interState ? "inter-state" : "intra-state"} ·{" "}
                      {c.crateIds.length} crate{c.crateIds.length === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    blocking dispatch
                  </span>
                </div>

                <ul className="mt-3 space-y-1.5 text-sm">
                  {!c.challanId && (
                    <li className="flex flex-wrap items-center gap-1.5">
                      <RuleTag id="FN-01" tone="stop" />
                      <span className="text-muted-foreground">
                        Goods move before the sale — a delivery challan is required, not an invoice.
                      </span>
                    </li>
                  )}
                  {needsEway && !c.ewayBillNo && (
                    <li className="flex flex-wrap items-center gap-1.5">
                      <RuleTag id="DS-03" tone="stop" />
                      <span className="text-muted-foreground">
                        {c.interState ? "Inter-state movement" : `Value over ₹${EWAY_BILL_THRESHOLD.toLocaleString("en-IN")}`} — e-way bill required.
                      </span>
                    </li>
                  )}
                </ul>

                <div className="mt-3 flex flex-wrap gap-2">
                  {!c.challanId && (
                    <button
                      type="button"
                      onClick={() => run(() => act.createChallan(user, c.id), "Delivery challan created")}
                      className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      Create delivery challan
                    </button>
                  )}
                  <Link
                    to="/accounts/eway"
                    className="rounded-md border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    E-way bill worksheet
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-bold tracking-tight">Receivables ageing</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(ageing).map(([bucket, amount]) => (
          <StatCard
            key={bucket}
            label={`${bucket} days`}
            value={formatCompactINR(amount)}
            tone={bucket === "90+" && amount > 0 ? "bad" : bucket === "61-90" && amount > 0 ? "warn" : "default"}
          />
        ))}
      </div>
    </>
  );
}

function QuickAction({ to, title, hint, Icon, tone }: { to: string; title: string; hint: string; Icon: typeof FilePlus2; tone?: "primary" }) {
  return <Link to={to} className={cn("group rounded-2xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-lg", tone === "primary" && "border-primary/30 bg-primary/5")}><Icon className={cn("h-6 w-6", tone === "primary" ? "text-primary" : "text-muted-foreground group-hover:text-primary")}/><p className="mt-5 font-extrabold">{title}</p><p className="mt-1 text-xs text-muted-foreground">{hint}</p></Link>;
}

/* --------------------------------------------------------------- challans */

export function ChallansPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  if (!user) return null;

  const challans = repo.challans();
  const awaiting = repo.consignments().filter((c) => !c.challanId && c.status !== "DELIVERED");

  const columns: Column<Challan>[] = [
    { key: "number", header: "Number", primary: true, cell: (c) => <span className="font-mono text-sm">{c.number}</span> },
    { key: "ship", header: "Ship to", subtitle: true, cell: (c) => <span className="text-xs">{c.shipTo.name}</span> },
    { key: "bill", header: "Bill to", cell: (c) => <span className="text-sm">{c.billTo.name}</span> },
    { key: "gstin", header: "Bill-to GSTIN", cell: (c) => <span className="font-mono text-xs">{c.billTo.gstin}</span> },
    { key: "value", header: "Taxable value", cell: (c) => <span className="tabular-nums">{formatINR(c.taxableValue)}</span> },
    { key: "date", header: "Issued", cell: (c) => formatDate(c.issuedAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="GST"
        title="Delivery challans"
        description="Goods move to site before the sale. Under Rule 55 that is a challan, with bill-to and ship-to as separate parties."
      />

      {awaiting.length > 0 && (
        <section className="mb-6 rounded-lg border bg-card p-4">
          <h2 className="mb-3 font-bold">Consignments without a challan</h2>
          <ul className="space-y-2">
            {awaiting.map((c) => {
              const project = repo.projects(user).find((p) => p.id === c.projectId);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2.5 text-sm">
                  <span>
                    <strong>{project?.site.city}</strong> · {formatINR(c.taxableValue)} ·{" "}
                    {c.interState ? "inter-state" : "intra-state"}
                  </span>
                  <button
                    type="button"
                    onClick={() => run(() => act.createChallan(user, c.id), "Challan created")}
                    className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Create challan
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ResponsiveTable
        data={challans}
        columns={columns}
        keyOf={(c) => c.id}
        empty="No challans issued yet — create one from a consignment above."
        minWidth="min-w-[820px]"
      />
      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <RuleTag id="FN-06" /> Numbers are gapless per financial year and allocated centrally.
      </p>
    </>
  );
}

/* ------------------------------------------------------------ e-way bill */

export function EwayPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [open, setOpen] = useState<string | null>(null);
  if (!user) return null;

  const needing = repo.consignments().filter(
    (c) => c.status !== "DELIVERED" && (c.interState || c.taxableValue > EWAY_BILL_THRESHOLD)
  );

  return (
    <>
      <PageHeader
        eyebrow="GST"
        title="E-way bills"
        description="Part A and Part B assembled from the challan and the dispatch record, ready to key into the portal."
      />

      {needing.length === 0 ? (
        <EmptyState title="Nothing needs an e-way bill" />
      ) : (
        <div className="space-y-4">
          {needing.map((c) => {
            const project = repo.projects(user).find((p) => p.id === c.projectId);
            const challan = repo.challans().find((x) => x.id === c.challanId);
            const complete = Boolean(c.ewayBillNo && c.transporterName && c.vehicleNo);
            return (
              <section key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold">{project?.site.city}</h3>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {formatINR(c.taxableValue)} · {c.interState ? "inter-state" : "intra-state"}
                    </p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold",
                    complete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700"
                  )}>
                    {complete ? "ready" : "incomplete"}
                  </span>
                </div>

                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <div>
                    <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Part A</h4>
                    <dl className="space-y-1 text-sm">
                      <Row k="Document" v={challan?.number ?? "challan not created"} />
                      <Row k="From GSTIN" v="29AAFCO1234M1Z5" />
                      <Row k="To state" v={project?.site.state ?? "—"} />
                      <Row k="To PIN" v={project?.site.pincode ?? "—"} />
                      <Row k="Taxable value" v={formatINR(c.taxableValue)} />
                      <Row k="HSN" v="9401 / 9403" />
                    </dl>
                  </div>
                  <div>
                    <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">Part B</h4>
                    <dl className="space-y-1 text-sm">
                      <Row k="Transporter" v={c.transporterName || "—"} />
                      <Row k="Vehicle" v={c.vehicleNo || "—"} />
                      <Row k="E-way bill no." v={c.ewayBillNo || "—"} />
                      <Row k="Valid till" v={c.ewayBillValidTill ? formatDate(c.ewayBillValidTill) : "—"} />
                    </dl>
                  </div>
                </div>

                {!complete && (
                  <div className="mt-3">
                    {open === c.id ? (
                      <EwayForm
                        onCancel={() => setOpen(null)}
                        onSave={(v) => {
                          const ok = run(
                            () => act.recordEwayBill(user, c.id, v.no, v.transporter, v.vehicle),
                            "E-way bill recorded"
                          );
                          if (ok) setOpen(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpen(c.id)}
                        className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
                      >
                        Record e-way bill
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

function EwayForm({ onSave, onCancel }: { onSave: (v: { no: string; transporter: string; vehicle: string }) => void; onCancel: () => void }) {
  const [v, setV] = useState({ no: "", transporter: "TCI Freight", vehicle: "" });
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(v); }} className="rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="eway-no" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            E-way bill (12 digits)
          </label>
          <input id="eway-no" inputMode="numeric" maxLength={12} value={v.no}
            onChange={(e) => setV({ ...v, no: e.target.value.replace(/\D/g, "") })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums" />
        </div>
        <div>
          <label htmlFor="eway-tr" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Transporter
          </label>
          <input id="eway-tr" value={v.transporter}
            onChange={(e) => setV({ ...v, transporter: e.target.value })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="eway-veh" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vehicle
          </label>
          <input id="eway-veh" value={v.vehicle} placeholder="KA01AB1234"
            onChange={(e) => setV({ ...v, vehicle: e.target.value.toUpperCase() })}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">Save</button>
        <button type="button" onClick={onCancel} className="rounded-md border bg-background px-3.5 py-2 text-sm font-semibold">Cancel</button>
      </div>
    </form>
  );
}

/* --------------------------------------------------------------- invoices */

export function InvoicesPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [raising, setRaising] = useState(false);
  if (!user) return null;

  const invoices = repo.invoices();
  const projects = repo.projects(user);

  const columns: Column<Invoice>[] = [
    { key: "number", header: "Number", primary: true, cell: (i) => <span className="font-mono text-sm">{i.number}</span> },
    {
      key: "project", header: "Project", subtitle: true,
      cell: (i) => <span className="text-xs">{projects.find((p) => p.id === i.projectId)?.site.city} · {i.placeOfSupplyState}</span>,
    },
    {
      key: "tax", header: "Tax",
      cell: (i) => (
        <span className="rounded border px-1.5 py-0.5 font-mono text-[11px]">
          {i.taxMode === "IGST" ? "IGST" : "CGST+SGST"}
        </span>
      ),
    },
    { key: "taxable", header: "Taxable", cell: (i) => <span className="tabular-nums">{formatINR(i.taxableValue)}</span> },
    { key: "retention", header: "Retention", cell: (i) => <span className="tabular-nums text-muted-foreground">−{formatINR(i.retentionAmount)}</span> },
    { key: "net", header: "Net payable", cell: (i) => <span className="tabular-nums font-semibold">{formatINR(i.netPayable)}</span> },
    { key: "received", header: "Received", cell: (i) => <span className="tabular-nums">{formatINR(i.amountReceived)}</span> },
    {
      key: "status", header: "Status",
      cell: (i) => {
        const overdue = new Date(i.dueDate) < NOW && i.status !== "PAID";
        return (
          <span className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold",
            i.status === "PAID" ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : overdue ? "border-red-200 bg-red-50 text-red-700"
              : "border-amber-300 bg-amber-50 text-amber-800"
          )}>
            {overdue && i.status !== "PAID" ? "overdue" : i.status.replace(/_/g, " ").toLowerCase()}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="GST"
        title="Tax invoices"
        description="CGST+SGST or IGST is computed from place of supply. Issued invoices are immutable."
        actions={
          <button
            type="button"
            onClick={() => setRaising(!raising)}
            className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {raising ? "Cancel" : "Raise invoice"}
          </button>
        }
      />

      {raising && (
        <RaiseInvoiceForm
          projects={projects.map((p) => ({ id: p.id, label: `${p.site.city} · ${p.site.state}` }))}
          onSubmit={(v) => {
            const ok = run(
              () => act.issueInvoice(user, v.projectId, { final: false, percent: v.percent, description: v.description }),
              "Invoice raised"
            );
            if (ok) setRaising(false);
          }}
        />
      )}

      <ResponsiveTable data={invoices} columns={columns} keyOf={(i) => i.id} minWidth="min-w-[960px]" />

      <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <RuleTag id="FN-02" /> place of supply drives the split ·
        <RuleTag id="FN-07" /> issued invoices are credit-noted, never edited
      </p>
    </>
  );
}

function RaiseInvoiceForm({
  projects, onSubmit,
}: {
  projects: Array<{ id: string; label: string }>;
  onSubmit: (v: { projectId: string; percent: number; description: string }) => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [percent, setPercent] = useState(30);
  const [description, setDescription] = useState("Advance — 30%");

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit({ projectId, percent, description }); }}
      className="mb-5 rounded-lg border bg-card p-4"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="inv-project" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project</label>
          <select id="inv-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm">
            {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="inv-pct" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Milestone %</label>
          <input id="inv-pct" type="number" min={1} max={100} value={percent}
            onChange={(e) => setPercent(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums" />
        </div>
        <div>
          <label htmlFor="inv-desc" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</label>
          <input id="inv-desc" value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        </div>
      </div>
      <button type="submit" className="mt-3 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">
        Issue invoice
      </button>
    </form>
  );
}

/* --------------------------------------------------------------- payments */

export function PaymentsPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [paying, setPaying] = useState<string | null>(null);
  if (!user) return null;

  const invoices = repo.invoices().filter((i) => i.status !== "PAID");
  const payments = repo.payments();
  const projects = repo.projects(user);

  const columns: Column<Payment>[] = [
    { key: "date", header: "Received", primary: true, cell: (p) => formatDate(p.receivedAt, { day: "numeric", month: "short", year: "numeric" }) },
    {
      key: "invoice", header: "Invoice", subtitle: true,
      cell: (p) => <span className="font-mono text-xs">{repo.invoices().find((i) => i.id === p.invoiceId)?.number}</span>,
    },
    { key: "amount", header: "Amount", cell: (p) => <span className="tabular-nums font-semibold">{formatINR(p.amount)}</span> },
    { key: "mode", header: "Mode", cell: (p) => p.mode },
  ];

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Payments" description="Record receipts against invoices. Part payments age the balance." />

      <h2 className="mb-3 text-lg font-bold tracking-tight">Open invoices</h2>
      {invoices.length === 0 ? (
        <EmptyState title="Everything is paid" />
      ) : (
        <div className="mb-8 space-y-3">
          {invoices.map((inv) => {
            const outstanding = inv.netPayable - inv.amountReceived;
            return (
              <article key={inv.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-sm font-bold">{inv.number}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {projects.find((p) => p.id === inv.projectId)?.site.city} · due {formatDate(inv.dueDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{formatINR(outstanding)}</p>
                    <p className="text-xs text-muted-foreground">outstanding</p>
                  </div>
                </div>
                {paying === inv.id ? (
                  <PaymentForm
                    max={outstanding}
                    onCancel={() => setPaying(null)}
                    onSave={(amount, mode) => {
                      const ok = run(() => act.recordPayment(user, inv.id, amount, mode), "Payment recorded");
                      if (ok) setPaying(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setPaying(inv.id)}
                    className="mt-3 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground"
                  >
                    Record payment
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-lg font-bold tracking-tight">Receipts</h2>
      <ResponsiveTable data={payments} columns={columns} keyOf={(p) => p.id} empty="No payments recorded yet." minWidth="min-w-[560px]" />
    </>
  );
}

function PaymentForm({ max, onSave, onCancel }: { max: number; onSave: (a: number, m: string) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState(max);
  const [mode, setMode] = useState("NEFT");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(amount, mode); }} className="mt-3 rounded-md border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="pay-amt" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</label>
          <input id="pay-amt" type="number" min={1} max={max} value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm tabular-nums" />
        </div>
        <div>
          <label htmlFor="pay-mode" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mode</label>
          <select id="pay-mode" value={mode} onChange={(e) => setMode(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm">
            {["NEFT", "RTGS", "UPI", "Cheque"].map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">Record</button>
        <button type="button" onClick={onCancel} className="rounded-md border bg-background px-3.5 py-2 text-sm font-semibold">Cancel</button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------- retention */

export function RetentionPage() {
  useDb();
  const { user } = useAuth();
  const queue = retentionQueue(user);

  return (
    <>
      <PageHeader
        eyebrow="Accounts"
        title="Retention & DLP"
        description="Money the client holds back until the defect liability period ends. Nobody remembers to claim it — this queue does."
      />

      {queue.length === 0 ? (
        <EmptyState
          title="No retention held yet"
          hint="Retention appears once invoices are raised against a project."
        />
      ) : (
        <div className="space-y-3">
          {queue.map((r) => (
            <article key={r.project.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-bold">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {r.project.site.city}
                  </h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {r.project.retentionPct}% retained · {r.project.dlpMonths}-month DLP
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums">{formatINR(r.held)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.releaseAt
                      ? r.daysToRelease! > 0
                        ? `releases in ${r.daysToRelease} days`
                        : "due for release"
                      : "DLP starts at handover"}
                  </p>
                </div>
              </div>
              {r.daysToRelease !== null && r.daysToRelease <= 15 && (
                <p className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                  <RuleTag id="NT-06" /> Claim this now — DLP ends {formatDate(r.releaseAt!.toISOString())}.
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- shared */

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
