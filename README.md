# Kurchi Projects

Internal operations platform for Kurchi's retail roll-out and fit-out business.
Third app alongside `smart-furnish` and `ecommerce`.

Full specification: [`docs/`](docs) — start with [`00-overview.md`](docs/00-overview.md).
Visual summary: [`docs/Kurchi-Projects-Blueprint.pdf`](docs/Kurchi-Projects-Blueprint.pdf).

---

## Running it

```sh
npm install
npm run dev      # http://localhost:8080
```

Firebase is wired but **optional**. With no `.env.local`, the app runs on seed data
(`src/data/seed.ts`) so every screen opens in a realistic working state. Sign in at
`/login` — the demo account list is on the page, any password works. The **View as**
dropdown in the header switches roles without signing out.

To connect Firebase, copy `.env.example` to `.env.local` and fill it in.

---

## Where things live

| Path | What |
|---|---|
| `src/types/index.ts` | Domain types — mirrors `docs/04-data-model.md` |
| `src/lib/statuses.ts` | Item and project state machines, SLA table, stale detection |
| `src/lib/rules.ts` | **The business rule catalogue as code.** Rule IDs match `docs/02-workflow.md` §5 |
| `src/lib/money.ts` | The four money fields and everything computed from them |
| `src/data/store.ts` | **Live state** — hydrated from storage or seed, `useDb()` subscribes |
| `src/data/persistence.ts` | **Saves every commit to this browser**, versioned, debounced, cross-tab |
| `src/data/actions.ts` | **Every write the app can make**, each re-checking its rule |
| `src/data/repo.ts` | Reads **with role scoping and redaction applied at the boundary** |
| `src/data/seed.ts` | Starting data |
| `src/features/<domain>/pages/` | Screens, by role |
| `src/components/app/` | `RuleGate`, `MoneyField`, `StatusBadge`, `StageTracker`, `ResponsiveTable` |
| `src/layouts/` | `PublicLayout` and the shared `RoleLayout` |

## Look and feel

Brand carried over from the `ecommerce` app so the three read as one company:
**Nunito** throughout, the `bright-red` ramp applied at 600–800 (`#b30000` is the
primary), warm `stone` neutrals, white ground. Red is reserved for the wordmark and
primary actions — status colours stay separate so "this is Kurchi" never competes with
"this is broken".

Every table renders as a real table from `md` up and as stacked cards below it
(`ResponsiveTable`). The site app is built phone-first: full-width tap targets, tappable
phone numbers, camera-first forms.

---

## Three things that are load-bearing

**1. Money is four fields, not three.** `basePrice`, `sellingPrice` and `finalPrice` are
typed; `landedCost` — the "actual price" — is computed as base + transport + install +
rework. Both `quotedMargin` and `realMargin` are kept, because the gap between them is the
whole story of a project. See `src/lib/money.ts`.

**2. Redaction happens in the repository, not in components.** `repo.items(projectId, role)`
returns a `SafeItem` with pricing stripped for `CLIENT` and `INSTALLATION`. A new screen
cannot forget rule AC-02 or AC-03, because the data never arrives. `MoneyField` is the
second line of defence and the visible one.

**3. Every gate explains itself.** Blocked actions render through `<RuleGate>`, which names
the rule and says why in a sentence. A greyed-out button with no explanation is the fastest
way to get people working around a system.

---

## Status against the roadmap

Every screen is built and every action works. No placeholders remain.

| Phase | State |
|---|---|
| 0 — Foundation | **Done** — auth, five role layouts, guards, shared components, mobile drawer |
| 1 — Public site | **Done** — home, catalogue, product detail, about, contact (enquiries stored), login |
| 2 — Projects & BOQ | **Done** — list, workspace, four money fields, derived status, kits, client portal with approvals |
| 3 — Sourcing & dispatch | **Done** — dispatch board, packing photos, e-way capture, gates, override with reason |
| 4 — Site & handover | **Done** — scan-to-receive, damage reporting, triage, replacement loop, snags, OTP handover |
| 5 — Accounts & GST | **Done** — challans, e-way worksheet, invoices with tax-mode logic, payments, retention queue |
| 6 — HQ intelligence | **Done** — command centre, P&L with erosion, vendor scorecards, rule book |

### Flows you can run end to end

1. **Damage → replacement → margin.** Site files a report (photo + cause mandatory) →
   Admin triages → a linked replacement re-enters production → rework books to the project
   → the erosion figure moves on the project, the Admin dashboard and the HQ P&L.
2. **Dispatch gates.** Try to dispatch the Delhi consignment: blocked by DS-02, DS-03,
   DS-05 and DS-06. Add photos, record an e-way bill, confirm site readiness, and the
   button unlocks. Or override with a typed reason and watch it land in the audit log.
3. **Approval → build → handover.** Client approves a BOQ, items move, site marks them
   installed, snags block handover until closed, the client signs with an OTP, and only
   then does the final invoice unlock (FN-04).

**Work survives a reload.** Every commit is written to `localStorage` (debounced, schema-versioned) and hydrated on boot, with derived totals recomputed and id counters primed so nothing collides. Two tabs on one machine stay in step via the `storage` event. It is per-device, not shared — Firestore replaces it as the source of truth.

---

## Not yet wired

- **Firestore** — `firestore.rules` is written and encodes every access rule (AC-01 to AC-05,
  the immutable-invoice rule, the mandatory-photo shape checks). It is untested until a
  Firebase project exists. Reads go through `src/data/repo.ts` and writes through
  `src/data/actions.ts`, so those two files are the whole swap
- Firebase Auth with role custom claims (`AuthContext.signIn` has the hook)
- Cloud Functions: `allocateDocNumber`, `recomputeProjectStatus`, `createReplacement`,
  `issueInvoice`, `signHandover`, `nightlyScan`
- Photo upload to Storage (the UI queues filenames today)
- PDF generation for challans, invoices and the handover certificate
