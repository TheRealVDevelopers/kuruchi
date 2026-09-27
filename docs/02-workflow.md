# Workflow, State Machines & Business Rules

---

## 1. End-to-end flow (who touches what, when)

```
 ADMIN                        ACCOUNTS              INSTALLATION           CLIENT
   │
   ├─ Create client + programme
   ├─ Create project (city, site, dates)
   ├─ Apply BOQ kit / add items ───────────────────────────────────────────► sees scope
   ├─ Set sourcing (make / buy) + 3 prices
   ├─ Send BOQ for approval ──────────────────────────────────────────────► APPROVE / reject
   │                                                                          │
   ├─ Production / PO ◄───────────────────────────────────────────────────────┘
   ├─ QC pass
   ├─ Pack into crates + photos
   ├─ Site-readiness check ──────────────────────────────────────────────── confirm ready
   ├─ Request dispatch docs ──────► DC + e-way bill + LR
   ├─ Dispatch (vehicle, ETA) ───────────────────────────────────────────────► sees ETA
   │
   │                                        ┌── Receive + scan crates ──────► sees GRN
   │                                        ├── Report damage/shortage
   ├─ Replacement loop ◄────────────────────┤
   │                                        ├── Install progress + photos ──► sees % done
   │                                        ├── Snag list
   │                                        └── Request handover ───────────► SIGN handover
   │                                                                             │
   └──────────────────────────────► Final invoice ◄────────────────────────────┘
                                    Payments, retention, DLP reminder
```

---

## 2. Project state machine

Project status is **derived**, never typed by hand. It is recomputed from its line items
whenever an item changes. This removes the "somebody forgot to update the project status"
class of bug entirely.

```
DRAFT
  └─(BOQ submitted)─► PENDING_APPROVAL
                        ├─(client rejects)─► DRAFT
                        └─(client approves)─► APPROVED
                                               │
                                               ▼
                                          IN_PRODUCTION      (any item in production/PO)
                                               │
                                               ▼
                                          IN_DISPATCH        (any item packed or dispatched)
                                               │
                                               ▼
                                          AT_SITE            (any item delivered)
                                               │
                                               ▼
                                          INSTALLATION       (any item install in progress)
                                               │
                                               ▼
                                          SNAGGING           (all installed, snags open)
                                               │
                                               ▼
                                          HANDOVER_PENDING   (no open snags, awaiting sign)
                                               │
                                               ▼
                                          COMPLETED          (handover signed)
                                               │
                                               ▼
                                          CLOSED             (final paid + DLP expired)

Side states, set manually by Admin, reachable from any active state:
  ON_HOLD   (with reason + expected resume date)
  CANCELLED (with reason; locks all editing, keeps records)
```

**Derivation rule:** project status = the *earliest* stage that still has unfinished items.
If 90 items are installed and 1 is still in production, the project is `IN_PRODUCTION`.
Show the honest worst case, plus a progress bar for the rest.

---

## 3. Line item state machine (the heart of the system)

Every BOQ line carries its own status. This is what makes "where is my chair" answerable.

```
                      DRAFT
                        │ (BOQ approved)
                        ▼
                    APPROVED
                        │ (Admin sets sourcing)
            ┌───────────┴───────────┐
       make │                       │ buy
            ▼                       ▼
     IN_PRODUCTION             PO_PLACED
            │                       │ (goods in)
            ▼                       ▼
        QC_PENDING ◄────────────────┘
            │
      ┌─────┴─────┐
 fail │           │ pass
      ▼           ▼
 QC_FAILED   READY_TO_PACK
   │  └──► back to IN_PRODUCTION
   ▼
              PACKED            ← crate assigned + photos mandatory
                 │
                 ▼
             DISPATCHED         ← LR no., vehicle, e-way bill, ETA
                 │
                 ▼
             IN_TRANSIT
                 │
                 ▼
          DELIVERED_AT_SITE
                 │ (site scans / confirms)
       ┌─────────┼─────────────────┐
       ▼         ▼                 ▼
 RECEIVED_OK  RECEIVED_DAMAGED  SHORT_SUPPLIED
       │         │                 │
       │         └────────┬────────┘
       │                  ▼
       │        REPLACEMENT_REQUESTED ──► spawns a NEW line item at APPROVED
       │                                   (linked as replacement_for, cost booked to project)
       ▼
 INSTALL_ASSIGNED
       │
       ▼
 INSTALL_IN_PROGRESS
       │
       ▼
   INSTALLED
       │
   ┌───┴────┐
   │        │ (snag raised)
   │        ▼
   │    SNAG_OPEN ──(snag closed)──┐
   │                               │
   ▼                               ▼
 HANDED_OVER ◄─────────────────────┘

Terminal side-state: CANCELLED (with reason, from any pre-dispatch state)
```

