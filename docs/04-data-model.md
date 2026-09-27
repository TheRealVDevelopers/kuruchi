# Data Model

Firebase (Firestore + Auth + Storage), matching the existing `ecommerce` app which already
uses `firebase` v12.

---

## 1. Collections

```
users/{uid}
clients/{clientId}
programmes/{programmeId}
projects/{projectId}
  └─ items/{itemId}
       └─ private/pricing          ← cost, margin, vendor. Blocked for CLIENT + INSTALLATION
  └─ crates/{crateId}
  └─ consignments/{consignmentId}
  └─ tickets/{ticketId}            ← damage / shortage
  └─ snags/{snagId}
  └─ changeOrders/{coId}
  └─ progressLogs/{logId}
  └─ comments/{commentId}
  └─ documents/{docId}
products/{productId}               ← public catalogue
kits/{kitId}                       ← BOQ templates
vendors/{vendorId}                 ← suppliers + installation teams
challans/{challanId}
invoices/{invoiceId}
payments/{paymentId}
vendorBills/{billId}
counters/{seriesId}                ← gapless DC / invoice numbering
auditLog/{entryId}
notifications/{notificationId}
enquiries/{enquiryId}              ← public contact form
```

---

## 2. Key documents

### `users/{uid}`
```
email, name, phone, photoUrl
role: SUPER_ADMIN | ADMIN | INSTALLATION | ACCOUNTS | CLIENT
clientId?            // when role = CLIENT
teamId?              // when role = INSTALLATION (points at vendors/{id})
active: boolean
createdAt, createdBy, lastLoginAt
```
`role` is mirrored into a **Firebase custom claim** on create/update via a Cloud Function.
Security rules read the claim, never the document.

### `projects/{projectId}`
```
code                 // KP-2026-041
name, clientId, programmeId
site: { address, city, state, pincode, contactName, contactPhone }
status               // derived — see 02-workflow §2
statusUpdatedAt
startDate, targetCompletionDate, actualCompletionDate
installationTeamId
siteReadiness: { civil, flooring, power, truckAccess, storage, contact } // each: bool + by + at
retentionPct, dlpMonths, dlpStartDate, dlpEndDate
totals: { itemCount, installedCount, value, cost, reworkCost, marginPct }  // denormalised
flags: { overdue, stale, hasOpenTickets, hasCriticalSnags }
holdReason?, cancelReason?
createdAt, createdBy, updatedAt, updatedBy
```

### `projects/{id}/items/{itemId}`
```
productId?, name, spec, hsnCode, unit, qty
status               // see 02-workflow §3
statusUpdatedAt, statusOwnerRole, slaDueAt, isStale
sourcingType         // MAKE | BUY | STOCK
vendorId?, poNumber?, plannedStart?, plannedFinish?, eta?
qcAttempts, qcNotes[]
crateId?, consignmentId?
qtyDispatched, qtyReceived, qtyInstalled
replacementFor?      // itemId of the damaged original
zone?                // for zone-wise installation
cancelledReason?
```

### `projects/{id}/items/{itemId}/private/pricing`

**Four money fields. Two are typed, one is negotiated, one is computed.**

```
basePrice            // TYPED   — factory cost or vendor purchase price, per unit
sellingPrice         // TYPED   — price quoted to the client in the BOQ, per unit
finalPrice           // TYPED   — what the client actually agreed after negotiation
discountReason?      //           required when finalPrice != sellingPrice

// the "actual price" — what this line really cost Kurchi
allocatedTransport   // TYPED or apportioned from the consignment
allocatedInstall     // TYPED or apportioned from the installation vendor bill
reworkCost           // AUTO    — accumulated from replacement/repair tickets
landedCost           // COMPUTED = basePrice + allocatedTransport
                     //          + allocatedInstall + reworkCost

quotedMargin         // COMPUTED = sellingPrice - basePrice      (what we thought we'd make)
realMargin           // COMPUTED = finalPrice  - landedCost      (what we actually made)
marginPct            // COMPUTED = realMargin / finalPrice
internalNotes
```

Keeping **quoted margin** and **real margin** as separate numbers is the point. The gap
between them is the whole story of a project: discount given away, freight
under-estimated, and rework nobody booked. Super Admin should be watching that gap, not
either number on its own.

`landedCost`, `quotedMargin`, `realMargin` and `marginPct` are written by a Cloud
Function, never by the client. Transport and installation are allocated pro-rata by value
across the items in a consignment unless Admin overrides per line.

Separate document so a single security rule keeps it away from CLIENT and INSTALLATION
(rules AC-02, AC-03). Do not rely on filtering fields in the client query.

### `projects/{id}/crates/{crateId}`
```
crateCode            // KCH-07, printed on the QR label
itemIds[], qtyByItem
weightKg, dimensions
photos[]             // Storage paths — at least 1 required to dispatch (DS-02)
packedBy, packedAt
consignmentId?
receivedAt?, receivedBy?, receiptPhotos[]
```

### `projects/{id}/consignments/{consignmentId}`
```
crateIds[]
challanId, ewayBillNo, ewayBillValidTill
transporterId, transporterName, vehicleNo, driverPhone, lrNumber
dispatchedAt, eta, deliveredAt
podUrl
taxableValue
overrideReason?      // if dispatched with site not ready (DS-05)
status               // READY | DISPATCHED | IN_TRANSIT | DELIVERED
```

