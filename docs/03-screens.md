# Screens — every page, per role

Route prefix per role: `/` public, `/hq` Super Admin, `/admin` Admin, `/site`
Installation, `/accounts` Accounts, `/portal` Client.

---

## A. Public site (no login)

| Route | Page | Contents |
|---|---|---|
| `/` | Home | Hero, what Kurchi does, 3 product category tiles, "Trusted by" logos, CTA to contact, header buttons: **Staff Login** / **Admin Login** (both → `/login`) |
| `/products` | Catalogue | Filter by category (Storage Units, Sofas, Chairs — extensible), grid of cards: photo, name, short spec, starting price |
| `/products/:slug` | Product detail | Photo gallery, full spec table (dimensions, material, finish, warranty), price, "Enquire" button |
| `/about` | About | Company, factory, capability, cities served |
| `/contact` | Contact | Form (name, company, phone, city, message) → stored + emailed |
| `/login` | Login | Email + password, forgot password. On success, route by role. |

Catalogue content is managed by Admin under `/admin/catalogue`. Keep it simple — this is a
brochure, not a store.

---

## B. Super Admin — `/hq` (read-only + comments)

The whole role is one question: *are we making money and is anything stuck?*

### `/hq` — Command centre

**KPI row**
- Active projects · Completed this month · Overdue projects
- Programme value (₹) · Recognised revenue · Outstanding receivables
- Gross margin % (this month vs last)
- Rework cost this month (the number that should hurt)

**Charts** (Recharts — already a dependency)
1. Projects by status — stacked bar
2. Revenue vs cost vs margin — monthly line, last 12 months
3. Margin % by project — horizontal bar, worst 10 first
4. Rework cost by cause (Transit / Manufacturing / Site handling / Short supply) — donut
5. On-time delivery % by month — line with target band
6. Project count by city — India map or ranked bar
7. Receivables ageing — 0-30 / 31-60 / 61-90 / 90+ stacked bar

**Attention tiles** (each clicks through to a filtered list)
- Delayed projects (past expected completion)
- Stale items (no status change past SLA)
- Open critical snags
- Rule overrides this month
- Retention due for release in next 60 days

### `/hq/projects` — All projects
Table: project, client, city, status, % complete, value, margin %, expected vs actual
finish, days stale. Sortable, filterable, exportable.

### `/hq/projects/:id` — Project view
Same layout as the Admin project page but every control is disabled. One thing is
enabled: **a comment box on every tab.** Comments notify Admin.

### `/hq/finance` — P&L
Per programme and per project: revenue, cost, transport, installation, rework, margin.
Budget vs actual variance. Drill down to line item.

### `/hq/people` — Team & vendor performance
Admin throughput, installation vendor scorecards (on-time %, damage %, snag count,
rework cost caused), client responsiveness (average approval turnaround).

---

## C. Admin — `/admin` (the workhorse)

### `/admin` — Dashboard
- **Needs attention** queue, ordered by urgency: overdue approvals, stale items, open
  damage tickets, dispatch blocked, e-way bill missing, client not responding
- Today: dispatches planned, deliveries expected, installs starting
- Quick actions: New project · Apply kit · Record dispatch · Raise change order

### `/admin/clients`
List → detail. Client company, GSTIN, billing address, contacts, programmes, all projects,
total value, outstanding.

### `/admin/programmes`
List → detail. Programme name, client, default kit, rate card, city list, aggregate
progress across all its projects, programme Gantt.

### `/admin/projects` — List
Filters: status, client, programme, city, installation team, stale only, overdue only.
Columns: code, name, city, status, % complete, value, margin %, ETA, owner.

### `/admin/projects/new` — Create project
Form: client → programme → project name, site address, city, state, PIN, site contact
name + phone, start date, target completion, installation team, **apply kit** (dropdown of
BOQ templates), retention %, DLP months.

### `/admin/projects/:id` — Project workspace (tabbed)

| Tab | Contents |
|---|---|
| **Summary** | Status, progress bar, dates, site contact, value, margin, quick stats, activity feed |
| **BOQ** | The item table. Add from catalogue / add custom / apply kit. Columns: item, spec, qty, unit, cost price, selling price, final price, margin %, sourcing (make/buy/stock), vendor, status, ETA. Inline edit while DRAFT; read-only after approval. Bulk status update. |
| **Sourcing** | Grouped by make / buy / stock. PO creation, vendor assignment, lead times, production schedule, QC log |
| **Packing** | Crate builder — drag items into crates, crate weight/dimensions, photo upload (mandatory), print QR labels (PDF sheet) |
| **Dispatch** | Consignment list. Per consignment: crates, DC no., e-way bill no., transporter, vehicle, LR no., driver phone, dispatch date, ETA, POD upload. Site-readiness checklist gate shown here. |
| **Site** | GRN status per crate, damage/shortage tickets, replacement decisions |
| **Installation** | Team assigned, daily progress log with photos, zone-wise completion, snag list |
| **Change orders** | CO list, create CO, delta value, approval status |
| **Documents** | Drawings, approvals, PO copies, DC, invoices, LR, POD, handover certificate. Versioned. |
| **Finance** | Invoices raised, payments received, retention, project P&L (Admin sees cost; this tab is hidden from client entirely) |
| **Comments** | Threaded, with @mentions; Super Admin comments land here |
| **Audit** | Who changed what, when |

### `/admin/catalogue` — Products
CRUD for the public catalogue: name, category, slug, photos, spec fields, HSN code,
default cost price, default selling price, lead time, unit, active/inactive.

> HSN code belongs on the product, not the invoice — set it once, use it everywhere.