### Status → who owns the next action

| Status | Owner | SLA (default, configurable) |
|---|---|---|
| APPROVED | Admin | 2 days to set sourcing |
| IN_PRODUCTION / PO_PLACED | Admin | per-item lead time |
| QC_PENDING | Admin | 1 day |
| READY_TO_PACK | Admin | 3 days |
| PACKED | Admin | 2 days to dispatch |
| DISPATCHED / IN_TRANSIT | Transporter | ETA date |
| DELIVERED_AT_SITE | Installation | 1 day to confirm receipt |
| RECEIVED_DAMAGED / SHORT | Admin | 2 days to decide replacement |
| INSTALL_ASSIGNED | Installation | 2 days to start |
| INSTALL_IN_PROGRESS | Installation | per plan |
| SNAG_OPEN | Installation | 5 days |

If a status sits past its SLA, the item is flagged **stale** and appears on the Admin
"Needs attention" queue and the Super Admin "Delays" tile. This is business rule ES-01.

---

## 4. Supporting flows

### 4a. Change Order (scope change after approval)

```
Client or Admin requests change
  │
  ├─ IF project status is DRAFT or PENDING_APPROVAL
  │     └─► edit the BOQ directly, no change order needed
  │
  └─ IF project is APPROVED or later
        └─► create CHANGE_ORDER  (CO-001, CO-002 …)
              ├─ add lines / remove lines / revise qty / revise price
              ├─ system computes delta value and delta schedule
              ├─ status: DRAFT → SENT → APPROVED / REJECTED
              ├─ IF APPROVED → new lines enter BOQ at APPROVED status,
              │                 project value and margin recalculated
              └─ IF REJECTED → nothing changes, but the request stays logged
```

Never edit an approved BOQ line in place. Revision history is what wins disputes.

### 4b. Damage / shortage → replacement

```
Installation reports issue at receipt or during install
  ├─ MUST attach ≥1 photo (blocked otherwise)
  ├─ MUST pick a cause: TRANSIT / MANUFACTURING / HANDLING_AT_SITE / SHORT_SUPPLY
  │
  ▼
TICKET raised → Admin triages
  ├─ cause = TRANSIT           → claim on transporter; rework cost booked to LOGISTICS
  ├─ cause = MANUFACTURING     → rework cost booked to PRODUCTION; QC flag on that item type
  ├─ cause = HANDLING_AT_SITE  → rework cost booked to the INSTALLATION VENDOR (scorecard hit)
  └─ cause = SHORT_SUPPLY      → check packing list; if packed-but-missing → transit claim,
                                  if never packed → Admin error, re-dispatch
  │
  ▼
Decision
  ├─ REPLACE  → new line item spawned, linked, re-enters production. Project cost += rework
  ├─ REPAIR   → repair task assigned to installation, cost logged
  └─ WAIVE    → client accepts as-is (needs client acknowledgement in portal)
```

The rework cost is the number nobody tracks today. Booking it to a cause is what turns
"we lost money" into "we lost ₹X to transit damage on the Kerala route".

### 4c. Snag list → handover

```
All items INSTALLED
  ▼
Installation runs a snag walkthrough (or client raises snags in the portal)
  ▼
Each snag: description + photo + severity (MINOR / MAJOR / CRITICAL) + assignee + due date
  ▼
IF any CRITICAL or MAJOR snag is open → handover BLOCKED
IF only MINOR snags open             → handover allowed only with client written waiver
IF zero snags open                   → handover certificate can be generated
  ▼
Handover certificate PDF: project, item list, photos, date, Kurchi rep, client rep
  ▼
Client signs in portal (typed name + OTP + timestamp + IP)
  ▼
Project → COMPLETED. DLP clock starts. Final invoice unblocked.
```

### 4d. Accounts document flow (GST-correct)