### `projects/{id}/tickets/{ticketId}`
```
type                 // DAMAGE | SHORTAGE
itemId, qtyAffected
cause                // TRANSIT | MANUFACTURING | HANDLING_AT_SITE | SHORT_SUPPLY
photos[]             // mandatory (ST-02)
reportedBy, reportedAt
decision             // REPLACE | REPAIR | WAIVE
decidedBy, decidedAt
replacementItemId?
costImpact
status               // OPEN | TRIAGED | IN_PROGRESS | RESOLVED
```

### `kits/{kitId}`
```
name, description, programmeId?, version, active
lines[]: { productId, name, spec, defaultQty, defaultCostPrice, defaultSellingPrice, zone }
```

### `invoices/{invoiceId}`
```
number               // KP/INV/25-26/0001 — allocated server-side from counters/
projectId, clientId
billTo: { name, gstin, address, state }
shipTo: { name, gstin?, address, state }
placeOfSupplyState
lines[]: { description, hsn, qty, rate, taxableValue, gstRate }
taxMode              // CGST_SGST | IGST
cgst, sgst, igst, total
retentionPct, retentionAmount, netPayable
challanIds[]
issuedAt, issuedBy
status               // ISSUED | PART_PAID | PAID | CREDIT_NOTED
creditNoteId?
```
Immutable once issued (FN-07).

### `auditLog/{entryId}`
```
at, actorUid, actorRole
entity               // "projects/KP-2026-041/items/abc"
action               // CREATE | UPDATE | STATUS_CHANGE | OVERRIDE | VOID
before, after        // changed fields only
ruleOverridden?, overrideReason?
```

---

## 3. Indexes to create up front

| Collection | Fields |
|---|---|
| `projects` | `status` + `targetCompletionDate` |
| `projects` | `clientId` + `status` |
| `projects` | `installationTeamId` + `status` |
| `projects` | `flags.stale` + `statusUpdatedAt` |
| collection group `items` | `status` + `slaDueAt` |
| collection group `items` | `isStale` + `statusUpdatedAt` |
| collection group `tickets` | `status` + `reportedAt` |
| `invoices` | `clientId` + `status` + `issuedAt` |
| `invoices` | `status` + `dueDate` (receivables ageing) |

Collection-group queries on `items` and `tickets` are what power the cross-project Admin
dispatch board and the Super Admin attention tiles.

---

## 4. Security rules — shape

```js
function role()      { return request.auth.token.role; }
function isAdmin()   { return role() == 'ADMIN'; }
function isSuper()   { return role() == 'SUPER_ADMIN'; }

match /projects/{pid} {
  allow read: if isSuper() || isAdmin() || role() == 'ACCOUNTS'
              || (role() == 'CLIENT'
                  && resource.data.clientId == request.auth.token.clientId)
              || (role() == 'INSTALLATION'
                  && resource.data.installationTeamId == request.auth.token.teamId);
  allow write: if isAdmin();          // SUPER_ADMIN deliberately excluded — AC-01

  match /items/{iid} {
    allow read: if <same as parent>;
    allow update: if isAdmin()
                  || (role() == 'INSTALLATION'
                      && onlyChanging(['status','qtyReceived','qtyInstalled','zone']));

    match /private/{doc} {
      allow read: if isSuper() || isAdmin() || role() == 'ACCOUNTS';   // AC-02, AC-03
      allow write: if isAdmin();
    }
  }

  match /comments/{cid} {
    allow create: if request.auth != null;   // every role may comment, incl. SUPER_ADMIN
  }
}
```

Anything involving money, numbering, status derivation, or a rule override goes through a
**Cloud Function**, not a direct client write. Specifically:

| Cloud Function | Why |
|---|---|
| `setUserRole` | custom claims cannot be set client-side |
| `allocateDocNumber` | gapless DC / invoice series (FN-06) |
| `recomputeProjectStatus` | triggered on item write (PR-06) |
| `onItemStatusChange` | SLA due date, stale flags, notifications |
| `createReplacement` | spawn linked item + book rework cost (ST-04) |
| `issueInvoice` | tax computation, immutability, retention schedule |
| `signHandover` | OTP verification, DLP dates, unlock final invoice |
| `nightlyScan` | stale detection, overdue projects, DLP reminders, e-way validity |

---

## 5. Storage layout

```
projects/{projectId}/crates/{crateId}/pack/{n}.jpg
projects/{projectId}/crates/{crateId}/receipt/{n}.jpg
projects/{projectId}/tickets/{ticketId}/{n}.jpg
projects/{projectId}/progress/{logId}/{n}.jpg
projects/{projectId}/snags/{snagId}/{n}.jpg
projects/{projectId}/documents/{docId}/{filename}
products/{productId}/{n}.jpg
generated/challans/{challanId}.pdf
generated/invoices/{invoiceId}.pdf
generated/handover/{projectId}.pdf
generated/labels/{consignmentId}-qr.pdf
```

Compress on the client before upload — target ~1600px longest edge, ~200KB. Site staff
will take hundreds of photos per project; raw phone JPEGs will make both the bill and the
app unusable.
