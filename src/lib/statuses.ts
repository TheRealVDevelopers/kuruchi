/**
 * Item and project state machines.
 * Mirrors docs/02-workflow.md sections 2 and 3.
 */

import type { ItemStatus, ProjectStatus, Role } from "@/types";

export type Tone =
  | "neutral"
  | "planning"
  | "production"
  | "logistics"
  | "site"
  | "done"
  | "warn"
  | "stop";

export interface ItemStatusMeta {
  label: string;
  tone: Tone;
  /** coarse stage, used for progress bars and the client portal tracker */
  stage: Stage;
  /** who is expected to make the next move */
  owner: Role | "TRANSPORTER";
  /** days before the item is flagged stale — rule ES-01 */
  slaDays: number | null;
}

export const STAGES = [
  "PLANNING",
  "PRODUCTION",
  "DISPATCH",
  "AT_SITE",
  "INSTALLATION",
  "COMPLETE",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  PLANNING: "Approved",
  PRODUCTION: "In production",
  DISPATCH: "Dispatched",
  AT_SITE: "At site",
  INSTALLATION: "Installing",
  COMPLETE: "Handed over",
};

export const ITEM_STATUS_META: Record<ItemStatus, ItemStatusMeta> = {
  DRAFT: { label: "Draft", tone: "neutral", stage: "PLANNING", owner: "ADMIN", slaDays: null },
  APPROVED: { label: "Approved", tone: "planning", stage: "PLANNING", owner: "ADMIN", slaDays: 2 },
  IN_PRODUCTION: { label: "In production", tone: "production", stage: "PRODUCTION", owner: "ADMIN", slaDays: 14 },
  PO_PLACED: { label: "PO placed", tone: "production", stage: "PRODUCTION", owner: "ADMIN", slaDays: 14 },
  QC_PENDING: { label: "QC pending", tone: "production", stage: "PRODUCTION", owner: "ADMIN", slaDays: 1 },
  QC_FAILED: { label: "QC failed", tone: "stop", stage: "PRODUCTION", owner: "ADMIN", slaDays: 2 },
  READY_TO_PACK: { label: "Ready to pack", tone: "production", stage: "PRODUCTION", owner: "ADMIN", slaDays: 3 },
  PACKED: { label: "Packed", tone: "logistics", stage: "DISPATCH", owner: "ADMIN", slaDays: 2 },
  DISPATCHED: { label: "Dispatched", tone: "logistics", stage: "DISPATCH", owner: "TRANSPORTER", slaDays: null },
  IN_TRANSIT: { label: "In transit", tone: "logistics", stage: "DISPATCH", owner: "TRANSPORTER", slaDays: null },
  DELIVERED_AT_SITE: { label: "Delivered at site", tone: "site", stage: "AT_SITE", owner: "INSTALLATION", slaDays: 1 },
  RECEIVED_OK: { label: "Received OK", tone: "site", stage: "AT_SITE", owner: "INSTALLATION", slaDays: 3 },
  RECEIVED_DAMAGED: { label: "Received damaged", tone: "stop", stage: "AT_SITE", owner: "ADMIN", slaDays: 2 },
  SHORT_SUPPLIED: { label: "Short supplied", tone: "stop", stage: "AT_SITE", owner: "ADMIN", slaDays: 2 },
  REPLACEMENT_REQUESTED: { label: "Replacement requested", tone: "warn", stage: "PRODUCTION", owner: "ADMIN", slaDays: 3 },
  INSTALL_ASSIGNED: { label: "Install assigned", tone: "site", stage: "INSTALLATION", owner: "INSTALLATION", slaDays: 2 },
  INSTALL_IN_PROGRESS: { label: "Installing", tone: "site", stage: "INSTALLATION", owner: "INSTALLATION", slaDays: 5 },
  INSTALLED: { label: "Installed", tone: "done", stage: "INSTALLATION", owner: "INSTALLATION", slaDays: null },
  SNAG_OPEN: { label: "Snag open", tone: "warn", stage: "INSTALLATION", owner: "INSTALLATION", slaDays: 5 },
  HANDED_OVER: { label: "Handed over", tone: "done", stage: "COMPLETE", owner: "CLIENT", slaDays: null },
  CANCELLED: { label: "Cancelled", tone: "neutral", stage: "PLANNING", owner: "ADMIN", slaDays: null },
};