### `/admin/kits` — BOQ templates
Create a kit: name, description, which programme it belongs to, line items with default
quantities and prices. "Apply to project" clones it. Version kits so an old project keeps
the kit it was built from.

### `/admin/vendors`
Two types in one place: **suppliers** (who make/sell to Kurchi) and **installation teams**
(who install at site). Fields: name, type, city/state coverage, GSTIN, contact, rate card,
bank details, scorecard summary.

### `/admin/dispatch` — Cross-project dispatch board
Everything ready to pack / packed / in transit across all projects, in one view. This is
where the logistics person lives all day.

### `/admin/tickets` — Damage & shortage
All open tickets across projects, with cause, age, decision pending.

### `/admin/users`
Create users, assign role, assign installation team or client, activate/deactivate.

### `/admin/reports`
Project status report, dispatch register, damage analysis, vendor performance, margin
report. Every one exportable to Excel and PDF.

---

## D. Installation — `/site` (mobile-first)

Design this for a phone held in one hand, in a half-built showroom, possibly offline.
Large tap targets, camera-first, minimal typing.

### `/site` — My sites
Card list of assigned projects: name, city, status, what needs doing today, days to target.

### `/site/:projectId` — Site workspace

| Tab | Contents |
|---|---|
| **Incoming** | Consignments on the way: crate count, LR no., ETA, transporter phone |
| **Receive** | **Scan QR** (or pick crate) → checklist of expected items → tap Received OK / Damaged / Short per item → camera opens for photos → submit. Works offline, queues for sync. |
| **Install** | Item checklist by zone. Mark in-progress / installed. Daily progress note + mandatory photo. |
| **Snags** | Raise snag (description + photo + severity), see assigned snags, close with photo |
| **Handover** | Pre-handover checklist, request handover, view certificate |

No prices anywhere on this interface (rule AC-03).

### `/site/tickets` — My damage reports
Status of everything reported: raised → triaged → replacement dispatched → resolved.

---

## E. Accounts — `/accounts`

### `/accounts` — Dashboard
Receivables ageing, invoices due this week, payments received this month, vendor bills to
pay, retention due for release, GST filing checklist for the month.

### `/accounts/challans`
List + create Delivery Challans. Create form pre-fills from a dispatch consignment:
bill-to, ship-to, line items with HSN, quantity, taxable value, transport details.
Generates a numbered PDF.

### `/accounts/eway`
E-way bill worksheet per consignment. Shows Part A and Part B fields assembled from the DC
and dispatch record, with a **copy-to-clipboard / export JSON** action for the GST portal
(and a clean upgrade path to the NIC e-way bill API later). Flags any missing mandatory
field before you go to the portal.

### `/accounts/invoices`
Create tax invoice from a project / milestone / DC. Auto-computes CGST+SGST vs IGST from
place of supply (rule FN-02). Retention deduction line. PDF output in GST format with all
mandatory fields. Credit note support. Issued invoices are immutable.

### `/accounts/payments`
Record receipts against invoices, part payments, ageing, client statement.

### `/accounts/vendor-bills`
Bills against POs, 3-way check (PO vs GRN vs bill), approval hold if over-billed (FN-09).

### `/accounts/retention`
Every project's retention: amount, DLP end date, days remaining, claim status.

### `/accounts/gst`
Month-wise outward supply register (GSTR-1 shape), HSN summary, tax liability summary.
Export to Excel/CSV for the CA or for Tally import.

> Deliberate scope line: this app *prepares* GST data in the right shape. Filing still
> happens on the GST portal or in Tally. Trying to be the filing software is a trap.

---

## F. Client — `/portal` (read-only + approvals)

Clean, confident, zero internal detail.

### `/portal` — My projects
Cards per showroom: city, status, % complete, target date, a green/amber/red health dot,
anything waiting on the client.

### `/portal/projects/:id`

| Tab | Contents |
|---|---|
| **Progress** | Big progress bar, stage tracker (Approved → Production → Dispatched → At site → Installing → Handover), expected completion, recent updates with site photos |
| **Scope** | Item list: name, spec, qty, **selling price only**, status. No cost, no vendor, no margin. |
| **Deliveries** | Consignments: crate count, dispatched date, ETA, delivered date, LR no. |
| **Approvals** | Pending BOQ / change order / drawing approvals with Approve / Reject + comment |
| **Snags** | Raise a snag with photo; see status of all snags |
| **Handover** | Certificate preview → **Sign** (OTP to registered mobile) |
| **Documents** | Their copies only: quotation, approved BOQ, DC, invoices, handover certificate |
| **Comments** | Message thread with the Kurchi team |

---

## G. Shared components worth building once

| Component | Used by |
|---|---|
| `StatusBadge` — colour + label for all item/project statuses | everywhere |
| `StatusTimeline` — vertical stepper with timestamps and actor | project, item, ticket |
| `PhotoUploader` — camera capture, compress client-side, queue when offline | site, packing, snags |
| `MoneyField` — role-aware; renders nothing for roles that cannot see it | BOQ, finance |
| `ItemTable` — column set driven by role | BOQ, portal scope, site checklist |
| `CommentThread` — threaded, @mentions, attachments | all roles |
| `ExportButton` — Excel + PDF from any table | admin, hq, accounts |
| `RuleGate` — wraps an action, checks a business rule, shows why it is blocked and offers override if allowed | dispatch, handover, invoice |
| `SlaPill` — days in current status vs SLA, turns amber/red | admin queues |

`RuleGate` is worth calling out: putting every block from `02-workflow.md` §5 behind one
component means the UI always tells the user *why* something is disabled, instead of a
greyed-out button with no explanation. That single detail is most of the difference
between an app people use and one they work around.
