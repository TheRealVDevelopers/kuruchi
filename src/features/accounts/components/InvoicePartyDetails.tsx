import type { InvoiceParty } from "@/types";

export function InvoicePartyDetails({ title, party }: { title: string; party: InvoiceParty }) {
  return <article className="rounded-2xl border bg-muted/35 p-4">
    <p className="text-xs font-extrabold uppercase tracking-wide text-muted-foreground">{title} · Franchisee</p>
    <p className="mt-2 break-words font-extrabold">{party.name}</p>
    <p className="mt-1 text-sm text-muted-foreground">GSTIN: {party.gstin || (party.noGstinReason ? "Not registered" : "Not provided")}</p>
    <p className="mt-1 text-sm text-muted-foreground">{party.contactName || "Contact not added"} · {party.contactPhone || "Mobile not added"}</p>
    {party.email && <p className="mt-1 break-all text-sm text-muted-foreground">{party.email}</p>}
    <p className="mt-2 text-sm leading-relaxed">{party.address || "Showroom address not added"}</p>
  </article>;
}
