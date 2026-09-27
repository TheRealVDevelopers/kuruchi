import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { EmptyState, PageHeader } from "@/components/app/Shell";
import type { Vendor } from "@/types";

export default function FranchiseesPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<Vendor | null>(null);
  if (!user) return null;
  const franchisees = repo.vendors("FRANCHISEE");
  const ola = repo.clients()[0];
  const start = () => { setForm({ ...act.blankVendor(), type: "FRANCHISEE", clientId: ola?.id }); setAdding(true); };
  return <><PageHeader eyebrow="Ola rollout" title="Franchisee owners" description="Add the franchisee owner and location. Login invitation is connected in the Firebase onboarding step." actions={<button type="button" onClick={start} className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><UserPlus className="h-4 w-4" /> Add franchisee</button>} />
    {adding && form && <form onSubmit={(event) => { event.preventDefault(); const ok = run(() => act.saveVendor(user, form), "Franchisee added", "Their BOQ can now be prepared by Kurchi."); if (ok) { setAdding(false); setForm(null); } }} className="mb-5 rounded-2xl border-2 border-primary/25 bg-card p-5"><h2 className="text-lg font-extrabold">New franchisee owner</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><input required value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value, name: event.target.value ? `${event.target.value} — Franchisee` : form.name })} placeholder="Owner name" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/><input required value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} placeholder="Mobile number" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/><input required value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} placeholder="Showroom city" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/><input required value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} placeholder="State" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/></div><div className="mt-4 flex gap-2"><button className="rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground">Add franchisee</button><button type="button" onClick={() => { setAdding(false); setForm(null); }} className="rounded-xl border px-4 py-2.5 text-sm font-bold">Cancel</button></div></form>}
    {franchisees.length === 0 ? <EmptyState title="No franchisee owners yet" hint="Add the first showroom partner to start a BOQ." /> : <div className="grid gap-3 md:grid-cols-2">{franchisees.map((partner) => <article key={partner.id} className="rounded-2xl border bg-card p-5"><p className="eyebrow">Franchisee owner</p><h2 className="mt-1 text-lg font-extrabold">{partner.contactName}</h2><p className="mt-1 text-sm text-muted-foreground">{partner.city}, {partner.state} · {partner.contactPhone}</p><p className="mt-4 text-sm font-semibold text-primary">Ready for BOQ setup</p></article>)}</div>}
  </>;
}
