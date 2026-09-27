# Build Roadmap

Stack follows the existing siblings: **Vite + React 18 + TypeScript + Tailwind +
shadcn/ui + React Router v6 + TanStack Query + Recharts + Zod + react-hook-form**, on
**Firebase** (Auth, Firestore, Storage, Functions, Hosting).

Suggested Firebase project: `kurchi-projects`. Folder: `kurchi-projects/` alongside
`smart-furnish/` and `ecommerce/`.

---

## Phase 0 — Foundation

- Scaffold from the `smart-furnish` layout convention (`src/features/*/pages`, `src/layouts`, `src/pages/AppRouter.tsx`)
- Firebase init: Auth, Firestore, Storage, Functions, Hosting
- `AuthContext` + `RequireRole` guard + role-based post-login routing
- Five layouts: `PublicLayout`, `HQLayout`, `AdminLayout`, `SiteLayout`, `AccountsLayout`, `PortalLayout`
- Shared primitives: `StatusBadge`, `StatusTimeline`, `MoneyField`, `RuleGate`, `PhotoUploader`
- Seed users, one per role, for testing

**Done when:** each role logs in and lands on its own empty shell.

---

## Phase 1 — Public site + catalogue

- Home, Products, Product detail, About, Contact, Login
- `/admin/catalogue` CRUD with photo upload and HSN code
- Contact form → `enquiries`

**Done when:** Kurchi can publish their storage units, sofas and chairs themselves.

---

## Phase 2 — Projects & BOQ (the spine)

- Clients, programmes, projects CRUD
- BOQ table with the three prices and role-aware money fields
- BOQ kits: create, version, apply to project
- Item status machine + derived project status (`recomputeProjectStatus`)
- Client portal: progress + scope + BOQ approval
- Change orders

**Done when:** a project can be created from a kit in under 2 minutes and the client can
approve it online.

---

## Phase 3 — Sourcing, packing & dispatch

- Sourcing: make / buy / stock, POs, vendors, QC log
- Crate builder + mandatory packing photos + QR label PDF
- Site-readiness checklist gate
- Consignments: LR, transporter, vehicle, ETA, POD
- Cross-project dispatch board
- Notifications on dispatch (email first, WhatsApp in Phase 6)

**Done when:** "where is my consignment" is answerable without a phone call.

---

## Phase 4 — Site, installation & handover

- Mobile-first `/site` app: scan-to-receive, GRN, damage/shortage with mandatory photos
- Replacement loop with rework cost booking
- Installation progress logs, zone-wise completion
- Snag list, both directions (site raises, client raises)
- Handover certificate PDF + client OTP signature

**Done when:** a project can go from delivered to signed-off entirely in the app.

---

## Phase 5 — Accounts & GST

- Delivery Challans with bill-to / ship-to
- E-way bill worksheet + export
- Tax invoices with CGST/SGST vs IGST logic, retention, credit notes
- Gapless numbering via `allocateDocNumber`
- Payments, receivables ageing, vendor bills
- GSTR-1-shaped outward register + HSN summary export

**Done when:** Accounts stops maintaining a parallel Excel.

---

## Phase 6 — Super Admin intelligence + polish

- `/hq` dashboard: all charts and attention tiles
- Project and programme P&L, budget vs actual
- Vendor scorecards, client responsiveness
- Stale/SLA engine + `nightlyScan`
- Audit log UI
- WhatsApp / SMS notifications
- PWA + offline queue for `/site`
- Excel + PDF export across all reports

**Done when:** the owner can answer "are we making money and is anything stuck" in ten
seconds.

---

## Sequencing advice

Phases 2 → 3 → 4 are the spine; they solve the actual complaint. Phase 5 can run in
parallel once the data model is fixed, because it only reads from projects and
consignments. Phase 6 is mostly aggregation over data the earlier phases already produce —
resist starting it early, dashboards over empty data teach you nothing.

Three things to **not** defer despite the temptation:

1. **Mandatory packing photos (Phase 3).** Retrofitting photo discipline after go-live
   never works. Make it impossible to dispatch without them from day one.
2. **Role-aware money fields (Phase 2).** The client portal is confirmed v1 scope, so
   field-level masking is a **launch blocker, not later hardening**. If base price or
   landed cost leaks into an Ola view even once during the pilot, that is a commercial
   problem, not a bug. Enforce it in Firestore rules via the `private/pricing`
   sub-document, and write a test for each of AC-02 and AC-03 before the portal goes live.
3. **The four money fields (Phase 2).** `basePrice`, `sellingPrice`, `finalPrice` and the
   computed `landedCost` must all exist from the first BOQ screen. Adding landed cost
   later means back-filling transport and rework across every closed project, which in
   practice means never knowing what the pilot actually earned.
