import { useState, type ReactNode } from "react";
import { BookOpen, FileText, Printer, Receipt, ShieldCheck, Truck } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatINR, roundMoney } from "@/lib/money";
import { formatDate } from "@/lib/useAction";
import { printTaxInvoice } from "@/lib/printInvoice";
import type { Invoice, Project } from "@/types";
import { DocumentFile } from "./DocumentFile";
import { SHARED_DOCUMENT_CATEGORIES } from "./model";
import { useSharedDocuments } from "./useSharedDocuments";

type BillingGroup = ReturnType<typeof repo.franchiseeBilling>[number];

export function FranchiseeDocuments() {
  useDb();
  const { user } = useAuth();
  const library = useSharedDocuments();
  if (!user?.active || user.role !== "VENDOR") return null;
  const billing = repo.franchiseeBilling(user);
  const billingCount = billing.reduce((count, group) => count + group.invoices.length + group.challans.length + group.attachments.length + group.creditNotes.length + group.shipments.filter((shipment) => shipment.ewayBillNo || shipment.lrNumber).length, 0);

  return <aside className="min-w-0 space-y-4" aria-label="Franchisee documents">
    <div className="px-1"><p className="eyebrow">Document centre</p><h2 className="mt-1 text-xl font-extrabold">Everything in one place</h2></div>
    {SHARED_DOCUMENT_CATEGORIES.map((category, index) => {
      const entries = library.documents.filter((entry) => entry.category === category.id);
      const Icon = index === 0 ? ShieldCheck : BookOpen;
      return <DocumentContainer key={category.id} id={category.id} title={category.label} count={entries.length} icon={<Icon className="h-5 w-5"/>} subtitle="Shared by Kurchi · For every franchisee">
        <p className="text-xs leading-relaxed text-muted-foreground">{category.hint}</p>
        {library.loading ? <p role="status" className="rounded-xl bg-muted/50 p-3 text-sm">Loading documents…</p> : library.error ? <div role="alert" className="rounded-xl bg-muted/50 p-3 text-sm"><p>{library.error}</p><button type="button" onClick={library.retry} className="mt-2 min-h-9 font-bold text-primary">Try again</button></div> : entries.length ? <div className="max-h-72 space-y-3 overflow-y-auto pr-1">{entries.map((entry) => <DocumentFile key={entry.id} {...entry}/>)}</div> : <p className="rounded-xl border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">{category.id === "KURCHI_KYC" ? "Company KYC documents" : "Instruction manuals"} will appear here when Kurchi uploads them.</p>}
      </DocumentContainer>;
    })}
    <DocumentContainer id="INVOICES" title="Invoices & Delivery Documents" count={billingCount} icon={<Receipt className="h-5 w-5"/>} subtitle="Private to your showroom">
      <p className="text-xs leading-relaxed text-muted-foreground">Your bills, delivery challans, e-way details and billing attachments.</p>
      {billingCount ? <div className="max-h-[32rem] space-y-4 overflow-y-auto pr-1">{billing.map((group) => <BillingDocuments key={group.project.id} group={group}/>)}</div> : <p className="rounded-xl border border-dashed p-3 text-xs leading-relaxed text-muted-foreground">Your billing documents will appear here when Kurchi Accounts adds them.</p>}
    </DocumentContainer>
  </aside>;
}

function DocumentContainer({ id, title, subtitle, count, icon, children }: { id: string; title: string; subtitle: string; count: number; icon: ReactNode; children: ReactNode }) {
  return <section aria-labelledby={`container-${id}`} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
    <div className="flex items-start gap-3 border-b bg-gradient-to-br from-primary/5 to-card p-4">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-primary/10 bg-card text-primary">{icon}</span>
      <div className="min-w-0 flex-1"><h3 id={`container-${id}`} className="text-sm font-extrabold leading-snug">{title}</h3><p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p></div>
      <span aria-label={`${count} documents`} className="rounded-full bg-primary/10 px-2 py-1 text-xs font-bold tabular-nums text-primary">{count}</span>
    </div>
    <div className="space-y-3 p-4">{children}</div>
  </section>;
}

