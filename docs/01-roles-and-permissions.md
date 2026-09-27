# Roles & Permissions

Five roles. One login page; the app routes you by role after authentication.

```
/login  ──► read role from user profile ──┬─► SUPER_ADMIN   → /hq
                                          ├─► ADMIN         → /admin
                                          ├─► INSTALLATION  → /site
                                          ├─► ACCOUNTS      → /accounts
                                          └─► CLIENT        → /portal
```

> Recommendation: **one** `/login` rather than separate admin/staff login pages. Two login
> pages is two places to break, and it leaks which emails are admins. Keep the public
> site's "Staff Login" and "Admin Login" buttons if you want — point both at `/login`.

---

## 1. Module-level permission matrix

`C` = create, `R` = read, `U` = update, `D` = delete/void, `—` = no access

| Module | Super Admin | Admin | Installation | Accounts | Client |
|---|:--:|:--:|:--:|:--:|:--:|
| Public catalogue (products) | R | CRUD | — | R | R |
| Clients & contacts | R | CRUD | — | R | — |
| Programmes | R | CRUD | — | R | R (own) |
| Projects | R (all) | CRUD | R (assigned) | R (all) | R (own) |
| BOQ line items | R | CRUD | R (assigned) | R | R (no cost) |
| BOQ templates / kits | R | CRUD | — | — | — |
| Pricing — cost / base | R | CRUD | — | R | — |
| Pricing — selling / quoted | R | CRUD | — | R | R |
| Margin & P&L | R | R | — | R | — |
| Vendors & suppliers | R | CRUD | — | R | — |
| Purchase orders | R | CRUD | — | R | — |
| Production / QC status | R | CRUD | — | — | R (summary) |
| Crates & packing list | R | CRUD | R | R | R (summary) |
| Dispatch & transport | R | CRUD | R | R | R (ETA only) |
| E-way bill data | R | R | — | CRUD | — |
| Goods receipt (GRN) | R | RU | CU | R | R |
| Damage / shortage tickets | R + comment | CRUD | CU | R | R |
| Installation progress | R | R | CU | — | R |
| Snag list | R + comment | CRU | CU | — | CR |
| Handover certificate | R | CRU | CU | R | R + **sign** |
| Delivery challans | R | R | R | CRUD | R |
| Tax invoices | R | R | — | CRUD | R |
| Payments & receipts | R | — | — | CRUD | R (own) |
| Vendor bills | R | R | — | CRUD | — |
| GST reports | R | — | — | CRUD | — |
| Users & roles | R | CRUD | — | — | — |
| Audit log | R | R | — | R | — |
| Dashboards / graphs | **R (all)** | R (ops) | R (own sites) | R (finance) | R (own projects) |
| Comments / notes | **CR** | CRUD | CR | CR | CR |

**Super Admin is deliberately read-only everywhere except comments.** That is the whole
point of the role — oversight without interference, and no argument later about who
changed a number.

---

## 2. Field-level visibility (the important one)

Module access is not enough. The same BOQ row shows different fields to different people.

| Field | Super Admin | Admin | Installation | Accounts | Client |
|---|:--:|:--:|:--:|:--:|:--:|
| `item_name`, `spec`, `qty` | Yes | Yes | Yes | Yes | Yes |
| `base_price` (factory / vendor cost) | Yes | Yes | **Hidden** | Yes | **Hidden** |
| `source_vendor_name` | Yes | Yes | **Hidden** | Yes | **Hidden** |
| `selling_price` (quoted in BOQ) | Yes | Yes | **Hidden** | Yes | Yes |
| `final_price` (agreed after negotiation) | Yes | Yes | **Hidden** | Yes | Yes |
| `allocated_transport`, `allocated_install` | Yes | Yes | **Hidden** | Yes | **Hidden** |
| `rework_cost` | Yes | Yes | **Hidden** | Yes | **Hidden** |
| `landed_cost` (the "actual price") | Yes | Yes | **Hidden** | Yes | **Hidden** |
| `quoted_margin`, `real_margin`, `margin_pct` | Yes | Yes | **Hidden** | Yes | **Hidden** |
| `status`, `eta`, `lr_number` | Yes | Yes | Yes | Yes | Yes |
| `internal_notes` | Yes | Yes | **Hidden** | Yes | **Hidden** |

Two hard rules, enforced on the **server** (Firestore rules / Cloud Function), not just
hidden in the UI:

- **The client must never see cost, vendor, or margin.** Leaking this ends the account.
- **The installer must never see any price at all.** They quote their own labour; showing
  them item value invites both disputes and inflated damage claims.

Implementation: store money fields in a sub-document `items/{id}/private/pricing` that
client and installation roles cannot read, rather than relying on `select` in the query.

---

## 3. Data scoping rules

| Role | Sees which projects |
|---|---|
| Super Admin | All, all programmes, all clients |
| Admin | All (or restricted to assigned programmes if you grow the team) |
| Installation | Only projects where `project.installation_team_id == user.team_id` |
| Accounts | All |
| Client | Only projects where `project.client_id == user.client_id` |

---

## 4. Route guards

```
PublicLayout        /                       everyone
                    /products
                    /products/:slug
                    /about  /contact
                    /login

HQLayout            /hq/*                   SUPER_ADMIN
AdminLayout         /admin/*                ADMIN
SiteLayout          /site/*                 INSTALLATION
AccountsLayout      /accounts/*             ACCOUNTS
PortalLayout        /portal/*               CLIENT
```

Guard component contract:

```
<RequireRole allow={["ADMIN"]}>        → else redirect to that user's home route
<RequireProjectAccess param="projectId"> → else 403 page (not 404 — 404 leaks existence)
```

`RequireRole` checks a custom claim on the Firebase ID token, refreshed on login. Never
trust a role stored only in Firestore and read client-side.

---

## 5. Actions that are blocked regardless of role

These are workflow gates, not permission gates — even Admin cannot bypass them without
an explicit, logged override.

| Blocked action | Unblocked by |
|---|---|
| Dispatch a consignment with no packing photos | Upload photos |
| Dispatch inter-state, value > ₹50,000, no e-way bill no. | Accounts enters e-way bill no. |
| Dispatch to a site not marked ready | Site-readiness checklist confirmed, or Admin override with written reason |
| Mark item `INSTALLED` while a damage ticket is open | Close or supersede the ticket |
| Raise handover certificate with open snags | Close all snags, or client accepts with a written waiver |
| Raise final tax invoice before handover is signed | Client signs handover |
| Edit an approved BOQ line | Raise a Change Order instead |
| Delete anything with financial history | Void + reason (soft delete, always) |

Every override writes: who, when, which rule, and the typed reason. Surfaced on the Super
Admin dashboard as an "Overrides this month" tile.
