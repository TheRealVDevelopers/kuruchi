import { Link, Navigate, useLocation } from "react-router-dom";
import { CheckCircle2, CircleDollarSign, FileText, IndianRupee, Printer, Receipt, ShieldCheck, Truck, WalletCards } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo, receivablesAgeing } from "@/data/repo";
import { useDb } from "@/data/store";
import { formatCompactINR, formatINR } from "@/lib/money";
import { KURCHI_EWAY_REQUIRED_FOR_ALL_SHIPMENTS } from "@/lib/rules";
import { printTaxInvoice } from "@/lib/printInvoice";
import { useAction } from "@/lib/useAction";
import { PaymentApprovalTasks } from "../components/PaymentApprovalTasks";
import { ShipmentInvoiceTasks } from "../components/ShipmentInvoiceTasks";
import { AccountsFranchiseeOwners } from "../components/AccountsFranchiseeOwners";
import { AccountsInbox } from "../components/AccountsInbox";

export default function AccountsHomePage() {
  useDb(); const { user } = useAuth(); const { hash } = useLocation();
  const run = useAction();
  if (!user) return null;
  if (hash.startsWith("#shipment-")) return <Navigate replace to={hash === "#shipment-invoices" ? "/accounts/invoices?requests=1" : `/accounts/invoices?shipment=${hash.slice("#shipment-".length)}`} />;
  const projects = repo.projects(user); const invoices = repo.invoices(); const notifications = repo.notifications(user);
  const approvals = projects.filter((project) => ["PENDING_VERIFICATION", "ON_HOLD"].includes(project.initialPayment?.status ?? ""));
  const shipments = repo.consignments().filter((c) => c.status === "READY" || hash === `#shipment-${encodeURIComponent(c.id)}`);
  const eways = repo.consignments().filter((c) => c.status !== "DELIVERED" && !c.ewayBillNo && KURCHI_EWAY_REQUIRED_FOR_ALL_SHIPMENTS);
  const openInvoices = invoices.filter((i) => i.status !== "PAID"); const outstanding = Object.values(receivablesAgeing(user)).reduce((a, b) => a + b, 0);
  const invoicesToCreate = shipments.filter((s) => !s.invoiceId && !s.billingExempt);
  const taskCount = approvals.length + invoicesToCreate.length + eways.length + openInvoices.length;
  return <div className="mx-auto max-w-6xl space-y-6">
    <section className="rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Kurchi Accounts</p><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-extrabold">Your work for today</h1><p className="mt-2 max-w-2xl text-sm text-rail-muted">Approve payments, bill packed shipments, complete e-way details and record collections—one task at a time.</p></div><b className="rounded-2xl bg-white/10 px-4 py-3">{taskCount} task{taskCount === 1 ? "" : "s"} waiting</b></div><div className="mt-6 flex flex-wrap gap-2"><a href="/accounts/invoices?action=raise" className="min-h-11 rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-rail">Create invoice</a><a href="/accounts/payments" className="min-h-11 rounded-xl border border-white/25 px-4 py-3 text-sm font-extrabold text-rail-foreground">Record payment</a><a href="/accounts/cost-centres" className="min-h-11 rounded-xl border border-white/25 px-4 py-3 text-sm font-extrabold text-rail-foreground">Add expense</a></div></section>
    <Panel step="Inbox" title="Requests sent to Accounts" hint="Choose payment or invoice requests. Completed work stays in history."><AccountsInbox notifications={notifications}/></Panel>
    <AccountsFranchiseeOwners/>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric icon={<ShieldCheck/>} label="Payment approvals" value={approvals.length} note="Ola advances"/><Metric icon={<Receipt/>} label="Invoices to create" value={invoicesToCreate.length} note="packed shipments"/><Metric icon={<Truck/>} label="E-way bills" value={eways.length} note="before dispatch"/><Metric icon={<IndianRupee/>} label="Outstanding" value={formatCompactINR(outstanding)} note={`${openInvoices.length} open invoices`}/></section>
<Panel step="Step 1" title="Approve payments" hint="After approval, the showroom moves to Kurchi Admin."><PaymentApprovalTasks/></Panel>
    <Panel step="Step 2" title="Create shipment invoices" hint="Each request shows the exact products and delivery method Admin selected."><ShipmentInvoiceTasks/></Panel>
    <section className="grid gap-5 lg:grid-cols-2"><Panel step="Step 3" title="Complete e-way bills" hint="Required for applicable shipments.">{eways.length ? <Link to="/accounts/eway" className="block rounded-2xl bg-primary/10 p-4 font-extrabold text-primary">Open {eways.length} e-way bill task{eways.length === 1 ? "" : "s"}</Link> : <a href="/accounts/eway" className="block rounded-2xl bg-muted/55 p-4 text-sm font-bold">Open e-way bill workspace</a>}</Panel><Panel step="Step 4" title="Collections and costs" hint="Keep showroom money current."><div className="grid grid-cols-2 gap-2"><Quick to="/accounts/payments" icon={<CircleDollarSign/>} text="Record payment"/><Quick to="/accounts/cost-centres" icon={<WalletCards/>} text="Add project expense"/></div></Panel></section>
    <Panel step="Recent" title="Invoices already raised" hint="Print any existing invoice or open the register.">{invoices.length ? <div className="divide-y">{invoices.slice(0, 4).map((i) => <div key={i.id} className="flex items-center justify-between gap-3 py-3"><div><b className="font-mono text-sm">{i.number}</b><p className="text-xs text-muted-foreground">{formatINR(i.netPayable)} · {i.status.replaceAll("_", " ").toLowerCase()}</p></div><button onClick={() => run(() => { printTaxInvoice(i, projects.find((p) => p.id === i.projectId)); })} className="rounded-lg border px-3 py-2 text-xs font-bold">Print</button></div>)}</div> : <Empty icon={<FileText/>} title="No invoices raised yet" hint="Invoices created above appear here."/>}</Panel>
  </div>;
}
function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string | number; note: string }) { return <article className="rounded-3xl border bg-card p-4"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><p className="mt-4 text-2xl font-extrabold">{value}</p><p className="mt-1 text-sm font-bold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></article>; }
function Panel({ id, step, title, hint, children }: { id?: string; step: string; title: string; hint: string; children: React.ReactNode }) { return <section id={id} tabIndex={id ? -1 : undefined} className="scroll-mt-24 rounded-3xl border bg-card p-5 sm:p-6 focus:outline-none"><p className="eyebrow">{step}</p><h2 className="mt-1 text-xl font-extrabold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{hint}</p><div className="mt-4">{children}</div></section>; }
function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) { return <div className="rounded-2xl bg-muted/55 p-4 text-sm"><span className="text-primary">{icon}</span><p className="mt-2 font-bold">{title}</p><p className="mt-1 text-muted-foreground">{hint}</p></div>; }
function Quick({ to, icon, text }: { to: string; icon: React.ReactNode; text: string }) { return <Link to={to} className="rounded-2xl border p-4 text-sm font-extrabold hover:border-primary/50"><span className="mb-3 block text-primary">{icon}</span>{text}</Link>; }