/** Allowed forward moves. Anything not listed here is rejected. */
export const ITEM_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  DRAFT: ["APPROVED", "CANCELLED"],
  APPROVED: ["IN_PRODUCTION", "PO_PLACED", "READY_TO_PACK", "CANCELLED"],
  IN_PRODUCTION: ["QC_PENDING", "CANCELLED"],
  PO_PLACED: ["QC_PENDING", "CANCELLED"],
  QC_PENDING: ["READY_TO_PACK", "QC_FAILED"],
  QC_FAILED: ["IN_PRODUCTION", "PO_PLACED"],
  READY_TO_PACK: ["PACKED"],
  PACKED: ["DISPATCHED"],
  DISPATCHED: ["IN_TRANSIT"],
  IN_TRANSIT: ["DELIVERED_AT_SITE"],
  DELIVERED_AT_SITE: ["RECEIVED_OK", "RECEIVED_DAMAGED", "SHORT_SUPPLIED"],
  RECEIVED_OK: ["INSTALL_ASSIGNED"],
  RECEIVED_DAMAGED: ["REPLACEMENT_REQUESTED", "RECEIVED_OK"],
  SHORT_SUPPLIED: ["REPLACEMENT_REQUESTED", "RECEIVED_OK"],
  REPLACEMENT_REQUESTED: ["IN_PRODUCTION", "PO_PLACED"],
  INSTALL_ASSIGNED: ["INSTALL_IN_PROGRESS"],
  INSTALL_IN_PROGRESS: ["INSTALLED"],
  INSTALLED: ["SNAG_OPEN", "HANDED_OVER"],
  SNAG_OPEN: ["INSTALLED"],
  HANDED_OVER: [],
  CANCELLED: [],
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return ITEM_TRANSITIONS[from].includes(to);
}

export function stageIndex(status: ItemStatus): number {
  return STAGES.indexOf(ITEM_STATUS_META[status].stage);
}

/* --------------------------------------------------------------- project */

export const PROJECT_STATUS_META: Record<ProjectStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  PENDING_APPROVAL: { label: "Pending approval", tone: "warn" },
  APPROVED: { label: "Approved", tone: "planning" },
  IN_PRODUCTION: { label: "In production", tone: "production" },
  IN_DISPATCH: { label: "In dispatch", tone: "logistics" },
  AT_SITE: { label: "At site", tone: "site" },
  INSTALLATION: { label: "Installation", tone: "site" },
  SNAGGING: { label: "Snagging", tone: "warn" },
  HANDOVER_PENDING: { label: "Handover pending", tone: "warn" },
  COMPLETED: { label: "Completed", tone: "done" },
  CLOSED: { label: "Closed", tone: "done" },
  ON_HOLD: { label: "On hold", tone: "warn" },
  CANCELLED: { label: "Cancelled", tone: "stop" },
};

/** Item status → the project status it implies. */
const ITEM_TO_PROJECT: Record<ItemStatus, ProjectStatus> = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
  IN_PRODUCTION: "IN_PRODUCTION",
  PO_PLACED: "IN_PRODUCTION",
  QC_PENDING: "IN_PRODUCTION",
  QC_FAILED: "IN_PRODUCTION",
  READY_TO_PACK: "IN_PRODUCTION",
  REPLACEMENT_REQUESTED: "IN_PRODUCTION",
  PACKED: "IN_DISPATCH",
  DISPATCHED: "IN_DISPATCH",
  IN_TRANSIT: "IN_DISPATCH",
  DELIVERED_AT_SITE: "AT_SITE",
  RECEIVED_OK: "AT_SITE",
  RECEIVED_DAMAGED: "AT_SITE",
  SHORT_SUPPLIED: "AT_SITE",
  INSTALL_ASSIGNED: "INSTALLATION",
  INSTALL_IN_PROGRESS: "INSTALLATION",
  INSTALLED: "SNAGGING",
  SNAG_OPEN: "SNAGGING",
  HANDED_OVER: "COMPLETED",
  CANCELLED: "COMPLETED",
};