```
Goods leave the factory, sale has not happened yet
  ▼
DELIVERY CHALLAN (GST Rule 55)         ← not an invoice, no tax charged yet
  ├─ Bill-to: Ola HQ (GSTIN A, registered address)
  ├─ Ship-to: showroom site (GSTIN B or unregistered site address)
  ├─ HSN per line, quantity, taxable value "for transportation purposes"
  └─ DC number series: KP/DC/25-26/0001
  ▼
E-WAY BILL (if value > ₹50,000, or inter-state)
  ├─ Part A: GSTINs, DC/invoice no., HSN, value, from/to PIN, distance
  ├─ Part B: transporter ID, vehicle no.  ← must be filled before the vehicle moves
  └─ Validity: ~1 day per 200 km (renew if delayed in transit)
  ▼
Goods received, installed, handed over
  ▼
TAX INVOICE
  ├─ Milestone-based (advance / on dispatch / on completion) or single final invoice
  ├─ Bill-to Ola HQ; place of supply drives CGST+SGST vs IGST
  ├─ IF place of supply state == Kurchi's state → CGST + SGST
  ├─ ELSE                                        → IGST
  ├─ References the DC number(s) it covers
  └─ Invoice series: KP/INV/25-26/0001
  ▼
PAYMENT received (advance / progress / final)
  ▼
RETENTION (e.g. 5%) held → released at DLP end → reminder queue
```

### 4e. Site-readiness gate

Before dispatch, someone confirms the site can actually receive goods:

| Check | Who confirms |
|---|---|
| Civil work complete | Client / site supervisor |
| Flooring done | Client / site supervisor |
| Power available | Client / site supervisor |
| Site accessible for a truck (lift / ramp / gate size) | Installation |
| Secure storage available on site | Installation |
| Site contact + phone number confirmed | Admin |

All six green → dispatch allowed. Anything red → dispatch blocked unless Admin overrides
with a typed reason (logged, and shown to Super Admin).

---

## 5. Business rule catalogue (the if/else statements)

Each rule has an ID so it can be referenced in code and in tests.

### Access rules (AC)

| ID | Rule |
|---|---|
| AC-01 | IF `role == SUPER_ADMIN` THEN all write endpoints reject except `comments.create`. |
| AC-02 | IF `role == CLIENT` THEN strip `cost_price`, `source_vendor`, `margin_*`, `internal_notes`, `rework_cost` from every response. |
| AC-03 | IF `role == INSTALLATION` THEN strip **all** price fields from every response. |
| AC-04 | IF `role == CLIENT` AND `project.client_id != user.client_id` THEN 403. |
| AC-05 | IF `role == INSTALLATION` AND `project.installation_team_id != user.team_id` THEN 403. |
| AC-06 | IF `role == ACCOUNTS` THEN block writes to BOQ, production, and installation fields. |
| AC-07 | IF user is deactivated THEN invalidate session on next request. |

### Project & BOQ rules (PR / BQ)

| ID | Rule |
|---|---|
| PR-01 | IF project has zero BOQ lines THEN "Send for approval" is disabled. |
| PR-02 | IF any BOQ line has `selling_price == null` THEN block "Send for approval". |
| PR-03 | IF `project.status == APPROVED` or later THEN BOQ lines are read-only; edits must go through a Change Order. |
| PR-04 | IF `project.status == CANCELLED` THEN all writes rejected except comments. |
| PR-05 | IF `project.status == ON_HOLD` THEN SLA timers pause and stale flags are suppressed. |
| PR-06 | Project status is recomputed on every item-status write; it is never directly writable. |
| PR-07 | IF `expected_completion_date < today` AND status not in (COMPLETED, CLOSED, CANCELLED) THEN flag `OVERDUE`. |
| BQ-01 | IF applying a kit THEN copy item, spec, default qty, default cost and selling price — then let Admin edit before saving. |
| BQ-02 | IF `selling_price < base_price` THEN warn "negative margin at quote" and require Admin confirmation. |
| BQ-03 | IF `final_price != selling_price` THEN require a discount reason. |
| BQ-04 | IF an item is deleted after approval THEN soft-delete with reason; never hard delete. |
| BQ-05 | `landed_cost` ("actual price") = `base_price + allocated_transport + allocated_install + rework_cost`. Computed server-side, never typed. |
| BQ-06 | `quoted_margin` = `selling_price - base_price`. `real_margin` = `final_price - landed_cost`. Both are stored; the gap between them is the headline number on the Super Admin P&L. |
| BQ-07 | IF `real_margin < 0` on a line THEN flag the project on the Admin and Super Admin attention tiles. |
| BQ-08 | Transport and installation are allocated pro-rata by value across the items in a consignment, unless Admin overrides a line. |

### Sourcing & production rules (SR)

