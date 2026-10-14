import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { EmptyState, PageHeader } from "@/components/app/Shell";
import { Field } from "@/components/app/Form";
import type { Vendor } from "@/types";

export default function FranchiseesPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [form, setForm] = useState<Vendor | null>(null);
  if (!user || user.role !== "ADMIN") return null;
  const franchisees = repo.vendors("FRANCHISEE");
  const isNew = Boolean(form && !franchisees.some((owner) => owner.id === form.id));
  const start = () => setForm({ ...act.blankVendor(), type: "FRANCHISEE", clientId: repo.clients()[0]?.id });

  return <>
    <PageHeader eyebrow="Ola rollout" title="Franchisee owners" description="Add and manage the franchisee owner and location." actions={<button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><UserPlus className="h-4 w-4" /> Add franchisee</button>} />
    {form && <form onSubmit={(event) => {
      event.preventDefault();
      if (run(() => act.saveFranchiseeOwner(user, form), isNew ? "Franchisee added" : "Franchisee updated")) setForm(null);
    }} className="mb-5 rounded-2xl border-2 border-primary/25 bg-card p-5">
      <h2 className="text-lg font-extrabold">{isNew ? "New franchisee owner" : "Edit franchisee owner"}</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field id="owner-name" required label="Owner name" value={form.contactName} onChange={(value) => setForm({ ...form, contactName: value })}/>
        <Field id="owner-phone" required type="tel" label="Mobile number" value={form.contactPhone} onChange={(value) => setForm({ ...form, contactPhone: value })}/>
        <Field id="owner-email" type="email" label="Email" value={form.email ?? ""} onChange={(value) => setForm({ ...form, email: value })}/>
        <Field id="owner-city" required label="Showroom city" value={form.city} onChange={(value) => setForm({ ...form, city: value })}/>
        <Field id="owner-state" required label="State" value={form.state} onChange={(value) => setForm({ ...form, state: value })}/>
      </div>
      <div className="mt-4 flex gap-2"><button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">{isNew ? "Add franchisee" : "Save changes"}</button><button type="button" onClick={() => setForm(null)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">Cancel</button></div>
    </form>}
    {franchisees.length === 0 ? <EmptyState title="No franchisee owners yet" hint="Add the first showroom partner to start a BOQ." /> : <div className="grid gap-3 md:grid-cols-2">{franchisees.map((partner) => <article key={partner.id} className="rounded-2xl border bg-card p-5">
      <p className="eyebrow">Franchisee owner</p><h2 className="mt-1 text-lg font-extrabold">{partner.contactName}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{partner.city}, {partner.state} · {partner.contactPhone}</p>
      {partner.email && <p className="mt-1 break-all text-sm text-muted-foreground">{partner.email}</p>}
      <div className="mt-4 flex gap-2"><button type="button" aria-label={`Edit ${partner.contactName}`} onClick={() => setForm({ ...partner })} className="min-h-10 rounded-xl border px-4 text-sm font-bold">Edit</button><button type="button" aria-label={`Delete ${partner.contactName}`} onClick={() => {
        if (!window.confirm(`Delete franchisee owner ${partner.contactName}? Owners linked to showrooms or login accounts must be reassigned first.`)) return;
        if (run(() => act.deleteFranchiseeOwner(user, partner.id), "Franchisee deleted") && form?.id === partner.id) setForm(null);
      }} className="min-h-10 rounded-xl border px-4 text-sm font-bold text-destructive">Delete</button></div>
    </article>)}</div>}
  </>;
}
