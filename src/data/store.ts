/**
 * Live application state.
 *
 * Seed data is loaded once, then mutated in place by `actions.ts`. Components
 * subscribe with `useDb()` and re-render on every commit, so the app behaves like
 * a real one: file a damage report and it appears on the Admin queue, dispatch a
 * consignment and the client's ETA updates.
 *
 * Every commit is persisted to this browser (see persistence.ts), so work
 * survives a reload, a closed tab and a restarted machine. That is per-device,
 * not shared — when Firestore is provisioned it becomes the source of truth and
 * this file becomes the local cache in front of it.
 */

import { useSyncExternalStore } from "react";
import * as seed from "./seed";
import * as persist from "./persistence";
import type {
  AppNotification, AppUser, AuditEntry, BoqItem, ChangeOrder, Challan, Client,
  Comment, Consignment, Crate, CreditNote, DocumentRecord, Enquiry, InventoryItem,
  CostEntry, Invoice, Kit, Payment, Product, ProgressLog, Programme, Project, PurchaseOrder, ScheduleTask, Snag, Ticket,
  Vendor, VendorBill,
} from "@/types";
import { deriveProjectStatus, isStale } from "@/lib/statuses";
import { rollUp } from "@/lib/money";

/* --------------------------------------------------------------- the data */

export interface Db {
  users: AppUser[];
  products: Product[];
  kits: Kit[];
  clients: Client[];
  programmes: Programme[];
  vendors: Vendor[];
  projects: Project[];
  items: BoqItem[];
  crates: Crate[];
  consignments: Consignment[];
  tickets: Ticket[];
  snags: Snag[];
  progressLogs: ProgressLog[];
  comments: Comment[];
  invoices: Invoice[];
  challans: Challan[];
  payments: Payment[];
  creditNotes: CreditNote[];
  changeOrders: ChangeOrder[];
  inventory: InventoryItem[];
  vendorBills: VendorBill[];
  costEntries: CostEntry[];
  purchaseOrders: PurchaseOrder[];
  scheduleTasks: ScheduleTask[];
  documents: DocumentRecord[];
  notifications: AppNotification[];
  enquiries: Enquiry[];
  audit: AuditEntry[];
  /** projects whose handover has been signed by the client */
  handoverSigned: Record<string, { at: string; by: string }>;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function freshFromSeed(): Db {
  return {
    users: clone(seed.USERS),
    products: clone(seed.PRODUCTS),
    kits: clone(seed.KITS),
    clients: clone(seed.CLIENTS),
    programmes: clone(seed.PROGRAMMES),
    vendors: clone(seed.VENDORS),
    projects: clone(seed.PROJECTS),
    items: clone(seed.BOQ_ITEMS),
    crates: clone(seed.CRATES),
    consignments: clone(seed.CONSIGNMENTS),
    tickets: clone(seed.TICKETS),
    snags: clone(seed.SNAGS),
    progressLogs: clone(seed.PROGRESS_LOGS),
    comments: clone(seed.COMMENTS),
    invoices: clone(seed.INVOICES),
    challans: [],
    payments: [],
    creditNotes: [],
    changeOrders: [],
    inventory: clone(seed.INVENTORY),
    vendorBills: [],
    costEntries: [],
    purchaseOrders: [],
    scheduleTasks: [],
    documents: [],
    notifications: [],
    enquiries: [],
    audit: [],
    handoverSigned: {},
  };
}

/**
 * Seed first, then overlay whatever was saved on this device. Merging key by key
 * rather than replacing wholesale means a save written before a new collection
 * existed still hydrates — the missing collection just keeps its seed value.
 */
export const db: Db = (() => {
  const base = freshFromSeed();
  const saved = persist.load();
  if (!saved) return base;

  (Object.keys(base) as Array<keyof Db>).forEach((key) => {
    const value = saved[key];
    if (value !== undefined && value !== null) {
      // @ts-expect-error — key-wise copy across a heterogeneous record
      base[key] = value;
    }
  });
  return base;
})();

/** "Now" for the demo — seed dates are relative to this. */
export const NOW = seed.NOW;

/* ------------------------------------------------------------ subscription */

let version = 0;
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return version;
}

/** Subscribe a component to store changes. Returns the current version. */
export function useDb(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function commit() {
  version += 1;
  persist.save(db);
  listeners.forEach((l) => l());
}

/** Throw away everything and start again from seed. */
export function resetToSeed() {
  persist.clear();
  Object.assign(db, freshFromSeed());
  recomputeAll();
  version += 1;
  persist.flush(db);
  listeners.forEach((l) => l());
}

export const persistence = persist.status;

/* -------------------------------------------------------------------- ids */

// Start above anything already saved so a hydrated store never reissues an id.
let counter = 1000;
export function primeCounter() {
  const seen = [
    ...db.items, ...db.tickets, ...db.snags, ...db.projects,
    ...db.invoices, ...db.challans, ...db.payments, ...db.comments,
    ...db.progressLogs, ...db.vendors, ...db.products, ...db.clients,
  ].map((r) => Number(String((r as { id: string }).id).split("-").pop()));
  const highest = seen.filter((n) => Number.isFinite(n)).reduce((m, n) => Math.max(m, n), 1000);
  counter = Math.max(counter, highest);
}

export function nextId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}