| ID | Rule |
|---|---|
| SR-01 | IF `sourcing_type == MAKE` THEN require factory + planned start/finish dates. |
| SR-02 | IF `sourcing_type == BUY` THEN require vendor + PO number + expected delivery date. |
| SR-03 | IF `sourcing_type == STOCK` THEN reduce available stock and mark it reserved to this project. |
| SR-04 | IF QC fails THEN status returns to `IN_PRODUCTION`, QC failure count increments, and a QC note is mandatory. |
| SR-05 | IF the same item type fails QC 3+ times in 90 days THEN flag it on the Admin quality tile. |

### Packing & dispatch rules (DS)

| ID | Rule |
|---|---|
| DS-01 | IF an item has no crate assigned THEN it cannot reach `PACKED`. |
| DS-02 | IF a crate has zero photos THEN it cannot be dispatched. |
| DS-03 | IF consignment value > ₹50,000 **OR** movement is inter-state THEN `eway_bill_no` is mandatory before `DISPATCHED`. |
| DS-04 | IF `eway_bill_no` is entered THEN `transporter_id` and `vehicle_no` are also mandatory (Part B). |
| DS-05 | IF site readiness is not all-green THEN dispatch is blocked unless `override_reason` is supplied. |
| DS-06 | IF `lr_number` is missing THEN status cannot pass `DISPATCHED`. |
| DS-07 | ETA is mandatory on dispatch. IF `today > eta` AND status is still `IN_TRANSIT` THEN flag `TRANSIT_DELAY` and notify Admin + site. |
| DS-08 | IF an e-way bill is older than its validity window AND goods are still in transit THEN flag for extension. |
| DS-09 | A crate may contain items from exactly one project (keeps GRN and claims clean). |

### Site & receipt rules (ST)

| ID | Rule |
|---|---|
| ST-01 | IF `qty_received < qty_dispatched` THEN auto-create a SHORTAGE ticket and block those items from `INSTALL_ASSIGNED`. |
| ST-02 | IF damage is reported THEN ≥1 photo and a cause are mandatory; submission is blocked otherwise. |
| ST-03 | IF a damage or shortage ticket is open on an item THEN that item cannot reach `INSTALLED`. |
| ST-04 | IF a replacement is approved THEN spawn a new line item linked via `replacement_for`, and add its cost to `project.rework_cost`. |
| ST-05 | IF the receipt is confirmed more than 2 days after delivery THEN flag `LATE_GRN` on the vendor scorecard. |
| ST-06 | Damage reported more than 48 hours after receipt cannot be claimed as TRANSIT — cause defaults to HANDLING_AT_SITE. |

### Installation rules (IN)

| ID | Rule |
|---|---|
| IN-01 | IF not all items for a zone are `RECEIVED_OK` THEN that zone cannot be marked install-complete. |
| IN-02 | Daily progress update requires at least one site photo. |
| IN-03 | IF no progress update for 3 consecutive working days on an active install THEN escalate to Admin. |
| IN-04 | IF `installation_team_id` is unset THEN items cannot reach `INSTALL_ASSIGNED`. |
| IN-05 | Snags require description + photo + severity. |
| IN-06 | IF any snag with severity MAJOR or CRITICAL is open THEN handover is blocked. |
| IN-07 | IF only MINOR snags are open THEN handover requires a client waiver acknowledgement. |

### Handover rules (HO)

| ID | Rule |
|---|---|
| HO-01 | Handover certificate can only be generated when every item is `INSTALLED` or `CANCELLED`. |
| HO-02 | Client signature requires OTP to the registered mobile; store name, timestamp, IP. |
| HO-03 | On signature: project → `COMPLETED`, `dlp_start_date = today`, `dlp_end_date = today + dlp_months`. |
| HO-04 | IF the client does not act on a handover request within 7 days THEN escalate to Admin and Super Admin. |

### Finance rules (FN)

| ID | Rule |
|---|---|
| FN-01 | IF goods move before sale THEN a Delivery Challan is mandatory; a tax invoice alone is not acceptable. |
| FN-02 | IF `place_of_supply_state == kurchi_state` THEN CGST + SGST; ELSE IGST. |
| FN-03 | Every line on a tax document must carry an HSN code; block generation if any is missing. |
| FN-04 | Final invoice is blocked until the handover certificate is signed (HO-02). |
| FN-05 | IF `retention_pct > 0` THEN invoice shows retention as a deduction and schedules a release reminder at `dlp_end_date`. |
| FN-06 | Invoice and DC numbers are gapless, per financial year, allocated server-side only. |
| FN-07 | An issued invoice can never be edited — only credit-noted. |
| FN-08 | IF payment received < invoice total THEN mark PART_PAID and age the balance (0–30 / 31–60 / 61–90 / 90+). |
| FN-09 | IF a vendor bill exceeds its PO value by more than 5% THEN hold for Admin approval. |
| FN-10 | Project P&L = Σ `final_price` − Σ `landed_cost` − overhead allocation. Shown alongside Σ `quoted_margin` so the erosion is visible. |

