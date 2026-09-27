import { Link } from "react-router-dom";
import {
  ArrowRight, BarChart3, Boxes, CheckCircle2, ClipboardList, FileText,
  HardHat, IndianRupee, LayoutGrid, PackageCheck, Truck, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/types";
import { useAuth } from "@/features/auth/AuthContext";
import { EmptyState, PageHeader } from "@/components/app/Shell";

type Module = {
  name: string;
  description: string;
  how: string;
  to: string;
  icon: LucideIcon;
};

type Guide = {
  title: string;
  intro: string;
  first: Array<{ label: string; detail: string; to: string }>;
  modules: Module[];
  boundaries: string[];
};

const guides: Record<Role, Guide> = {
  SUPER_ADMIN: {
    title: "How to use the Command Centre",
    intro: "Your job is to spot risk early, ask the right question, and leave an auditable comment. You can see every number, but you cannot change operational or finance records.",
    first: [
      { label: "Start with attention", detail: "Open the Command centre and review stale items, blocked dispatches, rework and overdue sites.", to: "/hq" },
      { label: "Trace the exception", detail: "Open All projects to move from a city-level warning to the affected BOQ line or consignment.", to: "/hq/projects" },
      { label: "Comment, do not alter", detail: "Use Comments in a project workspace to assign follow-up; Admin keeps ownership of the change.", to: "/hq/projects" },
    ],
    modules: [
      { name: "Command centre", description: "The daily control room for margin, delays and operational risk.", how: "Read attention tiles first; use the charts to compare cities, projects and causes.", to: "/hq", icon: BarChart3 },
      { name: "All projects", description: "One view across every showroom.", how: "Filter by city or health, open the project, then comment on the exact issue.", to: "/hq/projects", icon: LayoutGrid },
      { name: "P&L", description: "Quoted versus real margin, including rework.", how: "Look for margin erosion and discuss a corrective action with Admin or Accounts.", to: "/hq/finance", icon: IndianRupee },
      { name: "Teams & vendors", description: "Reliability by installation team, transporter and supplier.", how: "Compare on-time work, damage patterns and rework before assigning future work.", to: "/hq/people", icon: HardHat },
    ],
    boundaries: ["You can comment on any project.", "You cannot edit BOQ, site status, documents, payments or master data.", "An override should be questioned, not silently accepted."],
  },
  ADMIN: {
    title: "How to run Operations",
    intro: "You own a project from kit selection through dispatch and installation handover. Work the queue from blocked dispatches and damage reports before starting new work.",
    first: [
      { label: "Create or open a project", detail: "Use a BOQ kit to start a showroom, confirm quantities and pricing, then send the BOQ for client approval.", to: "/admin/projects/new" },
      { label: "Prepare dispatch", detail: "Pack into crates, add real packing evidence, complete site readiness and send Accounts the document requirements.", to: "/admin/dispatch" },
      { label: "Resolve exceptions", detail: "Triage damage and shortage tickets; choose replacement, repair, waiver or transporter claim.", to: "/admin/tickets" },
    ],
    modules: [
      { name: "Dashboard", description: "Your priority queue for today.", how: "Fix blocked dispatches first, then stale items, damages and major snags.", to: "/admin", icon: BarChart3 },
      { name: "Projects", description: "The full workspace: BOQ, dispatch, site, installation and finance.", how: "Use tabs in order. Do not edit an approved BOQ; raise a change order instead.", to: "/admin/projects", icon: LayoutGrid },
      { name: "Dispatch board", description: "Every outgoing consignment across projects.", how: "Fill LR, transporter, vehicle, ETA and evidence. Resolve every red gate before dispatch.", to: "/admin/dispatch", icon: Truck },
      { name: "Damage & shortage", description: "The exception queue.", how: "Inspect evidence, select the cause and decision, then track the replacement until closure.", to: "/admin/tickets", icon: Wrench },
      { name: "Catalogue, kits & vendors", description: "Reusable operational master data.", how: "Keep HSN, price defaults, kit versions and vendor details current before the next project starts.", to: "/admin/kits", icon: Boxes },
    ],
    boundaries: ["You can override a blocked dispatch only with a reason.", "You cannot issue tax invoices or record payments.", "Never mark an item installed while its damage ticket is open."],
  },
  INSTALLATION: {
    title: "How to use the Site App",
    intro: "Use this from the site, one step at a time. Your evidence is what protects Kurchi when material is short, damaged or disputed.",
    first: [
      { label: "Check incoming material", detail: "Open My sites, select the showroom and read the LR, crates and ETA before the vehicle arrives.", to: "/site" },
      { label: "Receive every crate", detail: "Scan/select the crate, confirm all arrived, short or damaged, and add receipt evidence.", to: "/site" },
      { label: "Install and report", detail: "Post daily progress with a photo. Report damage immediately; raise snags before handover.", to: "/site/tickets" },
    ],
    modules: [
      { name: "My sites", description: "Assigned projects only, designed for a phone.", how: "Open your site, then use Incoming, Receive, Install and Snags in that order.", to: "/site", icon: HardHat },
      { name: "Receive", description: "Digital GRN for every crate.", how: "Tap All arrived, Some missing or Damaged. Never accept material without checking it.", to: "/site", icon: PackageCheck },
      { name: "Install", description: "Daily proof of site progress.", how: "Add a short note and at least one photo. The client sees published updates.", to: "/site", icon: CheckCircle2 },
      { name: "My reports", description: "Your submitted damage, shortage and snag records.", how: "Follow open reports until Admin gives a decision or the issue is resolved.", to: "/site/tickets", icon: ClipboardList },
    ],
    boundaries: ["You never see prices, costs, margins or vendor rates.", "Damage needs a cause and photo before it can be sent.", "Major snags must be closed before handover."],
  },
  ACCOUNTS: {
    title: "How to use Accounts",
    intro: "You protect the movement of goods and the cash cycle. Work documents before dispatch, then invoices, payments, retention and GST exports.",
    first: [
      { label: "Clear document blockers", detail: "Start on Dashboard. Create the Delivery Challan before goods move, then complete E-way Bill details where required.", to: "/accounts" },
      { label: "Issue the right invoice", detail: "Use Tax invoices only after the operational gate is met; final invoices require signed handover.", to: "/accounts/invoices" },
      { label: "Close the cash cycle", detail: "Record payment receipts, review ageing and watch retention/DLP release dates.", to: "/accounts/payments" },
    ],
    modules: [
      { name: "Dashboard", description: "Documents waiting on Accounts and outstanding cash.", how: "Clear red document blockers first, then work receivables by ageing.", to: "/accounts", icon: BarChart3 },
      { name: "Delivery challans", description: "GST document for goods moving before sale.", how: "Check bill-to, ship-to, GSTIN and consignment value before creating it.", to: "/accounts/challans", icon: FileText },
      { name: "E-way bills", description: "The worksheet for Part A/Part B data.", how: "Add the 12-digit number, transporter and vehicle before dispatch.", to: "/accounts/eway", icon: Truck },
      { name: "Invoices & payments", description: "Billing, receipts and ageing.", how: "Issue only approved milestones; record each receipt against its invoice.", to: "/accounts/invoices", icon: IndianRupee },
    ],
    boundaries: ["You cannot change the BOQ, sourcing, installation or site status.", "Do not issue a final invoice before client handover.", "Issued tax documents need a credit-note process, not overwriting."],
  },
  CLIENT: {
    title: "How to use your Showroom Portal",
    intro: "This is your live window into each showroom. You can see progress, delivery status, agreed scope and site updates without needing to call the project team.",
    first: [
      { label: "Open your showroom", detail: "Choose a city from My showrooms and review the progress tracker and latest site update.", to: "/portal" },
      { label: "Review approvals", detail: "Approve or reject BOQ and change requests with clear comments so the next step is unblocked.", to: "/portal/approvals" },
      { label: "Sign only after checking", detail: "When installation is complete and all major snags are closed, sign the handover using your OTP.", to: "/portal" },
    ],
    modules: [
      { name: "My showrooms", description: "A health view across your cities.", how: "Open a project to see current stage, delivery ETAs, scope and photos.", to: "/portal", icon: LayoutGrid },
      { name: "Approvals", description: "BOQ and change requests waiting on you.", how: "Approve when the agreed scope is correct; reject with a clear reason if it is not.", to: "/portal/approvals", icon: ClipboardList },
      { name: "Project progress", description: "Live updates from the installation team.", how: "Use Progress for site evidence, Scope for agreed rates, Deliveries for ETA and Snags to raise an issue.", to: "/portal", icon: CheckCircle2 },
      { name: "Handover", description: "Final acceptance.", how: "Confirm the work and use the OTP only when the showroom is ready to accept.", to: "/portal", icon: FileText },
    ],
    boundaries: ["You see final agreed rates, never Kurchi’s costs or margins.", "You cannot see internal notes, supplier details or other clients’ projects.", "A major snag prevents handover until it is closed or formally waived."],
  },
  VENDOR: {
    title: "How to use your Partner Workspace",
    intro: "This is your assigned Kurchi work queue. Confirm progress early so a promised delivery date never becomes a surprise for the site team or client.",
    first: [
      { label: "Review assigned work", detail: "Open My work and check the scope and promised date on every purchase order.", to: "/vendor" },
      { label: "Start work", detail: "Move a confirmed order to in progress when production or preparation starts.", to: "/vendor" },
      { label: "Confirm readiness", detail: "Mark work ready only when it can be received against the agreed commitment.", to: "/vendor" },
    ],
    modules: [
      { name: "My work", description: "Purchase orders and promised delivery dates assigned to your company.", how: "Keep the status accurate. Kurchi is notified when you start or confirm readiness.", to: "/vendor", icon: PackageCheck },
    ],
    boundaries: ["You see only work assigned to your company.", "You cannot view client pricing, internal margin or other vendors’ commitments.", "Tell Kurchi about a delay before changing an order status."],
  },
};

export default function RoleGuidePage() {
  const { user } = useAuth();
  if (!user) return <EmptyState title="Sign in to see your guide" />;

  const guide = guides[user.role];
  return (
    <>
      <PageHeader eyebrow={user.role.replace(/_/g, " ")} title={guide.title} description={guide.intro} />

      <section className="mb-8 rounded-xl border-2 border-primary/25 bg-primary/5 p-4 sm:p-5">
        <p className="eyebrow text-primary">Your first 10 minutes</p>
        <ol className="mt-4 grid gap-3 lg:grid-cols-3">
          {guide.first.map((step, index) => (
            <li key={step.label} className="rounded-lg border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary font-mono text-xs font-bold text-primary-foreground">{index + 1}</span>
                <div>
                  <h2 className="font-bold">{step.label}</h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.detail}</p>
                  <Link to={step.to} className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-primary hover:underline">
                    Open module <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mb-8">
        <p className="eyebrow mb-3">Modules in your app</p>
        <div className="grid gap-3 md:grid-cols-2">
          {guide.modules.map((module) => (
            <Link key={module.name} to={module.to} className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-primary/[0.02]">
              <module.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 flex items-center justify-between gap-3 font-bold">
                {module.name}<ArrowRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{module.description}</p>
              <p className="mt-3 border-t pt-3 text-sm leading-relaxed"><strong>How to use it:</strong> {module.how}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <p className="eyebrow">Your role boundaries</p>
        <ul className="mt-3 space-y-2">
          {guide.boundaries.map((rule) => (
            <li key={rule} className="flex gap-2 text-sm leading-relaxed">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{rule}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
