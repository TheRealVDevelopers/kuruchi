# Open Questions

Grouped by how much they change the build. Answers to Group A change the data model, so
they are worth settling before Phase 2.

---

## Decided (21 Sep 2026)

| Question | Decision | Consequence |
|---|---|---|
| What is "actual price"? | **Landed cost to Kurchi**, plus a separate client-facing final price. Four fields: `basePrice`, `sellingPrice`, `finalPrice`, `landedCost`. | See `04-data-model.md` pricing block and rules BQ-05 to BQ-08. Quoted margin and real margin are both stored; the gap between them is the headline P&L number. |
| Does the client get a login in v1? | **Yes — full portal in v1**, including BOQ and change-order approval and OTP handover signing. | `/portal` is Phase 2 + Phase 4 scope, not deferred. Field-level masking (AC-02) becomes a launch blocker, not a later hardening task. |
| How far does GST go? | **Generate + export.** GST-correct DC and Tax Invoice PDFs, a complete e-way bill worksheet for the portal, GSTR-1-shaped export for the CA or Tally. | No GSP subscription needed. E-invoice IRN and NIC e-way bill APIs stay a clean upgrade path behind the same data model. |

---

## Group A — Changes the data model (answer first)

1. ~~**The three prices.**~~ — **Decided**, see above.

2. **Who owns the client relationship — one client, many showrooms?** I have modelled
   Client → Programme → Project. Does Ola have one contact for all cities, or a different
   site contact per city who should each get their own login?

3. ~~**Does the client get a login in v1?**~~ — **Decided: yes, full portal.** Follow-on
   question that is now urgent: **which Ola people get logins?** One programme-level PM
   for all cities, or a separate site contact per showroom who only sees their own?
   This decides whether `users.clientId` is enough or we also need `users.projectIds[]`.

4. **Installation teams: employees or third-party vendors?** If third-party, do they get
   logins directly, or does a Kurchi supervisor on site do all the updating? This decides
   whether `/site` needs to be hardened against an outsider or just simple.

5. **Is there a factory/production role separate from Admin?** Right now Admin does
   everything up to dispatch. If the factory has its own supervisor, that is a 6th role.

6. **Stock on hand.** Do you hold finished stock of standard items (so a project can be
   served from inventory), or is everything made/bought per project? I have included a
   `STOCK` sourcing type but not a full inventory module.

---

## Group B — Changes scope and effort

7. ~~**GST: generate or export?**~~ — **Decided: generate + export.** No GSP integration
   in v1.

8. **Is Tally or Zoho Books already in use?** If yes, the invoice numbering series must
   match theirs, and we should plan an export format rather than fight over which system
   is the book of record.

9. **Milestone billing or single final invoice?** Typical retail fit-out is
   advance / on-dispatch / on-completion. Confirm the split and whether it varies per client.

10. **Retention and DLP — actual numbers?** I have assumed 5% retention and a 12-month
    defect liability period as defaults. What does the Ola contract actually say?

11. **Transporters — fixed panel or ad-hoc?** If you use a fixed set, a transporter master
    with rate cards makes freight costing automatic. If it is ad-hoc per trip, keep it as
    free text.

12. **WhatsApp notifications** need a WhatsApp Business API provider (Gupshup, Interakt,
    Twilio, AiSensy) with template approval. Budget and provider preference? SMS is the
    cheaper fallback; email alone will not be read by site teams.

13. **Do you need Hindi or regional language** on the `/site` interface? Installers in
    tier-2/3 cities may not read English comfortably. This is cheap to add early, painful
    to retrofit.

---

## Group C — Confirm the assumption, low risk

14. **One login page or two?** I have recommended a single `/login` that routes by role.
    Confirm you are happy to drop the separate admin/staff login pages.

15. **Product categories.** Storage units, sofas, chairs — plus counters, tables, signage?
    Should the category list be editable by Admin, or fixed?

16. **Does the public catalogue show prices publicly,** or "price on request"? Showing
    prices publicly while quoting different prices to Ola can be awkward.

17. **Project code format.** I have assumed `KP-2026-041`. Any existing convention to match?

18. **Document number series.** I have assumed `KP/DC/25-26/0001` and `KP/INV/25-26/0001`.
    Confirm or replace with the existing series — this must not clash with Tally.

19. **SLA defaults.** The per-status SLA days in `02-workflow.md` §3 are my estimates.
    Kurchi should set real ones — they drive every escalation in the system.

20. **How many concurrent projects at peak?** 10 showrooms or 100? It does not change the
    architecture, but it changes how much the dispatch board needs to scale visually.

---

## Assumptions I have proceeded on

If nothing is said, the build will assume:

- Single `/login`, role-based routing
- Super Admin is read-only everywhere except comments
- Client and Installation never see base price, landed cost, vendor or margin; Installation sees no prices at all
- Project status is derived from item statuses, never typed
- App prepares GST documents and data; filing happens outside *(confirmed)*
- Client portal with approvals and OTP handover signing is in v1 *(confirmed)*
- Four money fields: base, selling, final, landed cost *(confirmed)*
- 5% retention, 12-month DLP as editable defaults
- Email notifications in v1, WhatsApp in Phase 6
- Firebase (Auth + Firestore + Storage + Functions), same as the sibling apps
