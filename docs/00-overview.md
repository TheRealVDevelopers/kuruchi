# Kurchi Projects — Overview & Scope

> Internal operations platform for Kurchi's retail roll-out / interior fit-out business.
> Sibling app to `smart-furnish` (Firebase: kurchi-app) and `ecommerce` (Firebase: kurchi--e-commerce).

---

## 1. The problem we are solving

Kurchi manufactures and sources furniture (storage units, sofas, chairs, counters, tables)
and installs them at client showrooms across India. The current live example is an
**Ola showroom roll-out** — many near-identical showrooms opening in many cities.

Today the flow is: sort items in Bangalore → ship to a city → a local vendor installs.

What breaks today:

| Complaint from site | Root cause | What the app must do |
|---|---|---|
| "Item has not arrived" | No consignment-level tracking, only phone calls | Crate-level tracking with LR no. + ETA, visible to site |
| "Item is broken" | No proof of condition at packing — nobody can prove where it broke | Mandatory packing photos + receipt photos, timestamped |
| "Which item is missing?" | Packing list lives in someone's Excel / WhatsApp | Digital packing list per crate, scan-to-receive |
| "Work is delayed" | Delay is discovered late; nobody owns the next step | Status per item + stale-status escalation + SLA timers |
| "Client keeps asking for updates" | Manual status calls | Read-only client portal |
| "We lost money on this site" | Replacement / rework cost never gets booked to the project | Budget vs Actual including rework cost |

**One-line goal:** every item, from factory to installed, has a known status, a known
owner, and a photo trail — visible to the right person and nobody else.

---

## 2. What the app is (and is not)

**Is:**
- An internal operations + tracking system for fit-out projects
- A light product catalogue (public brochure — no cart, no checkout)
- A GST-ready document generator (Delivery Challan, Tax Invoice, E-way Bill data)
- A read-only progress portal for clients

**Is not (v1):**
- Not a full ERP / accounting ledger — Tally or Zoho Books stays the book of record
- Not a CAD / drawing tool — drawings are uploaded as files
- Not an e-commerce store — no cart, no online payment
- Not a payroll / attendance system

---

## 3. Structural decision: Programme → Project → Item

Ola is not one project. It is a **programme** of many showrooms. Model it in three levels:

```
CLIENT            Ola Electric
  └── PROGRAMME   "Ola Showroom Roll-out FY26"   (shared BOQ kit, shared rate card)
        ├── PROJECT   Ola Showroom — Kochi, Kerala
        ├── PROJECT   Ola Showroom — Delhi Rohini
        └── PROJECT   Ola Showroom — Pune Kothrud
              └── BOQ LINE ITEMS   (2x Storage Unit A, 6x Visitor Chair, 1x Cash Counter …)
                    └── CRATES / CONSIGNMENTS
```

Why this matters: with 50 showrooms on the same kit, creating project #37 must take
**2 minutes, not 2 hours**. Templates hang off the programme. This one decision is the
biggest time-saver in the whole system.

---

## 4. Roles (5)

| Role | One-line job | Can edit? |
|---|---|---|
| **Super Admin** | Owner / MD. Sees everything, changes nothing. | No — view + comment only |
| **Admin** | The operator. Creates projects, BOQ, pricing, sourcing, daily status up to installation start. | Yes — full, except finance postings |
| **Installation** | Site / vendor team. Takes over at "material received". Updates install progress, damage, snags. | Yes — only assigned projects, only site fields |
| **Accounts** | DC, tax invoice, e-way bill data, payments, vendor bills, GST reports. | Yes — finance only |
| **Client** | Ola's project manager. Watches progress, approves, signs handover. | No — view + approve / sign only |

Detailed matrix: see [`01-roles-and-permissions.md`](01-roles-and-permissions.md).

---

## 5. Deep dive: 14 additions that were not in the original brief

Ranked by value-for-effort. **P0** items are not "nice to have" — they are the reason
the app exists.