function BillingDocuments({ group }: { group: BillingGroup }) {
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const { project } = group;
  if (!group.invoices.length && !group.challans.length && !group.attachments.length && !group.creditNotes.length && !group.shipments.some((shipment) => shipment.ewayBillNo || shipment.lrNumber)) return null;
  return <section className="space-y-3 border-t pt-4">
    <div><h3 className="break-words text-sm font-extrabold">{project.name || project.site.city}</h3><p className="mt-0.5 text-xs text-muted-foreground">{project.code}</p></div>
    {group.invoices.map((entry) => <article key={entry.id} className="rounded-2xl border bg-background p-3"><p className="eyebrow">Tax invoice</p><p className="mt-1 break-all font-mono text-sm font-bold">{entry.number}</p><p className="mt-1 text-sm font-bold">{formatINR(entry.netPayable)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(entry.issuedAt)} · {entry.status.replace(/_/g, " ").toLowerCase()}</p><button type="button" onClick={() => setInvoice(entry)} className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-primary"><FileText className="h-3.5 w-3.5"/>View bill</button></article>)}
    {group.challans.map((entry) => <details key={entry.id} className="rounded-2xl border bg-background p-3"><summary className="cursor-pointer text-sm font-bold"><span className="eyebrow block">Delivery challan</span><span className="mt-1 block break-all font-mono">{entry.number}</span></summary><dl className="mt-3 space-y-2 text-xs"><Detail label="Issued" value={formatDate(entry.issuedAt)}/><Detail label="Bill to" value={entry.billTo.name}/><Detail label="Delivery" value={entry.shipTo.address}/><Detail label="Taxable value" value={formatINR(entry.taxableValue)}/></dl></details>)}
    {group.shipments.filter((shipment) => shipment.ewayBillNo || shipment.lrNumber).map((shipment) => <details key={shipment.id} className="rounded-2xl border bg-background p-3"><summary className="cursor-pointer text-sm font-bold"><span className="eyebrow block">{shipment.ewayBillNo ? "E-way bill" : "Transport receipt"}</span><span className="mt-1 inline-flex items-center gap-2 break-all font-mono"><Truck className="h-4 w-4 shrink-0"/>{shipment.ewayBillNo || shipment.lrNumber}</span></summary><dl className="mt-3 space-y-2 text-xs">{shipment.ewayBillValidTill && <Detail label="Valid until" value={formatDate(shipment.ewayBillValidTill)}/>}<Detail label="Transporter" value={shipment.transporterName || "Pending"}/><Detail label="Vehicle" value={shipment.vehicleNo || "Pending"}/>{shipment.lrNumber && <Detail label="LR number" value={shipment.lrNumber}/>}<Detail label="Shipment status" value={shipment.status.replace(/_/g, " ").toLowerCase()}/></dl></details>)}
    {group.creditNotes.map((note) => <article key={note.id} className="rounded-2xl border bg-background p-3"><p className="eyebrow">Credit note</p><p className="mt-1 break-all font-mono text-sm font-bold">{note.number}</p><p className="mt-1 text-sm font-bold">{formatINR(note.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{note.reason}</p></article>)}
    {group.attachments.length > 0 && <div className="space-y-2"><h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Uploaded billing attachments</h4>{group.attachments.map((entry) => <DocumentFile key={entry.id} name={entry.name} fileUrl={entry.fileUrl}/>)}</div>}
    {invoice && <InvoiceDetails invoice={invoice} project={project} onClose={() => setInvoice(null)}/>}
  </section>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 break-words font-semibold">{value}</dd></div>;
}

function InvoiceDetails({ invoice, project, onClose }: { invoice: Invoice; project: Project; onClose: () => void }) {
  const [error, setError] = useState("");
  const seller = repo.sellerProfile();
  const canPrint = [seller.legalName, seller.gstin, seller.pan, seller.address, seller.state, seller.pincode].every((value) => value?.trim());
  const credits = repo.creditNotes(invoice.id).reduce((sum, note) => sum + note.amount, 0);
  const balance = Math.max(0, roundMoney(invoice.netPayable - invoice.amountReceived - credits));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl">
      <DialogHeader><DialogTitle>{invoice.number}</DialogTitle><DialogDescription>{project.name} · Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueDate)}</DialogDescription></DialogHeader>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-left">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{invoice.lines.map((line, index) => <tr key={index} className="border-t"><td className="p-3">{line.description}<p className="mt-1 text-xs text-muted-foreground">HSN {line.hsn}</p></td><td className="p-3 text-right">{line.qty}</td><td className="whitespace-nowrap p-3 text-right">{formatINR(line.rate)}</td><td className="whitespace-nowrap p-3 text-right">{formatINR(line.taxableValue)}</td></tr>)}</tbody></table></div>
      <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">{[
        ["Taxable value", invoice.taxableValue],
        ...(invoice.taxMode === "IGST" ? [["IGST", invoice.igst]] : [["CGST", invoice.cgst], ["SGST", invoice.sgst]]),
        ["Invoice total", invoice.total], ["Retention", invoice.retentionAmount], ["Net payable", invoice.netPayable],
        ["Payments received", invoice.amountReceived], ...(credits ? [["Credit notes", credits]] : []), ["Balance due", balance],
      ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="font-bold">{formatINR(Number(amount))}</dd></div>)}</dl>
      {canPrint ? <button type="button" onClick={() => {
        setError("");
        try { if (!printTaxInvoice(invoice, project, repo.clientById(invoice.clientId))) setError("Allow popups in your browser to print this invoice."); }
        catch { setError("Ask Kurchi Accounts to complete the invoice details before printing."); }
      }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"><Printer className="h-4 w-4"/>Print / Save PDF</button> : <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Kurchi Accounts needs to complete the seller details before a printable tax invoice is available.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}
