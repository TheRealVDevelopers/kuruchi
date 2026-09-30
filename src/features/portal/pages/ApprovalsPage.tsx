import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { EmptyState } from "@/components/app/Shell";

export default function ApprovalsPage() {
  useDb(); const { user } = useAuth();
  if (!user) return null;
  const changeRequests = repo.projects(user).flatMap((project) => repo.changeOrders(project.id).filter((change) => change.status === "PENDING_CLIENT").map((change) => ({ project, change })));
  return <><section className="mb-7 rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Ola decisions</p><h1 className="mt-3 text-3xl font-extrabold">Your BOQ is confirmed at setup.</h1><p className="mt-2 text-sm text-rail-muted">When you create a showroom, your selected Standard or Modular BOQ is final. Accounts verifies payment next; Kurchi then starts production.</p></section>{changeRequests.length === 0 ? <EmptyState title="No decisions waiting" hint="There is no second BOQ approval step. Any future scope changes will appear here." /> : <div className="space-y-3">{changeRequests.map(({ project, change }) => <article key={change.id} className="rounded-3xl border bg-card p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-primary">Scope change</p><h2 className="mt-2 text-xl font-extrabold">{project.site.city} · {change.title}</h2><p className="mt-2 text-sm text-muted-foreground">{change.reason}</p></article>)}</div>}</>;
}
