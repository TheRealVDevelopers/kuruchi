import { Clock3, Store } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { EmptyState } from "@/components/app/Shell";
import { formatINR } from "@/lib/money";

/** Ola creates the showroom. The named franchisee—not Ola—accepts the BOQ. */
export default function ApprovalsPage() {
  useDb();
  const { user } = useAuth();
  if (!user) return null;
  const waiting = repo.projects(user).filter((project) => project.status === "PENDING_APPROVAL");

  return <>
    <section className="mb-7 rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Ola updates</p><h1 className="mt-3 text-3xl font-extrabold">Franchisee approval in progress.</h1><p className="mt-2 text-sm text-rail-muted">Your nominated franchisee owner reviews and accepts the BOQ. You can track its status here.</p></section>
    {waiting.length === 0 ? <EmptyState title="No BOQ is waiting for franchisee approval" hint="Once Kurchi sends a BOQ, its approval status will appear here." /> : <div className="space-y-4">{waiting.map((project) => { const items = repo.items(project.id, user.role); const total = items.reduce((sum, item) => sum + (item.finalPrice ?? 0) * item.qty, 0); const franchisee = project.franchiseeId ? repo.vendorById(project.franchiseeId) : null; return <article key={project.id} className="rounded-3xl border bg-card p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Showroom scope</p><h2 className="mt-2 text-2xl font-extrabold">{project.site.city}</h2><p className="mt-1 text-sm text-muted-foreground">{items.length} items · {formatINR(total)}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-900"><Clock3 className="h-3.5 w-3.5"/> Awaiting franchisee</span></div><div className="mt-5 rounded-2xl bg-muted/55 p-4"><div className="flex gap-3"><Store className="mt-0.5 h-5 w-5 text-primary"/><div><p className="font-extrabold">{franchisee?.contactName || "Franchisee owner to be assigned"}</p><p className="mt-1 text-sm text-muted-foreground">Only the franchisee owner can approve or request changes to this BOQ. Kurchi will notify you as soon as it is approved.</p></div></div></div></article>; })}</div>}
  </>;
}