/**
 * Gapless per-series document numbers — rule FN-06, allocated centrally.
 *
 * The next number is derived from what is already on file rather than held in a
 * variable, so a reload cannot reissue KP/INV/26-27/0122 to a second invoice.
 */
export function nextDocNumber(kind: "DC" | "INV"): string {
  const existing = kind === "DC"
    ? db.challans.map((c) => c.number)
    : db.invoices.map((i) => i.number);

  const highest = existing
    .map((n) => Number(n.split("/").pop()))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), kind === "DC" ? 141 : 121);

  return `KP/${kind}/26-27/${String(highest + 1).padStart(4, "0")}`;
}

/**
 * Project codes continue the existing run rather than restarting — derived from
 * the highest code on file so a new project never collides with an old one.
 */
export function nextProjectCode(): string {
  const year = NOW.getFullYear();
  const highest = db.projects
    .map((p) => Number(p.code.split("-").pop()))
    .filter((n) => Number.isFinite(n))
    .reduce((max, n) => Math.max(max, n), 0);
  return `KP-${year}-${String(highest + 1).padStart(3, "0")}`;
}

/* ------------------------------------------------------------ derivations */

/**
 * Rule PR-06 — project status and totals are recomputed from the items beneath
 * them, never typed. Called after every mutation that could move a project.
 */
export function recomputeProject(projectId: string) {
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return;

  const items = db.items.filter((i) => i.projectId === projectId);
  const money = rollUp(items);
  const openSnags = db.snags.filter((s) => s.projectId === projectId && s.status === "OPEN");
  const openTickets = db.tickets.filter((t) => t.projectId === projectId && t.status !== "RESOLVED");
  const signed = db.handoverSigned[projectId];

  project.status = deriveProjectStatus(
    items.map((i) => i.status),
    {
      onHold: project.status === "ON_HOLD" ? true : undefined,
      cancelled: project.status === "CANCELLED" ? true : undefined,
      openSnags: openSnags.length,
      handoverSigned: Boolean(signed),
    }
  );

  const approvedChangeValue = project.approvedChangeValue ?? 0;
  const value = money.revenue + approvedChangeValue;
  const quotedMargin = money.quotedMargin + approvedChangeValue;
  const realMargin = money.realMargin + approvedChangeValue;
  project.totals = {
    itemCount: items.length,
    installedCount: items.filter((i) => i.status === "INSTALLED" || i.status === "HANDED_OVER").length,
    value,
    baseCost: money.baseCost,
    landedCost: money.landedCost,
    reworkCost: money.rework,
    quotedMargin,
    realMargin,
    marginPct: value ? (realMargin / value) * 100 : 0,
  };

  project.flags = {
    overdue:
      new Date(project.targetCompletionDate) < NOW &&
      !["COMPLETED", "CLOSED", "CANCELLED"].includes(project.status),
    stale: items.some((i) => isStale(i.status, i.statusUpdatedAt, NOW)),
    hasOpenTickets: openTickets.length > 0,
    hasCriticalSnags: openSnags.some((s) => s.severity === "CRITICAL"),
  };

  if (signed) {
    project.actualCompletionDate = signed.at;
    project.dlpStartDate = signed.at;
    const end = new Date(signed.at);
    end.setMonth(end.getMonth() + project.dlpMonths);
    project.dlpEndDate = end.toISOString();
  }
}

export function recomputeAll() {
  db.projects.forEach((p) => recomputeProject(p.id));
}

/* ------------------------------------------------------------------ audit */

export function audit(
  actor: AppUser,
  entity: string,
  action: string,
  detail: string,
  extra: { ruleOverridden?: string; overrideReason?: string } = {}
) {
  db.audit.unshift({
    id: nextId("au"),
    at: new Date().toISOString(),
    actorName: actor.name,
    actorRole: actor.role,
    entity,
    action,
    detail,
    ...extra,
  });
}

// Bring totals in line with the derivation rules, whether this boot came from
// seed or from a save, and make sure new ids cannot collide with restored ones.
primeCounter();
recomputeAll();

// Two tabs on one machine should not drift apart.
if (typeof window !== "undefined") {
  persist.onExternalChange(() => {
    const saved = persist.load();
    if (!saved) return;
    (Object.keys(db) as Array<keyof Db>).forEach((key) => {
      const value = saved[key];
      // @ts-expect-error — key-wise copy across a heterogeneous record
      if (value !== undefined && value !== null) db[key] = value;
    });
    primeCounter();
    version += 1;
    listeners.forEach((l) => l());
  });
}