const PROJECT_ORDER: ProjectStatus[] = [
  "DRAFT",
  "PENDING_APPROVAL",
  "APPROVED",
  "IN_PRODUCTION",
  "IN_DISPATCH",
  "AT_SITE",
  "INSTALLATION",
  "SNAGGING",
  "HANDOVER_PENDING",
  "COMPLETED",
  "CLOSED",
];

/**
 * Rule PR-06 — project status is derived, never typed.
 *
 * It reports the EARLIEST stage that still has unfinished items: if 90 items are
 * installed and one is still in production, the project is IN_PRODUCTION. Show the
 * honest worst case and let the progress bar carry the good news.
 */
export function deriveProjectStatus(
  itemStatuses: ItemStatus[],
  opts: { onHold?: boolean; cancelled?: boolean; openSnags?: number; handoverSigned?: boolean } = {}
): ProjectStatus {
  if (opts.cancelled) return "CANCELLED";
  if (opts.onHold) return "ON_HOLD";
  if (itemStatuses.length === 0) return "DRAFT";
  if (opts.handoverSigned) return "COMPLETED";

  const live = itemStatuses.filter((s) => s !== "CANCELLED");
  if (live.length === 0) return "COMPLETED";

  let earliest = PROJECT_ORDER.length - 1;
  for (const s of live) {
    const idx = PROJECT_ORDER.indexOf(ITEM_TO_PROJECT[s]);
    if (idx >= 0 && idx < earliest) earliest = idx;
  }

  const derived = PROJECT_ORDER[earliest];

  // Everything installed and nothing snagging → waiting on the client to sign.
  if (derived === "SNAGGING" && !opts.openSnags) return "HANDOVER_PENDING";
  return derived;
}

/** 0–100, counting items that have reached installation or beyond. */
export function projectProgress(itemStatuses: ItemStatus[]): number {
  const live = itemStatuses.filter((s) => s !== "CANCELLED");
  if (!live.length) return 0;
  const total = live.length * (STAGES.length - 1);
  const done = live.reduce((sum, s) => sum + stageIndex(s), 0);
  return Math.round((done / total) * 100);
}

/* ----------------------------------------------------------------- stale */

/** Rule ES-01 — has this item sat past its SLA? */
export function isStale(status: ItemStatus, statusUpdatedAt: string, now = new Date()): boolean {
  const sla = ITEM_STATUS_META[status].slaDays;
  if (sla === null) return false;
  const days = (now.getTime() - new Date(statusUpdatedAt).getTime()) / 86_400_000;
  return days > sla;
}

export function daysInStatus(statusUpdatedAt: string, now = new Date()): number {
  // An item touched moments ago is 0 days old, never negative — the demo clock
  // and the wall clock can disagree by a few hours.
  const days = Math.floor((now.getTime() - new Date(statusUpdatedAt).getTime()) / 86_400_000);
  return Math.max(0, days);
}

/* ------------------------------------------------------------ tone → css */

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 border-slate-200",
  planning: "bg-indigo-50 text-indigo-700 border-indigo-200",
  production: "bg-orange-50 text-orange-700 border-orange-200",
  logistics: "bg-amber-50 text-amber-800 border-amber-200",
  site: "bg-sky-50 text-sky-700 border-sky-200",
  done: "bg-emerald-50 text-emerald-700 border-emerald-200",
  warn: "bg-yellow-50 text-yellow-800 border-yellow-300",
  stop: "bg-red-50 text-red-700 border-red-200",
};
