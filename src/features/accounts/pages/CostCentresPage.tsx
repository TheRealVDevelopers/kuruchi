import { useMemo, useState } from "react";
import { IndianRupee, PlusCircle } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate } from "@/lib/useAction";
import { EmptyState, PageHeader, StatCard, StatStrip } from "@/components/app/Shell";
import { formatINR } from "@/lib/money";
import type { CostEntry } from "@/types";

const HEADS: Array<{ value: CostEntry["head"]; label: string }> = [
  { value: "PRODUCTION", label: "Production / factory" },
  { value: "PACKAGING", label: "Packaging" },
  { value: "LOGISTICS", label: "Logistics" },
  { value: "INSTALLATION", label: "Installation" },
  { value: "SITE_EXPENSE", label: "Site expense" },
  { value: "MISCELLANEOUS", label: "Miscellaneous" },
  { value: "OTHER", label: "Other" },
];

export default function CostCentresPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const projects = repo.projects(user);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [head, setHead] = useState<CostEntry["head"]>("PRODUCTION");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [customHead, setCustomHead] = useState("");
  const entries = repo.costEntries(projectId);
  const total = useMemo(() => entries.reduce((sum, entry) => sum + entry.amount, 0), [entries]);
  const project = projects.find((item) => item.id === projectId);
  if (!user) return null;

  return <>
    <PageHeader eyebrow="Accounts" title="Cost centres" description="Record every project expense in one simple place. Admin and Accounts use the same heads." />
    <StatStrip><StatCard label="Selected project cost" value={formatINR(total)} sub={`${entries.length} entries`} /><StatCard label="BOQ value" value={formatINR(project?.totals.value ?? 0)} /></StatStrip>
    <section className="mt-5 rounded-2xl border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-extrabold">Add an expense</h2>
      <p className="mt-1 text-sm text-muted-foreground">Choose the project, select where the money went, and save.</p>
      <form onSubmit={(event) => { event.preventDefault(); const ok = run(() => act.addCostEntry(user, { projectId, head, customHead: head === "OTHER" ? customHead : undefined, amount: Number(amount), note }), "Expense added"); if (ok) { setAmount(""); setNote(""); setCustomHead(""); } }} className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
        <select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="min-h-12 rounded-xl border bg-background px-3 text-sm font-semibold" required><option value="">Choose project</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.site.city} · {item.code}</option>)}</select>
        <select value={head} onChange={(event) => setHead(event.target.value as CostEntry["head"])} className="min-h-12 rounded-xl border bg-background px-3 text-sm font-semibold">{HEADS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="numeric" required placeholder="Amount in ₹" className="min-h-12 rounded-xl border bg-background px-3 text-sm" />
        <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground"><PlusCircle className="h-4 w-4" /> Add expense</button>
        {head === "OTHER" && <input value={customHead} onChange={(event) => setCustomHead(event.target.value)} required placeholder="Expense head" className="min-h-12 rounded-xl border bg-background px-3 text-sm md:col-span-2" />}
        <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Short note (optional)" className="min-h-12 rounded-xl border bg-background px-3 text-sm md:col-span-2" />
      </form>
    </section>
    <section className="mt-5">
      <h2 className="mb-3 text-lg font-extrabold">Expense history</h2>
      {!projectId ? <EmptyState title="Choose a project to see its costs" /> : entries.length === 0 ? <EmptyState title="No expenses added yet" hint="Start with production, logistics, installation or any site expense." /> : <div className="space-y-2">{entries.map((entry) => <article key={entry.id} className="flex items-center gap-3 rounded-xl border bg-card p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary"><IndianRupee className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="font-bold">{entry.customHead || HEADS.find((item) => item.value === entry.head)?.label}</p><p className="text-xs text-muted-foreground">{entry.note || "No note"} · {entry.createdBy} · {formatDate(entry.createdAt)}</p></div><p className="text-base font-extrabold">{formatINR(entry.amount)}</p></article>)}</div>}
    </section>
  </>;
}
