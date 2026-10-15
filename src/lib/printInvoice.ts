import type { Invoice, InvoiceParty, Project } from "@/types";
import { repo } from "@/data/repo";
import { requireSellerProfile } from "@/data/actions";
import { roundMoney } from "@/lib/money";

const money = (amount: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount);
const text = (value?: string) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character] ?? character);

function recipient(title: string, party: InvoiceParty, placeOfSupply?: string) {
  const gstin = party.gstin || (party.noGstinReason ? "Not registered" : "Not provided");
  return `<div class="box"><div class="label">${title} · Franchisee</div><div class="value">${text(party.name)}</div><div class="address">${text(party.address || "Showroom address unavailable")}</div><div>GSTIN: ${text(gstin)}</div><div>Contact: ${text(party.contactName || "Not provided")} · ${text(party.contactPhone || "Not provided")}</div>${party.email ? `<div>Email: ${text(party.email)}</div>` : ""}${placeOfSupply ? `<div>Place of supply: ${text(placeOfSupply)}</div>` : ""}</div>`;
}

/** Opens a clean A4 print sheet. The browser's Print dialog can also save it as a PDF. */
export function printTaxInvoice(invoice: Invoice, project?: Project) {
  const seller = requireSellerProfile();
  const parties = invoice.billTo && invoice.shipTo ? { billTo: invoice.billTo, shipTo: invoice.shipTo } : repo.invoiceParties(project);
  const logoUrl = `${window.location?.origin ?? ""}/images/kurchi-logo.png`;
  const challans = repo.challans(invoice.projectId);
  const challanReferences = invoice.challanIds.map((id) => challans.find((challan) => challan.id === id)?.number ?? "Not available");
  const advance = invoice.advanceApplied ?? 0;
  const otherReceipts = Math.max(0, roundMoney(invoice.amountReceived - advance));
  const credits = roundMoney(repo.creditNotes(invoice.id).reduce((sum, note) => sum + note.amount, 0));
  const balance = Math.max(0, roundMoney(invoice.netPayable - invoice.amountReceived - credits));
  const receiptRows = `${advance > 0 ? `<tr><td colspan="5" class="right">Advance applied</td><td class="right">−${money(advance)}</td></tr>` : ""}${otherReceipts > 0 ? `<tr><td colspan="5" class="right">Other payments received</td><td class="right">−${money(otherReceipts)}</td></tr>` : ""}${credits > 0 ? `<tr><td colspan="5" class="right">Credit notes</td><td class="right">−${money(credits)}</td></tr>` : ""}<tr><td colspan="5" class="right total">Balance due</td><td class="right total">${money(balance)}</td></tr>`;
  const popup = window.open("", "_blank");
  if (!popup) return false;
  try { popup.opener = null; } catch { /* Browser may restrict opener access. */ }
  const taxRows = invoice.taxMode === "IGST"
    ? `<tr><td colspan="5" class="right">IGST @ 18%</td><td class="right">${money(invoice.igst)}</td></tr>`
    : `<tr><td colspan="5" class="right">CGST @ 9%</td><td class="right">${money(invoice.cgst)}</td></tr><tr><td colspan="5" class="right">SGST @ 9%</td><td class="right">${money(invoice.sgst)}</td></tr>`;
  popup.document.write(`<!doctype html><html><head><title>${text(invoice.number)}</title><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#171717;font-size:12px;line-height:1.45;margin:0}.top{display:flex;justify-content:space-between;gap:24px;border:1px solid #222;border-top:4px solid #eb123b;padding:18px 16px}.seller{max-width:60%}.brand-logo{display:block;width:210px;max-width:100%;height:auto;margin:0 0 14px}.muted{color:#555}.title{font-size:23px;letter-spacing:.06em;font-weight:800;text-align:right;color:#eb123b;margin:4px 0 14px}.invoice-meta{min-width:200px;overflow-wrap:anywhere}.grid{display:grid;grid-template-columns:1fr 1fr;border:1px solid #222;border-top:0}.box{padding:14px;min-height:132px;overflow-wrap:anywhere}.box+ .box{border-left:1px solid #222}.address{margin:5px 0}.label{font-size:10px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.06em}.value{font-weight:700;margin-top:5px}table{border-collapse:collapse;width:100%;margin-top:0}th,td{border:1px solid #222;padding:7px;vertical-align:top}th{background:#f3f3f3;font-size:10px;text-transform:uppercase}.right{text-align:right}.total{font-size:14px;font-weight:800}.foot{margin-top:12px;display:flex;justify-content:space-between;gap:20px}.signature{width:220px;text-align:center;border-top:1px solid #222;padding-top:5px;margin-top:42px}.note{font-size:10px;color:#555}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}.no-print{display:none}}</style></head><body>
  <section class="top"><div class="seller"><img class="brand-logo" src="${text(logoUrl)}" alt="Kurchi — Irresistably Yours" width="735" height="291"><div class="value">${text(seller.legalName)}</div><div>${text(seller.address)}</div><div>GSTIN: ${text(seller.gstin)} · PAN: ${text(seller.pan)}</div></div><div class="invoice-meta"><div class="title">TAX INVOICE</div><div class="right"><b>Invoice No.</b> ${text(invoice.number)}<br><b>Date</b> ${new Date(invoice.issuedAt).toLocaleDateString("en-IN")}<br><b>Due date</b> ${new Date(invoice.dueDate).toLocaleDateString("en-IN")}</div></div></section>
  <section class="grid">${recipient("Bill to", parties.billTo)}${recipient("Ship to", parties.shipTo, invoice.placeOfSupplyState)}</section>
  <table><thead><tr><th>#</th><th>Description of goods / service</th><th>HSN/SAC</th><th class="right">Qty</th><th class="right">Rate</th><th class="right">Amount</th></tr></thead><tbody>${invoice.lines.map((line,index)=>`<tr><td>${index+1}</td><td>${text(line.description)}</td><td>${text(line.hsn)}</td><td class="right">${line.qty}</td><td class="right">${money(line.rate)}</td><td class="right">${money(line.taxableValue)}</td></tr>`).join("")}<tr><td colspan="5" class="right">Taxable value</td><td class="right">${money(invoice.taxableValue)}</td></tr>${taxRows}<tr><td colspan="5" class="right total">Invoice total</td><td class="right total">${money(invoice.total)}</td></tr>${invoice.retentionAmount ? `<tr><td colspan="5" class="right">Retention</td><td class="right">−${money(invoice.retentionAmount)}</td></tr>` : ""}<tr><td colspan="5" class="right total">Net payable</td><td class="right total">${money(invoice.netPayable)}</td></tr>${receiptRows}</tbody></table>
  <section class="foot"><div class="note">This is a computer-generated document.<br>Invoice is linked to ${invoice.challanIds.length ? `delivery challan(s): ${text(challanReferences.join(", "))}` : "the approved showroom scope"}.<br>Tax mode: ${invoice.taxMode === "IGST" ? "IGST" : "CGST + SGST"}.</div><div class="signature">Authorised signatory<br>For ${text(seller.legalName)}</div></section>
  <script>window.onload=()=>window.print()</script></body></html>`);
  popup.document.close();
  return true;
}