| # | Addition | Why it matters | Phase |
|---|---|---|---|
| 1 | **BOQ templates ("Showroom Kits")** | 50 near-identical showrooms. Clone a kit, adjust quantity, done. Cuts setup from hours to minutes and removes copy-paste errors. | **P0** |
| 2 | **Crate-level tracking + QR label** | "Item not arrived" is unanswerable at item level. Pack items into crates, print a QR sticker, scan at dispatch and at site. Tells you *which crate* is missing, not "something". | **P0** |
| 3 | **Mandatory photo proof at pack and at receipt** | Settles every "it was already broken" argument, and tells you whether to claim from the transporter or fix the factory. Without it, damage cost is a black hole. | **P0** |
| 4 | **Delivery Challan vs Tax Invoice split, with Bill-to / Ship-to** | Goods move to site *before* sale. Under GST that is a Delivery Challan (Rule 55), not an invoice. Bill to Ola HQ, ship to the showroom — different GSTINs and addresses. Getting this wrong means notices. | **P0** |
| 5 | **Site-readiness checklist before dispatch** | Dispatching to a site where civil / flooring / power is not done means goods sit in a corridor and get damaged. A short checklist gate before dispatch prevents the most expensive failure mode. | **P0** |
| 6 | **Stale-status escalation (SLA timers)** | If an item has not moved in N days, it surfaces automatically on Admin and Super Admin dashboards. Delay is found in 3 days, not 3 weeks. | **P0** |
| 7 | **Replacement / reverse-logistics loop** | A damaged item must spawn a replacement that re-enters production and is *costed to the project*. Today this cost is invisible — it is the main silent margin killer. | **P0** |
| 8 | **Snag (punch) list + digital handover certificate** | "Installed" and "accepted" are different things. Snag list with photos, then a client-signed completion certificate PDF. Unlocks the final invoice. | **P0** |
| 9 | **WhatsApp notifications** | Site vendors in tier-2/3 cities will not check email or log in daily. "Consignment LR 2291 out for delivery — confirm receipt" on WhatsApp. Adoption depends on this. | P1 |
| 10 | **Offline-tolerant PWA for installers** | Basements and under-construction malls have no signal. Queue photo uploads and status updates, sync when back online. | P1 |
| 11 | **Vendor scorecard** | On-time %, damage-on-arrival %, snag count, rework cost per installer. Lets you stop using the bad vendors — a measurable saving. | P1 |
| 12 | **Client approval log (drawings / samples) with SLA** | A large share of delay is client-side. Logging "drawing sent 2 Mar, approved 19 Mar" protects Kurchi in penalty discussions. | P1 |
| 13 | **Retention + Defect Liability Period tracking** | Typically 5–10% retained, released after 6–12 months. Nobody remembers to claim it. A reminder queue is free money recovered. | P1 |
| 14 | **Full audit log (who changed what, when)** | Disputes are settled by timestamps. Also needed before any client trusts the numbers. | P1 |

Also worth having later: production capacity / factory load view, stock-on-hand with soft
reservation, transport cost allocation per project, programme-level Gantt across cities,
document vault with versioning, and Excel / PDF export on every report.

---

## 6. Glossary

| Term | Meaning |
|---|---|
| **BOQ** | Bill of Quantities — the item list for one project |
| **Kit / Template** | Reusable BOQ preset for a standard showroom type |
| **DC** | Delivery Challan — GST document for moving goods without a sale |
| **LR** | Lorry Receipt — transporter's consignment note |
| **E-way Bill** | Mandatory e-document for consignments over ₹50,000 |
| **POD** | Proof of Delivery |
| **GRN** | Goods Receipt Note — what site confirms on arrival |
| **Snag / Punch list** | Defects found after installation, before acceptance |
| **DLP** | Defect Liability Period — warranty window after handover |
| **Retention** | % of value held back by client, released after DLP |
| **Change Order / Variation** | Scope added or removed after BOQ approval |
| **HSN** | Harmonised System Nomenclature — GST product code |

---

## 7. Decisions locked (21 Sep 2026)

| Decision | Choice |
|---|---|
| Money model | **Four fields** — `basePrice` (factory/vendor cost), `sellingPrice` (quoted), `finalPrice` (agreed), and the computed `landedCost` = base + transport + installation + rework. "Actual price" means landed cost. Quoted margin and real margin are both stored. |
| Client portal | **In v1**, with BOQ and change-order approval and OTP handover signing. Makes field-level masking a launch blocker. |
| GST | **Generate + export.** GST-correct DC and invoice PDFs, full e-way bill worksheet, GSTR-1-shaped export. No GSP subscription; e-invoice and NIC APIs stay an upgrade path. |

Everything still open is in [`06-open-questions.md`](06-open-questions.md).

---

## 8. Document map

| File | Contents |
|---|---|
| `00-overview.md` | This file — context, scope, additions |
| `01-roles-and-permissions.md` | Role matrix, field-level visibility, route guards |
| `02-workflow.md` | State machines + the full if/else business-rule catalogue |
| `03-screens.md` | Every page, per role, with what is on it |
| `04-data-model.md` | Firestore collections, fields, indexes, security rules |
| `05-roadmap.md` | Build phases — what ships when |
| `06-open-questions.md` | Decisions needed from Kurchi and the client |
