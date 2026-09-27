import { Link } from "react-router-dom";
import { ArrowRight, Camera, CircleAlert, MapPin, PackageCheck, Wrench } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { EmptyState } from "@/components/app/Shell";
import { OfflineBanner } from "@/components/app/SiteKit";
import { ItemStatusBadge } from "@/components/app/StatusBadge";

export default function MySitesPage() {
  useDb();
  const { user } = useAuth();
  const projects = repo.projects(user);
  return <>
    <OfflineBanner />
    <section className="mb-7 rounded-[2rem] bg-rail px-5 py-7 text-rail-foreground sm:px-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Kurchi field app</p><h1 className="mt-2 text-3xl font-extrabold">What are you working on today?</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-rail-muted">Open a site, receive what arrived, fit the items and report anything that needs help.</p></section>
    {projects.length === 0 ? <EmptyState title="No showrooms are active today" hint="Showrooms appear here as Kurchi begins the rollout." /> : <div className="grid gap-4 lg:grid-cols-2">{projects.map((project) => {
      const unreceived = repo.crates(project.id).filter((crate) => !crate.receivedAt).length;
      const ready = repo.itemsRaw(project.id).filter((item) => ["RECEIVED_OK", "INSTALL_ASSIGNED", "INSTALL_IN_PROGRESS"].includes(item.status)).length;
      const issues = repo.tickets(project.id).filter((ticket) => ticket.status !== "RESOLVED").length;
      const action = unreceived ? `Receive ${unreceived} delivery${unreceived > 1 ? " items" : " item"}` : ready ? `Fit ${ready} item${ready > 1 ? "s" : ""}` : "Open site";
      const itemPreview = repo.items(project.id, user!.role).slice(0, 3);
      return <article key={project.id} className="overflow-hidden rounded-[1.75rem] border bg-card shadow-sm"><div className="flex items-start justify-between gap-3 p-5"><div><p className="text-xs font-bold uppercase tracking-[.15em] text-primary">Showroom BOQ</p><h2 className="mt-2 text-2xl font-extrabold">{project.name}</h2><p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><MapPin className="h-4 w-4" /> {project.site.address}</p></div><span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold">{project.operationalStatus?.replace(/_/g, " ") || "Ready"}</span></div><div className="grid grid-cols-3 border-y bg-muted/30 text-center"><div className="p-3"><p className="text-xl font-extrabold">{unreceived}</p><p className="mt-1 text-[11px] font-semibold text-muted-foreground">to receive</p></div><div className="border-x p-3"><p className="text-xl font-extrabold">{ready}</p><p className="mt-1 text-[11px] font-semibold text-muted-foreground">to fit</p></div><div className="p-3"><p className="text-xl font-extrabold">{issues}</p><p className="mt-1 text-[11px] font-semibold text-muted-foreground">issues</p></div></div><div className="space-y-2 p-4">{itemPreview.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/55 px-3 py-2"><span className="truncate text-sm font-bold">{item.name} × {item.qty}</span><ItemStatusBadge status={item.status}/></div>)}{itemPreview.length < repo.items(project.id, user!.role).length && <p className="px-1 text-xs font-bold text-primary">Open to view all BOQ items</p>}</div><div className="grid gap-2 px-4 pb-4 sm:grid-cols-2"><Link to={`/site/${project.id}?tab=${unreceived ? "receive" : "install"}`} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"><PackageCheck className="h-5 w-5" /> {action}<ArrowRight className="h-4 w-4" /></Link><div className="grid grid-cols-2 gap-2"><Link to={`/site/${project.id}?tab=snags`} aria-label="Report issue" className="inline-flex min-h-14 items-center justify-center rounded-2xl border text-sm font-bold"><CircleAlert className="h-5 w-5" /></Link><Link to={`/site/${project.id}`} aria-label="Open site details" className="inline-flex min-h-14 items-center justify-center rounded-2xl border text-sm font-bold"><Camera className="h-5 w-5" /></Link></div></div><p className="px-5 pb-4 text-xs text-muted-foreground"><Wrench className="mr-1 inline h-3.5 w-3.5" /> Tap the warning button to report a problem with photos.</p></article>;
    })}</div>}
  </>;
}
