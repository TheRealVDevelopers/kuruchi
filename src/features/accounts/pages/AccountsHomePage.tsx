import { Link } from "react-router-dom";
import { ArrowRight, FileText, IndianRupee, Receipt, Route, WalletCards } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo, receivablesAgeing } from "@/data/repo";
import { useDb } from "@/data/store";
import { formatCompactINR } from "@/lib/money";

export default function AccountsHomePage() {
  useDb();
  const { user } = useAuth();
  const projects = repo.projects(user);
  const invoices = repo.invoices();
  const ageing = receivablesAgeing(user);
  const outstanding = Object.values(ageing).reduce((sum, amount) => sum + amount, 0);
  const ready = repo.consignments().filter((item) => item.status === "READY");
  return <>
    <section className="mb-7 rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Kurchi finance desk</p><h1 className="mt-3 text-3xl font-extrabold">Keep each showroom financially ready.</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-rail-muted">Create documents, record project spend and close each showroom without losing track of a rupee.</p></section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="To collect" value={formatCompactINR(outstanding)} note={`${invoices.filter((invoice) => invoice.status !== "PAID").length} open invoices`} /><Metric label="Ready to move" value={ready.length} note="deliveries needing documents" /><Metric label="Showroom cost centres" value={projects.length} note="projects available to track" /><Metric label="This month" value={formatCompactINR(repo.costEntries().reduce((sum, entry) => sum + entry.amount, 0))} note="recorded project spending" /></section>
    <section className="mt-7"><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Start here</p><h2 className="mt-2 text-2xl font-extrabold">Choose what you need to do</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Action to="/accounts/cost-centres" title="Add project expense" description="Production, logistics, installation or site spend." Icon={WalletCards} /><Action to="/accounts/invoices" title="Create invoice" description="Prepare the GST tax invoice for a completed project." Icon={Receipt} /><Action to="/accounts/challans" title="Prepare delivery papers" description="Create a challan before material starts moving." Icon={Route} /><Action to="/accounts/eway" title="Create e-way bill" description="Complete vehicle and movement details." Icon={FileText} /></div></section>
    <section className="mt-7 rounded-3xl border bg-card p-5"><div className="flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Money to follow up</p><h2 className="mt-2 text-xl font-extrabold">Collections overview</h2></div><IndianRupee className="h-6 w-6 text-primary" /></div><div className="mt-5 grid grid-cols-4 gap-2">{Object.entries(ageing).map(([period, amount]) => <div key={period} className="rounded-2xl bg-muted/60 p-3"><p className="text-xs font-bold text-muted-foreground">{period} days</p><p className="mt-2 text-sm font-extrabold">{formatCompactINR(amount)}</p></div>)}</div><Link to="/accounts/payments" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary">Review payments <ArrowRight className="h-4 w-4" /></Link></section>
  </>;
}

function Metric({ label, value, note }: { label: string; value: string | number; note: string }) { return <div className="rounded-3xl border bg-card p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-3 text-2xl font-extrabold">{value}</p><p className="mt-2 text-xs text-muted-foreground">{note}</p></div>; }
function Action({ to, title, description, Icon }: { to: string; title: string; description: string; Icon: typeof FileText }) { return <Link to={to} className="group rounded-3xl border bg-card p-5 shadow-sm transition hover:border-primary/45 hover:shadow-md"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><h3 className="mt-5 font-extrabold">{title}</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p><ArrowRight className="mt-5 h-4 w-4 text-primary transition group-hover:translate-x-1" /></Link>; }
