import { useState } from "react";
import { Printer } from "lucide-react";
import { repo } from "@/data/repo";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { InvoicePartyDetails } from "@/features/accounts/components/InvoicePartyDetails";
import { formatINR, roundMoney } from "@/lib/money";
import { formatDate } from "@/lib/useAction";
import { printTaxInvoice } from "@/lib/printInvoice";
import type { Invoice, Project } from "@/types";

export function InvoiceDetailsDialog({ invoice, project, onClose }: { invoice: Invoice; project?: Project; onClose: () => void }) {
  const [error, setError] = useState("");
  const seller = repo.sellerProfile();
  const parties = invoice.billTo && invoice.shipTo ? { billTo: invoice.billTo, shipTo: invoice.shipTo } : repo.invoiceParties(project);
  const canPrint = [seller.legalName, seller.gstin, seller.pan, seller.address, seller.state, seller.pincode].every((value) => value?.trim());
  const credits = repo.creditNotes(invoice.id).reduce((sum, note) => sum + note.amount, 0);
  const balance = Math.max(0, roundMoney(invoice.netPayable - invoice.amountReceived - credits));
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-2xl">
      <img src="/images/kurchi-logo.png" alt="Kurchi" className="h-auto w-40"/>
      <DialogHeader><DialogTitle>{invoice.number}</DialogTitle><DialogDescription>{project?.name || "Franchisee"} · Issued {formatDate(invoice.issuedAt)} · Due {formatDate(invoice.dueDate)}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2"><InvoicePartyDetails title="Bill to" party={parties.billTo}/><InvoicePartyDetails title="Ship to" party={parties.shipTo}/></div>
      <div className="overflow-x-auto rounded-xl border"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-left">Description</th><th className="p-3 text-right">Qty</th><th className="p-3 text-right">Rate</th><th className="p-3 text-right">Amount</th></tr></thead><tbody>{invoice.lines.map((line, index) => <tr key={index} className="border-t"><td className="p-3">{line.description}<p className="mt-1 text-xs text-muted-foreground">HSN {line.hsn}</p></td><td className="p-3 text-right">{line.qty}</td><td className="whitespace-nowrap p-3 text-right">{formatINR(line.rate)}</td><td className="whitespace-nowrap p-3 text-right">{formatINR(line.taxableValue)}</td></tr>)}</tbody></table></div>
      <dl className="ml-auto w-full max-w-sm space-y-2 text-sm">{[
        ["Taxable value", invoice.taxableValue],
        ...(invoice.taxMode === "IGST" ? [["IGST", invoice.igst]] : [["CGST", invoice.cgst], ["SGST", invoice.sgst]]),
        ["Invoice total", invoice.total], ["Retention", invoice.retentionAmount], ["Net payable", invoice.netPayable],
        ["Payments received", invoice.amountReceived], ...(credits ? [["Credit notes", credits]] : []), ["Balance due", balance],
      ].map(([label, amount]) => <div key={String(label)} className="flex justify-between gap-4"><dt className="text-muted-foreground">{label}</dt><dd className="font-bold">{formatINR(Number(amount))}</dd></div>)}</dl>
      {canPrint ? <button type="button" onClick={() => {
        setError("");
        try { if (!printTaxInvoice(invoice, project)) setError("Allow popups in your browser to print this invoice."); }
        catch { setError("Ask Kurchi Accounts to complete the invoice details before printing."); }
      }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground"><Printer className="h-4 w-4"/>Print / Save PDF</button> : <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">Kurchi Accounts needs to complete the seller details before a printable tax invoice is available.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </DialogContent>
  </Dialog>;
}
