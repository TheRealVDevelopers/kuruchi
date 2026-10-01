/**
 * The business rule catalogue, as code.
 * Rule IDs match docs/02-workflow.md section 5 — do not renumber them.
 *
 * Every gate returns the SAME shape so the UI can always explain itself:
 * a disabled button with no reason is the thing people work around.
 */

import type {
  BoqItem,
  Consignment,
  Crate,
  Project,
  Role,
  Snag,
  Ticket,
} from "@/types";

export interface RuleVerdict {
  /** may the action proceed? */
  ok: boolean;
  /** rule IDs currently blocking it */
  blockedBy: string[];
  /** human sentences, one per blocking rule */
  reasons: string[];
  /** can ADMIN push through with a typed reason? */
  overridable: boolean;
}

const PASS: RuleVerdict = { ok: true, blockedBy: [], reasons: [], overridable: false };

function fail(
  parts: Array<{ id: string; reason: string } | null>,
  overridable = false
): RuleVerdict {
  const hits = parts.filter(Boolean) as Array<{ id: string; reason: string }>;
  if (!hits.length) return PASS;
  return {
    ok: false,
    blockedBy: hits.map((h) => h.id),
    reasons: hits.map((h) => h.reason),
    overridable,
  };
}

/** E-way bill threshold — GST rules, consignment value. */
export const EWAY_BILL_THRESHOLD = 50_000;

/* -------------------------------------------------------------- AC access */

/** AC-01 — Super Admin is read-only everywhere except comments. */
export function canWrite(role: Role, entity: "comment" | "any"): boolean {
  if (role === "SUPER_ADMIN") return entity === "comment";
  return true;
}

/** AC-02 / AC-03 — who may see money at all. */
export function canSeeCost(role: Role): boolean {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "ACCOUNTS";
}

/** AC-03 — Installation sees no prices of any kind. */
export function canSeeAnyPrice(role: Role): boolean {
  return role !== "INSTALLATION" && role !== undefined;
}

/** The client sees selling and final price, never cost, vendor or margin. */
export function canSeeSellingPrice(role: Role): boolean {
  return role !== "INSTALLATION";
}

/* ------------------------------------------------------ PR / BQ  project */

/** PR-03 — after approval, lines are read-only; changes go through a change order. */
export function canEditBoqInPlace(project: Project): RuleVerdict {
  const locked: Project["status"][] = ["DRAFT", "PENDING_APPROVAL"];
  if (locked.includes(project.status)) return PASS;
  return fail([
    {
      id: "PR-03",
      reason: "The BOQ is approved. Raise a change order instead of editing in place.",
    },
  ]);
}

/** BQ-02 — quoting below cost needs a conscious decision. */
export function checkQuoteMargin(basePrice: number, sellingPrice: number): RuleVerdict {
  if (sellingPrice >= basePrice) return PASS;
  return fail(
    [{ id: "BQ-02", reason: "Selling price is below base price — negative margin at quote." }],
    true
  );
}

/* ------------------------------------------------------- DS  dispatch */

export interface DispatchContext {
  project: Project;
  consignment: Consignment;
  crates: Crate[];
}
/** Kurchi company policy: every outgoing shipment carries an e-way bill. */
export const KURCHI_EWAY_REQUIRED_FOR_ALL_SHIPMENTS = true;

/**
 * DS-02, DS-03, DS-04, DS-05, DS-06 — everything that must be true
 * before a vehicle is allowed to leave.
 */
