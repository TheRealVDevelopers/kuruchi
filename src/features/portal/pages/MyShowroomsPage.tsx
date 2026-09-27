import { Link } from "react-router-dom";
import { ArrowRight, BellRing, Building2, CheckCircle2, MapPin, Plus } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { EmptyState } from "@/components/app/Shell";

const LABEL: Record<string, string> = { ADVANCE_PENDING: "Waiting for advance", PRODUCTION: "Making your showroom", LOGISTICS: "On the way", DELIVERED: "Delivered at site", INSTALLATION: "Being installed", COMPLETED: "Ready" };

export default function MyShowroomsPage() {
  useDb();
  const { user } = useAuth();
  const projects = repo.projects(user);
  const waiting = projects.filter((project) => project.status === "PENDING_APPROVAL" || repo.changeOrders(project.id).some((change) => change.status === "PENDING_CLIENT"));
  const awaitingAccounts = projects.filter((project) => project.initialPayment?.status === "PENDING_VERIFICATION");
  const awaitingKurchi = projects.filter((project) => project.initialPayment?.status === "VERIFIED" && !project.adminAcceptedAt);
  return <>
    <section className="mb-7 grid gap-4 lg:grid-cols-[1.5fr_.7fr]"><div className="rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Ola rollout desk</p><h1 className="mt-3 max-w-xl text-3xl font-extrabold sm:text-4xl">Open a showroom in minutes.</h1><p className="mt-3 max-w-lg text-sm leading-relaxed text-rail-muted">Add the location and franchisee owner. Choose a BOQ, submit payment details, then Accounts and Kurchi complete the rollout.</p><Link to="/portal/showrooms/new" className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"><Plus className="h-4 w-4" /> Add new showroom</Link></div><Link to="/portal" className="rounded-[2rem] border bg-card p-6 shadow-sm"><BellRing className="h-7 w-7 text-primary" /><p className="mt-8 text-4xl font-extrabold">{awaitingAccounts.length || awaitingKurchi.length || waiting.length}</p><p className="mt-1 font-bold">{awaitingAccounts.length ? "With Accounts" : awaitingKurchi.length ? "With Kurchi for review" : "Decisions waiting"}</p><p className="mt-2 text-sm text-muted-foreground">{awaitingAccounts.length ? "Payment details are waiting for verification." : awaitingKurchi.length ? "Payment is verified and Kurchi can now start work." : "BOQ approvals and scope changes that need your attention."}</p></Link></section>
    <section>
      <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Locations</p><h2 className="mt-2 text-2xl font-extrabold">Franchisee showrooms</h2></div><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{projects.length} total</span></div>
      {projects.length === 0 ? <EmptyState title="No showrooms yet" hint="Add the first location and franchisee owner to begin." /> : <div className="space-y-3">
        {projects.map((project) => {
          const status = project.operationalStatus ?? "PRODUCTION";
          const progress = status === "COMPLETED" ? 100 : status === "INSTALLATION" ? 82 : status === "DELIVERED" ? 68 : status === "LOGISTICS" ? 48 : status === "PRODUCTION" ? 28 : 8;
          const pendingReview = project.initialPayment?.status === "PENDING_VERIFICATION";
          const pendingAdmin = project.initialPayment?.status === "VERIFIED" && !project.adminAcceptedAt;
          return <Link key={project.id} to={`/portal/projects/${project.id}`} className="group grid gap-4 rounded-3xl border bg-card p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md md:grid-cols-[2fr_1fr_auto]">
            <div>
              <div className="flex items-center gap-2"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Building2 className="h-5 w-5" /></span><div><h3 className="text-lg font-extrabold">{project.name}</h3><p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" /> {project.site.city} · {project.site.contactName}</p></div></div>
              {pendingReview ? <p className="mt-4 text-sm font-bold text-amber-700">Payment is with Accounts for verification</p> : pendingAdmin ? <p className="mt-4 text-sm font-bold text-primary">Payment verified — Kurchi will now start the showroom</p> : <div><p className="mt-4 text-sm font-bold">{LABEL[status]}</p><div className="mt-2 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-muted-foreground">{progress}% through the showroom journey</p></div>}
            </div>
            <div className="rounded-2xl bg-muted/55 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Advance</p><p className="mt-2 text-xl font-extrabold">{project.advanceReceivedPct ?? 0}%</p><p className="mt-1 text-xs text-muted-foreground">of {project.advanceRequiredPct ?? 0}% planned</p></div>
            <div className="flex items-center justify-between gap-3 md:flex-col md:items-end"><span className="text-sm font-bold text-primary">Open</span>{status === "COMPLETED" && <CheckCircle2 className="h-5 w-5 text-red-600" />}<ArrowRight className="h-5 w-5 text-muted-foreground transition group-hover:translate-x-1" /></div>
          </Link>;
        })}
      </div>}
    </section>
  </>;
}
