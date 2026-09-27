/**
 * Reads, with role scoping and redaction applied at the boundary.
 *
 * Rules AC-02 to AC-05 are enforced HERE, not in each component, so a new screen
 * cannot forget them — the data simply never arrives.
 *
 * Writes live in actions.ts. State lives in store.ts.
 */

import { db, NOW } from "./store";
import type { AppUser, BoqItem, Project, Role } from "@/types";
import { isStale } from "@/lib/statuses";

export { NOW };

/* ---------------------------------------------------------------- scoping */

/** AC-04, AC-05 — which projects may this user see at all? */
export function scopeProjects(user: AppUser | null, projects = db.projects): Project[] {
  if (!user) return [];
  switch (user.role) {
    case "CLIENT":
      return projects.filter((p) => p.clientId === user.clientId);
    case "INSTALLATION":
      return projects.filter((p) => p.installationTeamId === user.teamId);
    case "VENDOR":
      return projects.filter((p) => p.franchiseeId === user.vendorId);
    default:
      return projects;
  }
}

/** AC-02, AC-03 — strip money before it reaches the client or the installer. */
export type SafeItem = Omit<BoqItem, "pricing"> & {
  pricing?: BoqItem["pricing"];
  /** the client sees these two only */
  sellingPrice?: number;
  finalPrice?: number;
};

export function redactItem(item: BoqItem, role: Role): SafeItem {
  if (role === "INSTALLATION") {
    const { pricing, ...rest } = item;
    void pricing;
    return rest;
  }
  if (role === "CLIENT") {
    const { pricing, ...rest } = item;
    return { ...rest, sellingPrice: pricing.sellingPrice, finalPrice: pricing.finalPrice };
  }
  return item;
}

export function redactItems(items: BoqItem[], role: Role): SafeItem[] {
  return items.map((i) => redactItem(i, role));
}

/* ----------------------------------------------------------------- reads */

export const repo = {
  users: () => db.users,
  userByEmail: (email: string) =>
    db.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase()) ?? null,

  products: (opts: { category?: string; activeOnly?: boolean } = {}) =>
    db.products.filter(
      (p) =>
        (!opts.activeOnly || p.active) &&
        (!opts.category || opts.category === "All" || p.category === opts.category)
    ),
  productById: (id?: string) => db.products.find((p) => p.id === id) ?? null,
  productBySlug: (slug: string) => db.products.find((p) => p.slug === slug) ?? null,
  categories: () => [...new Set(db.products.map((p) => p.category))],

  kits: () => db.kits,
  kitById: (id?: string) => db.kits.find((k) => k.id === id) ?? null,
  clients: () => db.clients,
  clientById: (id?: string) => db.clients.find((c) => c.id === id) ?? null,
  programmes: () => db.programmes,
  programmeById: (id?: string) => db.programmes.find((p) => p.id === id) ?? null,
  vendors: (type?: "SUPPLIER" | "INSTALLATION" | "TRANSPORTER" | "FRANCHISEE") =>
    type ? db.vendors.filter((v) => v.type === type) : db.vendors,
  vendorById: (id?: string) => db.vendors.find((v) => v.id === id) ?? null,

  projects: (user: AppUser | null) => scopeProjects(user),
  projectById: (user: AppUser | null, id: string) =>
    scopeProjects(user).find((p) => p.id === id) ?? null,

  itemsRaw: (projectId: string) => db.items.filter((i) => i.projectId === projectId),
  items: (projectId: string, role: Role) =>
    redactItems(db.items.filter((i) => i.projectId === projectId), role),
  itemById: (id: string) => db.items.find((i) => i.id === id) ?? null,
  allItems: () => db.items,

  changeOrders: (projectId?: string) =>
    projectId ? db.changeOrders.filter((c) => c.projectId === projectId) : db.changeOrders,
  creditNotes: (invoiceId?: string) =>
    invoiceId ? db.creditNotes.filter((c) => c.invoiceId === invoiceId) : db.creditNotes,
  inventory: () => db.inventory,
  vendorBills: () => db.vendorBills,
  costEntries: (projectId?: string) =>
    projectId ? db.costEntries.filter((entry) => entry.projectId === projectId) : db.costEntries,
  purchaseOrders: (projectId?: string) =>
    projectId ? db.purchaseOrders.filter((order) => order.projectId === projectId) : db.purchaseOrders,
  scheduleTasks: (projectId?: string) =>
    projectId ? db.scheduleTasks.filter((task) => task.projectId === projectId) : db.scheduleTasks,
  documents: (projectId?: string) =>
    projectId ? db.documents.filter((d) => d.projectId === projectId) : db.documents,
  notifications: (user: AppUser | null) =>
    user ? db.notifications.filter((n) => n.role === "ALL" || n.role === user.role) : [],

  crates: (projectId?: string) =>
    projectId ? db.crates.filter((c) => c.projectId === projectId) : db.crates,
  crateById: (id?: string) => db.crates.find((c) => c.id === id) ?? null,
  consignments: (projectId?: string) =>
    projectId ? db.consignments.filter((c) => c.projectId === projectId) : db.consignments,
  consignmentById: (id?: string) => db.consignments.find((c) => c.id === id) ?? null,

  tickets: (projectId?: string) =>
    projectId ? db.tickets.filter((t) => t.projectId === projectId) : db.tickets,
  snags: (projectId?: string) =>
    projectId ? db.snags.filter((s) => s.projectId === projectId) : db.snags,
  progressLogs: (projectId: string) =>
    db.progressLogs.filter((l) => l.projectId === projectId).sort((a, b) => b.at.localeCompare(a.at)),
  comments: (projectId: string) =>
    db.comments.filter((c) => c.projectId === projectId).sort((a, b) => b.at.localeCompare(a.at)),

  invoices: (projectId?: string) =>
    projectId ? db.invoices.filter((i) => i.projectId === projectId) : db.invoices,
  challans: (projectId?: string) =>
    projectId ? db.challans.filter((c) => c.projectId === projectId) : db.challans,
  payments: () => db.payments,
  audit: (limit = 50) => db.audit.slice(0, limit),
  enquiries: () => db.enquiries,
  handoverSigned: (projectId: string) => db.handoverSigned[projectId] ?? null,
};