export function canDispatch({ project, consignment, crates }: DispatchContext): RuleVerdict {
  const noPhotos = crates.filter((c) => c.photos.length === 0);
  const needsEway = KURCHI_EWAY_REQUIRED_FOR_ALL_SHIPMENTS || consignment.taxableValue * 1.18 > EWAY_BILL_THRESHOLD;
  const readiness = project.siteReadiness;
  const notReady = Object.entries(readiness)
    .filter(([, ok]) => !ok)
    .map(([k]) => k);

  return fail(
    [
      noPhotos.length
        ? {
            id: "DS-02",
            reason: `${noPhotos.length} crate(s) have no packing photos: ${noPhotos
              .map((c) => c.crateCode)
              .join(", ")}.`,
          }
        : null,
      !consignment.rtsCheckedAt || !consignment.boxCounts?.length
        ? { id: "DS-01", reason: "Complete the ready-to-ship box checklist first." }
        : null,
      (consignment.billingExempt ? !consignment.challanId : !consignment.invoiceId)
        ? { id: "DS-08", reason: consignment.billingExempt ? "Replacement shipment needs its delivery challan before dispatch." : "Create the tax invoice before dispatch." }
        : null,
      consignment.deliveryMethod === "DIRECT_TRUCK" && !(consignment.driverName && consignment.driverPhone && consignment.driverLicenceNo)
        ? { id: "DS-01", reason: "Direct truck needs the driver's name, mobile number and licence number." }
        : null,
      needsEway && !consignment.ewayBillNo
        ? {
            id: "DS-03",
            reason: "Kurchi policy requires an e-way bill number before every dispatch.",
          }
        : null,
      consignment.ewayBillNo && !(consignment.transporterName && consignment.vehicleNo)
        ? {
            id: "DS-04",
            reason: "E-way bill Part B needs a transporter and a vehicle number.",
          }
        : null,
      notReady.length
        ? {
            id: "DS-05",
            reason: `Site is not ready: ${notReady.map(readinessLabel).join(", ")}.`,
          }
        : null,
      !consignment.lrNumber
        ? { id: "DS-06", reason: "No lorry receipt (LR) number recorded." }
        : null,
      !consignment.eta
        ? { id: "DS-07", reason: "An ETA is required on dispatch." }
        : null,
    ],
    // Only the site-readiness gate is overridable, and only with a written reason.
    true
  );
}

export function readinessLabel(key: string): string {
  const map: Record<string, string> = {
    civil: "civil work",
    flooring: "flooring",
    power: "power",
    truckAccess: "truck access",
    storage: "on-site storage",
    contact: "site contact",
  };
  return map[key] ?? key;
}

/** DS-07 — consignment past its ETA and still moving. */
export function isTransitDelayed(c: Consignment, now = new Date()): boolean {
  if (!c.eta || c.deliveredAt) return false;
  return new Date(c.eta) < now;
}

/* ----------------------------------------------------------- ST  site */

/** ST-02 — a damage report without evidence is not a damage report. */
export function canSubmitTicket(t: Partial<Ticket>): RuleVerdict {
  return fail([
    t.type !== "SERVICE" && !t.photos?.length
      ? { id: "ST-02", reason: "At least one photo is required." }
      : null,
    !t.cause ? { id: "ST-02", reason: "Pick a cause before submitting." } : null,
    t.type === "SERVICE" && !t.note?.trim()
      ? { id: "ST-02", reason: "Describe the service request." }
      : null,
  ]);
}

/**
 * ST-06 — damage reported more than 48h after receipt cannot be pinned on the
 * transporter. The clock protects the claim, so the app sets the cause itself.
 */
export function defaultCause(receivedAt: string | undefined, now = new Date()): Ticket["cause"] {
  if (!receivedAt) return "TRANSIT";
  const hours = (now.getTime() - new Date(receivedAt).getTime()) / 3_600_000;
  return hours > 48 ? "HANDLING_AT_SITE" : "TRANSIT";
}

/** ST-01, ST-03 — an item with an open ticket cannot be called installed. */
export function canMarkInstalled(item: BoqItem, tickets: Ticket[]): RuleVerdict {
  const open = tickets.filter((t) => t.itemId === item.id && t.status !== "RESOLVED");
  return fail([
    open.length
      ? {
          id: "ST-03",
          reason: `${open.length} open ${open.length === 1 ? "ticket" : "tickets"} on this item.`,
        }
      : null,
    item.qtyReceived < item.qty
      ? {
          id: "ST-01",
          reason: `Short received: ${item.qtyReceived} of ${item.qty} remaining units arrived.`,
        }
      : null,
  ]);
}

/* ------------------------------------------------------- IN / HO handover */

/** IN-06, IN-07, HO-01 — installed and accepted are different things. */
export function canRaiseHandover(items: BoqItem[], snags: Snag[]): RuleVerdict {
  const live = items.filter((i) => i.status !== "CANCELLED");
  const notInstalled = live.filter(
    (i) => i.status !== "INSTALLED" && i.status !== "HANDED_OVER"
  );
  const openSnags = snags.filter((s) => s.status === "OPEN");
  const serious = openSnags.filter((s) => s.severity !== "MINOR");

  const verdict = fail([
    notInstalled.length
      ? {
          id: "HO-01",
          reason: `${notInstalled.length} item(s) are not installed yet.`,
        }
      : null,
    serious.length
      ? {
          id: "IN-06",
          reason: `${serious.length} major or critical snag(s) still open.`,
        }
      : null,
  ]);

  if (!verdict.ok) return verdict;

  // IN-07 — minor snags only: allowed, but the client must waive them.
  if (openSnags.length) {
    return {
      ok: true,
      blockedBy: ["IN-07"],
      reasons: [
        `${openSnags.length} minor snag(s) open — the client must accept them in writing.`,
      ],
      overridable: false,
    };
  }
  return PASS;
}