### Escalation & notification rules (ES / NT)

| ID | Rule |
|---|---|
| ES-01 | IF an item's status is unchanged beyond its SLA THEN mark stale, surface on Admin "Needs attention" and Super Admin "Delays". |
| ES-02 | IF a project is stale for 7+ days THEN email Super Admin a weekly digest. |
| ES-03 | IF a rule is overridden THEN log it and show it on the Super Admin "Overrides" tile. |
| ES-04 | IF a critical snag is open beyond 48 hours THEN escalate to Admin and Super Admin. |
| NT-01 | On dispatch → notify site contact + client (WhatsApp/SMS + email) with LR no. and ETA. |
| NT-02 | On delivery → ask site to confirm receipt within 24 hours. |
| NT-03 | On damage ticket → notify Admin immediately. |
| NT-04 | On BOQ sent for approval → notify client; remind at day 3 and day 7. |
| NT-05 | On handover signed → notify Admin, Accounts, Super Admin. |
| NT-06 | On DLP expiry minus 15 days → notify Accounts to claim retention. |

---

## 6. Worked example: one chair, end to end

> Project: Ola Showroom — Kochi. Line: `6 × Visitor Chair VC-02`.

| Day | Event | Status | Rule fired |
|---|---|---|---|
| 1 | Admin applies "Ola Standard Showroom" kit; 6 chairs added at cost ₹3,200, selling ₹5,400 | DRAFT | BQ-01 |
| 2 | BOQ sent to Ola; approved same day | APPROVED | PR-02, NT-04 |
| 3 | Admin sets sourcing = BUY, vendor Sharma Seating, PO-1183, ETA day 12 | PO_PLACED | SR-02 |
| 13 | Goods in, QC: 1 chair has a scratch → rejected, 5 pass | QC_PENDING → split | SR-04 |
| 15 | Vendor replaces the 1; all 6 pass | READY_TO_PACK | — |
| 16 | Packed into Crate KCH-07, 4 photos taken, QR label printed | PACKED | DS-01, DS-02 |
| 17 | Site readiness: flooring pending → dispatch blocked | PACKED | DS-05 |
| 20 | Site confirms flooring done; Accounts issues DC KP/DC/25-26/0142 + e-way bill (inter-state, ₹1.2L) | PACKED | FN-01, DS-03 |
| 20 | Dispatched — LR 2291, vehicle KA01AB1234, ETA day 23 | DISPATCHED | DS-04, DS-06, NT-01 |
| 23 | Site scans crate QR: 6 dispatched, 5 received, 1 chair leg cracked | DELIVERED_AT_SITE | NT-02 |
| 23 | Installer uploads 3 photos, cause = TRANSIT | 5 RECEIVED_OK, 1 RECEIVED_DAMAGED | ST-02, ST-03 |
| 24 | Admin approves replacement; new line spawned, ₹3,200 booked as rework, transporter claim filed | REPLACEMENT_REQUESTED | ST-04 |
| 25–27 | 5 chairs installed | INSTALLED | IN-02 |
| 33 | Replacement chair arrives and is installed | INSTALLED | — |
| 34 | Snag: one chair wobbles (MINOR) → fixed next day | SNAG_OPEN → closed | IN-05 |
| 36 | Handover certificate generated; Ola signs with OTP | HANDED_OVER | HO-01, HO-02 |
| 36 | Final invoice unblocked; 5% retention scheduled for DLP end (day 36 + 12 months) | — | FN-04, FN-05 |

### Line P&L for those 6 chairs

| | |
|---|---:|
| Revenue — 6 × final price ₹5,400 | ₹32,400 |
| Base price — 6 × ₹3,200 | ₹19,200 |
| Allocated transport | ₹1,800 |
| Allocated installation | ₹1,200 |
| Rework — the replacement chair | ₹3,200 |
| **Landed cost ("actual price")** | **₹25,400** |
| Quoted margin (what we expected) | ₹13,200 |
| **Real margin (what we made)** | **₹7,000** |
| **Erosion** | **₹6,200 — 47% of the expected margin** |

One cracked chair leg ate nearly half the margin on this line, and today nobody would
ever see that number. Visible to Admin and Super Admin only (rules AC-02, AC-03).