/* ------------------------------------------------------------- derived */

/** Rule ES-01 — everything sitting past its SLA, across every project in scope. */
export function staleItems(user: AppUser | null) {
  const ids = new Set(scopeProjects(user).map((p) => p.id));
  return db.items.filter(
    (i) => ids.has(i.projectId) && isStale(i.status, i.statusUpdatedAt, NOW)
  );
}

export function openTickets(user: AppUser | null) {
  const ids = new Set(scopeProjects(user).map((p) => p.id));
  return db.tickets.filter((t) => ids.has(t.projectId) && t.status !== "RESOLVED");
}

export function openSnags(user: AppUser | null) {
  const ids = new Set(scopeProjects(user).map((p) => p.id));
  return db.snags.filter((s) => ids.has(s.projectId) && s.status === "OPEN");
}

/** Consignments not yet dispatched, with everything a dispatch check needs. */
export function pendingConsignments(user: AppUser | null) {
  const projects = scopeProjects(user);
  const ids = new Set(projects.map((p) => p.id));
  return db.consignments
    .filter((c) => ids.has(c.projectId) && c.status === "READY")
    .map((c) => ({
      consignment: c,
      project: projects.find((p) => p.id === c.projectId)!,
      crates: db.crates.filter((cr) => c.crateIds.includes(cr.id)),
    }));
}

export function receivablesAgeing(user: AppUser | null) {
  const ids = new Set(scopeProjects(user).map((p) => p.id));
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 };
  for (const inv of db.invoices) {
    if (!ids.has(inv.projectId)) continue;
    const outstanding = inv.netPayable - inv.amountReceived;
    if (outstanding <= 0) continue;
    const days = Math.floor((NOW.getTime() - new Date(inv.issuedAt).getTime()) / 86_400_000);
    if (days <= 30) buckets["0-30"] += outstanding;
    else if (days <= 60) buckets["31-60"] += outstanding;
    else if (days <= 90) buckets["61-90"] += outstanding;
    else buckets["90+"] += outstanding;
  }
  return buckets;
}

/** Retention held per project, with its DLP release date — rule FN-05. */
export function retentionQueue(user: AppUser | null) {
  return scopeProjects(user)
    .map((p) => {
      const held = db.invoices
        .filter((i) => i.projectId === p.id)
        .reduce((s, i) => s + i.retentionAmount, 0);
      const releaseAt = p.dlpEndDate ? new Date(p.dlpEndDate) : null;
      return {
        project: p,
        held,
        releaseAt,
        daysToRelease: releaseAt
          ? Math.ceil((releaseAt.getTime() - NOW.getTime()) / 86_400_000)
          : null,
      };
    })
    .filter((r) => r.held > 0);
}
