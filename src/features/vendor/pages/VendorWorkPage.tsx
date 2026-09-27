import { useState } from "react";
import { CheckCircle2, ChevronRight, Hammer, Layers3, WalletCards } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { formatINR } from "@/lib/money";
import { EmptyState, PageHeader } from "@/components/app/Shell";

export default function VendorWorkPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [request, setRequest] = useState("");
  if (!user) return null;
  const projects = repo.projects(user);
  const kits = repo.kits().filter((kit) => kit.active);

  return <>
    <PageHeader eyebrow="Franchisee workspace" title={`Welcome, ${user.name.split(" ")[0]}`} description="Choose your showroom BOQ, approve the final scope, then follow every next step in one place." />
    {projects.length === 0 ? <EmptyState title="Your location is being set up" hint="Ola or Kurchi will add your showroom location shortly. Your BOQ choices will appear here." /> : <div className="space-y-5">{projects.map((project) => {
      const items = repo.itemsRaw(project.id);
      const value = items.reduce((sum, item) => sum + item.pricing.finalPrice * item.qty, 0);
      const required = project.advanceRequiredPct ?? 0;
      const received = project.advanceReceivedPct ?? 0;
      const advanceReady = received >= required;
      return <section key={project.id} className="overflow-hidden rounded-3xl border bg-card"><div className="bg-primary px-5 py-5 text-primary-foreground sm:px-7"><p className="text-xs font-bold uppercase tracking-[.16em] text-primary-foreground/70">Your showroom</p><h2 className="mt-1 text-2xl font-extrabold">{project.site.city}</h2><p className="mt-1 text-sm text-primary-foreground/80">{project.site.address}</p></div><div className="p-5 sm:p-7">
        <div className="grid gap-3 md:grid-cols-3"><div className="rounded-2xl border bg-muted/40 p-4"><p className="eyebrow">BOQ amount</p><p className="mt-2 text-xl font-extrabold">{formatINR(value)}</p></div><div className="rounded-2xl border bg-muted/40 p-4"><p className="eyebrow">Advance received</p><p className="mt-2 text-xl font-extrabold">{received}% <span className="text-sm font-semibold text-muted-foreground">of {required}% required</span></p></div><div className={`rounded-2xl border p-4 ${advanceReady ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><p className="eyebrow">Next status</p><p className="mt-2 text-lg font-extrabold">{advanceReady ? "Ready for production" : "Advance pending"}</p></div></div>
        {!project.boqMode && <div className="mt-6"><p className="eyebrow">Step 1</p><h3 className="mt-1 text-xl font-extrabold">Choose how you want to build your showroom</h3><div className="mt-4 grid gap-3 md:grid-cols-2"><button type="button" onClick={() => run(() => act.chooseFranchiseeBoq(user, project.id, { mode: "STANDARD", kitId: kits[0]?.id }), "Standard BOQ selected", "Review the scope below, then approve it.")} className="rounded-2xl border-2 border-primary bg-primary/5 p-5 text-left hover:bg-primary/10"><Layers3 className="h-7 w-7 text-primary"/><p className="mt-3 text-lg font-extrabold">Standard BOQ</p><p className="mt-1 text-sm text-muted-foreground">Choose Kurchi’s ready-made showroom package. Fastest option.</p><p className="mt-4 flex items-center gap-1 text-sm font-bold text-primary">Choose standard <ChevronRight className="h-4 w-4" /></p></button><button type="button" onClick={() => setRequest(project.id)} className="rounded-2xl border-2 p-5 text-left hover:bg-muted"><Hammer className="h-7 w-7 text-primary"/><p className="mt-3 text-lg font-extrabold">Modular BOQ</p><p className="mt-1 text-sm text-muted-foreground">Request custom products, quantities, finishes or layout changes.</p><p className="mt-4 flex items-center gap-1 text-sm font-bold text-primary">Request customisation <ChevronRight className="h-4 w-4" /></p></button></div></div>}
        {project.boqMode === "MODULAR" && <div className="mt-6 rounded-2xl border border-primary/25 bg-primary/5 p-4"><p className="font-extrabold">Your modular request is with Kurchi</p><p className="mt-1 text-sm text-muted-foreground">{project.modularRequest}</p></div>}
        {project.boqMode === "STANDARD" && <div className="mt-6"><p className="eyebrow">Step 2</p><h3 className="mt-1 text-xl font-extrabold">Review and approve your BOQ</h3><div className="mt-3 divide-y rounded-2xl border">{items.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><span className="font-semibold">{item.name}</span><span className="text-sm text-muted-foreground">{item.qty} {item.unit}</span></div>)}</div>{!project.franchiseeApprovedAt && <button type="button" onClick={() => run(() => act.approveBoq(user, project.id), "BOQ approved", "Kurchi Admin has been notified. Production can begin after the advance requirement is met.")} className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"><CheckCircle2 className="h-4 w-4" /> Approve BOQ</button>}{project.franchiseeApprovedAt && <p className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-900"><CheckCircle2 className="h-4 w-4" /> BOQ approved</p>}</div>}
        {request === project.id && <form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const note = String(form.get("request") ?? ""); const ok = run(() => act.chooseFranchiseeBoq(user, project.id, { mode: "MODULAR", request: note }), "Modular request sent", "Kurchi Admin will contact you to finalise the BOQ."); if (ok) setRequest(""); }} className="mt-5 rounded-2xl border bg-muted/40 p-4"><p className="font-extrabold">Tell us what you would like to customise</p><textarea required name="request" rows={3} placeholder="Example: Add two visitor chairs, use walnut finish and change reception counter layout." className="mt-3 w-full rounded-xl border bg-background p-3 text-sm"/><div className="mt-3 flex gap-2"><button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Send request</button><button type="button" onClick={() => setRequest("")} className="rounded-xl border px-4 py-2.5 text-sm font-bold">Cancel</button></div></form>}
      </div></section>;
    })}</div>}
  </>;
}
