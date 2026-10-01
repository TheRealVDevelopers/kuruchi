import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Calendar, MapPin, Plus, Trash2 } from "lucide-react";
import { repo, NOW } from "@/data/repo";
import { useDb } from "@/data/store";
import { useAuth } from "@/features/auth/AuthContext";
import { EmptyState } from "@/components/app/Shell";
import DeleteDataDialog from "../components/DeleteDataDialog";

const LABEL: Record<string, string> = { ADVANCE_PENDING: "Advance pending", PRODUCTION: "In production", LOGISTICS: "Moving to site", DELIVERED: "At site", INSTALLATION: "Installation", COMPLETED: "Completed" };

export default function ProjectsListPage() {
  useDb();
  const { user } = useAuth();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const hq = user?.role === "SUPER_ADMIN";
  const admin = user?.role === "ADMIN";
  const base = hq ? "/hq" : "/admin";
  const projects = repo.projects(user);
  return <>
    <section className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Showroom directory</p><h1 className="mt-2 text-3xl font-extrabold">All locations</h1><p className="mt-2 text-sm text-muted-foreground">Open a location to see its simple journey and next action.</p></div>
      {admin && <div className="flex flex-wrap gap-2"><Link to="/admin/data" className="inline-flex min-h-12 items-center rounded-2xl border px-5 text-sm font-bold">Manage data</Link><Link to="/admin/projects/new" className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-5 text-sm font-extrabold text-primary-foreground"><Plus className="h-4 w-4" /> Create showroom</Link></div>}
    </section>
    {projects.length === 0 ? <EmptyState title="No showrooms created yet" hint="Create the first showroom when a franchisee location is ready." /> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {projects.map((project) => {
        const stage = project.operationalStatus ?? "PRODUCTION";
        const days = Math.ceil((new Date(project.targetCompletionDate).getTime() - NOW.getTime()) / 86_400_000);
        const alerts = Number(project.flags.hasOpenTickets) + Number(project.flags.overdue) + Number(project.flags.hasCriticalSnags);
        return <article key={project.id} className="group rounded-[1.75rem] border bg-card shadow-sm transition hover:border-primary/45 hover:shadow-md">
          <Link to={`${base}/projects/${project.id}`} className="block rounded-[1.75rem] p-5">
            <div className="flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/10 text-primary"><MapPin className="h-5 w-5" /></span><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${alerts ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground"}`}>{alerts ? `${alerts} needs help` : LABEL[stage]}</span></div>
            <h2 className="mt-5 text-xl font-extrabold">{project.site.city}</h2><p className="mt-1 text-sm text-muted-foreground">{project.site.contactName} · {project.code}</p>
            <div className="mt-5 flex items-center justify-between border-t pt-4 text-sm"><span className="flex items-center gap-1.5 text-muted-foreground"><Calendar className="h-4 w-4" /> {days < 0 ? `${Math.abs(days)} days late` : `${days} days left`}</span><ArrowRight className="h-4 w-4 text-primary transition group-hover:translate-x-1" /></div>
          </Link>
          {admin && <div className="border-t px-5 py-2"><button type="button" onClick={() => setDeletingId(project.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-primary hover:bg-primary/10"><Trash2 className="h-4 w-4" /> Delete project</button></div>}
        </article>;
      })}
    </div>}
    {admin && deletingId && <DeleteDataDialog scope="PROJECTS" projectIds={[deletingId]} onClose={() => setDeletingId(null)} />}
  </>;
}
