import { useState } from "react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";

export default function BusinessProfilePage() {
  useDb(); const { user } = useAuth(); const run = useAction(); const [form, setForm] = useState(() => ({ ...repo.sellerProfile() }));
  if (!user) return null;
  const field = (key: keyof typeof form, label: string, required = false) => <label className="text-sm font-bold">{label}<input required={required} value={form[key] as string} onChange={(event) => setForm({ ...form, [key]: event.target.value })} className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 font-normal"/></label>;
  return <div className="mx-auto max-w-4xl"><section className="rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Kurchi settings</p><h1 className="mt-2 text-3xl font-extrabold">Legal seller profile</h1><p className="mt-2 text-sm text-rail-muted">Fill this once. The saved details will be used on every tax invoice, challan and e-way worksheet.</p></section><form onSubmit={(event) => { event.preventDefault(); run(() => act.saveSellerProfile(user, form), "Kurchi legal profile saved"); }} className="mt-5 rounded-3xl border bg-card p-5 sm:p-6"><div className="grid gap-4 sm:grid-cols-2">{field("legalName", "Legal business name", true)}{field("gstin", "GSTIN", true)}{field("pan", "PAN", true)}{field("state", "Registered state", true)}{field("pincode", "Registered PIN code", true)}{field("invoicePrefix", "Invoice prefix", true)}<label className="text-sm font-bold sm:col-span-2">Registered address<textarea required value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-xl border bg-background p-3 font-normal"/></label>{field("email", "Accounts email")}{field("phone", "Accounts mobile")}</div><h2 className="mt-7 text-lg font-extrabold">Bank details shown on invoices</h2><div className="mt-3 grid gap-4 sm:grid-cols-2">{field("bankName", "Bank name")}{field("accountName", "Account holder name")}{field("accountNumber", "Account number")}{field("ifsc", "IFSC code")}</div><button className="mt-6 min-h-12 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground">Save legal profile</button></form></div>;
}