/* ------------------------------------------------------------ FN finance */

/** FN-04 — no final invoice before the client has signed. */
export function canRaiseFinalInvoice(project: Project): RuleVerdict {
  return fail([
    project.status !== "COMPLETED" && project.status !== "CLOSED"
      ? { id: "FN-04", reason: "The handover certificate has not been signed yet." }
      : null,
  ]);
}

/** FN-02 — place of supply decides the tax split. */
export function taxMode(
  placeOfSupplyState: string,
  kurchiState = "Karnataka"
): "CGST_SGST" | "IGST" {
  return placeOfSupplyState.trim().toLowerCase() === kurchiState.toLowerCase()
    ? "CGST_SGST"
    : "IGST";
}

/** FN-03 — every taxable line needs an HSN code. */
export function canIssueTaxDocument(items: BoqItem[]): RuleVerdict {
  const missing = items.filter((i) => !i.hsnCode);
  return fail([
    missing.length
      ? {
          id: "FN-03",
          reason: `${missing.length} line(s) have no HSN code: ${missing
            .slice(0, 3)
            .map((i) => i.name)
            .join(", ")}${missing.length > 3 ? "…" : ""}.`,
        }
      : null,
  ]);
}

/* ------------------------------------------------------------- registry */

/** Used by the rule reference screen so the catalogue stays discoverable. */
export const RULE_INDEX: Array<{ id: string; group: string; text: string }> = [
  { id: "AC-01", group: "Access", text: "Super Admin writes are rejected except comments." },
  { id: "AC-02", group: "Access", text: "Client never receives cost, vendor, margin or internal notes." },
  { id: "AC-03", group: "Access", text: "Installation never receives any price field." },
  { id: "PR-01", group: "Project", text: "A BOQ with no lines cannot be confirmed during showroom setup." },
  { id: "PR-02", group: "Project", text: "Every line needs a selling price before Ola can submit payment." },
  { id: "PR-03", group: "Project", text: "An approved BOQ is read-only — use a change order." },
  { id: "PR-06", group: "Project", text: "Project status is derived from item statuses, never typed." },
  { id: "BQ-02", group: "BOQ", text: "Selling below base price warns and needs confirmation." },
  { id: "BQ-05", group: "BOQ", text: "Landed cost = base + transport + install + rework." },
  { id: "BQ-06", group: "BOQ", text: "Quoted margin and real margin are both stored." },
  { id: "DS-02", group: "Dispatch", text: "No packing photos, no dispatch." },
  { id: "DS-03", group: "Dispatch", text: "Over ₹50,000 or inter-state requires an e-way bill." },
  { id: "DS-04", group: "Dispatch", text: "E-way bill Part B needs transporter and vehicle." },
  { id: "DS-05", group: "Dispatch", text: "Site must be ready, or Admin overrides with a reason." },
  { id: "DS-06", group: "Dispatch", text: "An LR number is required to dispatch." },
  { id: "DS-07", group: "Dispatch", text: "ETA is mandatory; past ETA flags a transit delay." },
  { id: "ST-01", group: "Site", text: "Short receipt raises a shortage ticket automatically." },
  { id: "ST-02", group: "Site", text: "Damage reports require a photo and a cause." },
  { id: "ST-03", group: "Site", text: "An item with an open ticket cannot be marked installed." },
  { id: "ST-04", group: "Site", text: "An approved replacement spawns a linked item and books rework." },
  { id: "ST-06", group: "Site", text: "Damage found after 48h defaults to site handling, not transit." },
  { id: "IN-06", group: "Install", text: "Major or critical snags block handover." },
  { id: "IN-07", group: "Install", text: "Minor snags need a written client waiver." },
  { id: "HO-01", group: "Handover", text: "Every item must be installed or cancelled first." },
  { id: "HO-02", group: "Handover", text: "Client signs with an OTP; name, time and IP are stored." },
  { id: "FN-02", group: "Finance", text: "Place of supply decides CGST+SGST vs IGST." },
  { id: "FN-03", group: "Finance", text: "Every taxable line needs an HSN code." },
  { id: "FN-04", group: "Finance", text: "No final invoice until handover is signed." },
  { id: "FN-07", group: "Finance", text: "An issued invoice is immutable — credit note only." },
  { id: "ES-01", group: "Escalation", text: "Status past its SLA is flagged stale on two dashboards." },
];
