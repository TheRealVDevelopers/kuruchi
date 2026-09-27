import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, ArrowRight, CheckCircle2, ClipboardList, FileCheck2, HardHat,
  PackageCheck, Pause, Play, ReceiptIndianRupee, Route, Truck, UserPlus,
  Wrench,
} from "lucide-react";

type Step = {
  title: string;
  role: string;
  action: string;
  detail: string;
  route: string;
  routeLabel: string;
  Icon: typeof UserPlus;
  tone: string;
};

const STEPS: Step[] = [
  { title: "Create the client", role: "Admin", action: "Admin is adding the client and rollout programme.", detail: "First add the company, GST details and contact person. Then create its rollout programme before opening a showroom project.", route: "/admin/clients?new=1", routeLabel: "Admin → Add client", Icon: UserPlus, tone: "from-violet-500/30 to-fuchsia-500/10" },
  { title: "Open a showroom project", role: "Admin", action: "Admin is creating a new showroom in the rollout.", detail: "The city, site address, target opening date, client, programme and installation team are saved in one project.", route: "/admin/projects/new", routeLabel: "Admin → New project", Icon: ClipboardList, tone: "from-sky-500/30 to-cyan-500/10" },
  { title: "Build the BOQ", role: "Admin", action: "Admin is adding furniture, quantities, pricing and sourcing to the BOQ.", detail: "Each chair, sofa, table or storage unit is selected from the catalogue and assigned to the showroom zone.", route: "/admin/catalogue", routeLabel: "Admin → Catalogue", Icon: FileCheck2, tone: "from-amber-400/30 to-orange-500/10" },
  { title: "Approve the scope", role: "Client", action: "Client is reviewing and approving the showroom scope.", detail: "The client sees the agreed commercial scope, accepts it or sends it back with a comment. Production begins only after approval.", route: "/portal/approvals", routeLabel: "Client portal → Approvals", Icon: CheckCircle2, tone: "from-emerald-500/30 to-teal-500/10" },
  { title: "Plan suppliers and dates", role: "Admin", action: "Admin is creating the rollout plan and issuing vendor purchase orders.", detail: "The project schedule makes delays visible early. Each PO has a supplier, value and promised ready date.", route: "/admin/tools", routeLabel: "Admin → Operations tools", Icon: Route, tone: "from-indigo-500/30 to-blue-500/10" },
  { title: "Confirm material ready", role: "Vendor", action: "Vendor is confirming that the ordered work is ready for Kurchi.", detail: "The supplier updates its own committed work. Kurchi can immediately see whether the promised date is safe or late.", route: "/vendor", routeLabel: "Vendor → My work", Icon: PackageCheck, tone: "from-pink-500/30 to-rose-500/10" },
  { title: "Dispatch and track", role: "Admin + Accounts", action: "The consignment is dispatched, then marked in transit with ETA and transport details.", detail: "Crate photos, LR, vehicle, challan and e-way information travel with the shipment. The client sees the live delivery status.", route: "/admin/dispatch", routeLabel: "Admin → Dispatch board", Icon: Truck, tone: "from-orange-500/30 to-red-500/10" },
  { title: "Install and prove progress", role: "Installation", action: "Installation is happening at site and the team is uploading daily proof of work.", detail: "The site team confirms receipt, adds photos, marks each item installed and raises damage or shortage reports if required.", route: "/site", routeLabel: "Installation → My sites", Icon: HardHat, tone: "from-lime-500/30 to-green-500/10" },
  { title: "Resolve issues and bill", role: "Admin + Accounts", action: "Admin is resolving site issues while Accounts records billing and payment progress.", detail: "Tickets are closed with evidence. Accounts creates challans, GST invoices, receipts, credit notes and vendor-bill matches.", route: "/accounts", routeLabel: "Accounts → Dashboard", Icon: ReceiptIndianRupee, tone: "from-yellow-500/30 to-amber-500/10" },
  { title: "Sign handover", role: "Client", action: "Client is accepting the completed showroom and signing handover.", detail: "Once major work is complete and critical snags are closed, the client signs handover. The project moves into completion and DLP tracking.", route: "/portal", routeLabel: "Client portal → My showrooms", Icon: Wrench, tone: "from-teal-500/30 to-emerald-500/10" },
];

export default function WorkflowDemoPage() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(true);
  const step = STEPS[current];

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setCurrent((index) => (index + 1) % STEPS.length), 6500);
    return () => window.clearInterval(timer);
  }, [playing]);

  const move = (change: number) => setCurrent((index) => (index + change + STEPS.length) % STEPS.length);
  const Icon = step.Icon;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Kurchi
      </Link>
      <div className="mt-7 max-w-3xl">
        <p className="eyebrow text-primary">Kurchi Projects walkthrough</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-5xl">One showroom. The whole journey.</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground sm:text-lg">Play this guided walkthrough to see exactly what each person does, where they click, and what changes at every stage.</p>
      </div>

      <section className={`relative mt-8 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${step.tone} p-5 shadow-2xl shadow-black/20 sm:p-9`}>
        <img src="/images/showroom-hero-v1.png" alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" />
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/85 to-card/25" />
        <div className="relative grid min-h-[24rem] items-end gap-8 md:grid-cols-[1fr_19rem]">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-background/35 px-3 py-1.5 text-xs font-bold backdrop-blur">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] text-primary-foreground">{current + 1}</span>
              Step {current + 1} of {STEPS.length} · {step.role}
            </div>
            <Icon className="mt-10 h-12 w-12 text-primary" />
            <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">{step.title}</h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">{step.detail}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-background/55 p-5 backdrop-blur-xl">
            <p className="eyebrow text-primary">Open this screen</p>
            <p className="mt-2 text-lg font-bold">{step.routeLabel}</p>
            <Link to={step.route} className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">
              Open the working screen <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border bg-card p-5 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary"><ClipboardList className="h-5 w-5" /></div>
          <div>
            <p className="eyebrow">What work is happening now</p>
            <p className="mt-1 text-lg font-extrabold">{step.action}</p>
          </div>
        </div>
        <div className="mt-5 flex shrink-0 items-center gap-2 sm:mt-0">
          <button type="button" onClick={() => move(-1)} className="rounded-xl border p-3 hover:bg-muted" aria-label="Previous step"><ArrowLeft className="h-4 w-4" /></button>
          <button type="button" onClick={() => setPlaying((value) => !value)} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground">{playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{playing ? "Pause" : "Play"}</button>
          <button type="button" onClick={() => move(1)} className="rounded-xl border p-3 hover:bg-muted" aria-label="Next step"><ArrowRight className="h-4 w-4" /></button>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-5 gap-2 sm:grid-cols-10">
        {STEPS.map((item, index) => <button key={item.title} type="button" onClick={() => { setCurrent(index); setPlaying(false); }} className={`h-2 rounded-full transition ${index === current ? "bg-primary" : "bg-muted hover:bg-muted-foreground/40"}`} aria-label={`Show step ${index + 1}: ${item.title}`} />)}
      </div>
    </div>
  );
}
