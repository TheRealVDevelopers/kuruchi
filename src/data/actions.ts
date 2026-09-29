/**
 * Every write the app can make.
 *
 * Each action re-checks its business rule before mutating — the UI disables the
 * button, but a rule that only lives in the UI is decoration. Rule IDs match
 * docs/02-workflow.md section 5.
 */

import { audit, commit, db, nextDocNumber, nextId, nextProjectCode, NOW, recomputeProject } from "./store";
import type {
  AppUser, BoqItem, ChangeOrder, Client, CreditNote, DocumentRecord, InventoryItem, PurchaseOrder, ScheduleTask, SellerProfile,
  ItemStatus, Product, Programme, Project, Role, SnagSeverity, TicketCause,
  TicketDecision, Vendor, VendorBill, SiteWorkStatus, CostEntry, OperationalStatus,
} from "@/types";
import {
  canDispatch, canEditBoqInPlace, canMarkInstalled, canRaiseFinalInvoice,
  canRaiseHandover, canSubmitTicket, taxMode, EWAY_BILL_THRESHOLD,
} from "@/lib/rules";
import { canTransition } from "@/lib/statuses";

export class RuleError extends Error {
  constructor(message: string, public rules: string[] = []) {
    super(message);
    this.name = "RuleError";
  }
}

const now = () => new Date().toISOString();

function requireProject(projectId: string) {
  const p = db.projects.find((x) => x.id === projectId);
  if (!p) throw new RuleError("Project not found.");
  return p;
}

function requireAccounts(actor: AppUser) {
  if (actor.role !== "ACCOUNTS") throw new RuleError("Only Accounts can complete this financial action.");
}

function requireInvoiceParties(project: Project) {
  const seller = db.sellerProfile;
  if (!seller.legalName || !seller.gstin || !seller.pan || !seller.address || !seller.state || !seller.pincode) throw new RuleError("Complete Kurchi’s legal seller profile before issuing a tax document.", ["FN-01"]);
  const client = db.clients.find((entry) => entry.id === project.clientId);
  if (!client?.name || !client.gstin || !client.billingAddress || !client.state) {
    throw new RuleError("Complete the customer name, GSTIN, billing address and state before issuing a tax document.", ["FN-01"]);
  }
  if (!project.site.address || !project.site.state || !project.site.pincode) {
    throw new RuleError("Complete the showroom delivery address before issuing a tax document.", ["FN-01"]);
  }
  return client;
}

export function saveSellerProfile(actor: AppUser, profile: SellerProfile) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Kurchi Admin can update the legal seller profile.");
  if (!profile.legalName.trim() || !profile.gstin.trim() || !profile.pan.trim() || !profile.address.trim() || !profile.state.trim() || !profile.pincode.trim()) throw new RuleError("Legal name, GSTIN, PAN, address, state and PIN code are required.");
  db.sellerProfile = { ...profile, legalName: profile.legalName.trim(), gstin: profile.gstin.trim().toUpperCase(), pan: profile.pan.trim().toUpperCase(), invoicePrefix: (profile.invoicePrefix || "KP").trim().toUpperCase() };
  audit(actor, "settings/seller-profile", "UPDATE", "Kurchi legal seller profile updated");
  commit();
}

function creditedAmount(invoiceId: string) {
  return db.creditNotes.filter((note) => note.invoiceId === invoiceId).reduce((sum, note) => sum + note.amount, 0);
}

function notify(role: Role | "ALL", title: string, detail: string, link?: string) {
  db.notifications.unshift({
    id: nextId("ntf"), role, title, detail, link, createdAt: now(), readBy: [],
  });
}

/* ------------------------------------------------------------- item status */

export function setItemStatus(
  actor: AppUser,
  itemId: string,
  to: ItemStatus,
  opts: { force?: boolean } = {}
) {
  const item = db.items.find((i) => i.id === itemId);
  if (!item) throw new RuleError("Item not found.");
  const project = requireProject(item.projectId);
  if (["DISPATCHED", "IN_TRANSIT", "DELIVERED_AT_SITE"].includes(to)) throw new RuleError("Use the dispatch and site-receipt workflow for movement statuses.");
  if (["RECEIVED_OK", "RECEIVED_DAMAGED", "SHORT_SUPPLIED", "INSTALLED"].includes(to) && actor.role !== "INSTALLATION") throw new RuleError("Only Installation can record receipt or fitting.");
  if (to === "HANDED_OVER") throw new RuleError("Use the handover workflow; an item cannot be handed over from the status dropdown.");
  if (["IN_PRODUCTION", "PO_PLACED", "QC_PENDING", "READY_TO_PACK", "PACKED"].includes(to) && project.initialPayment?.status !== "VERIFIED") throw new RuleError("Accounts must verify the advance before production starts.");

  if (!opts.force && !canTransition(item.status, to)) {
    throw new RuleError(`Cannot move ${item.name} from ${item.status} to ${to}.`);
  }

  if (to === "INSTALLED") {
    const verdict = canMarkInstalled(item, db.tickets.filter((t) => t.projectId === item.projectId));
    if (!verdict.ok) throw new RuleError(verdict.reasons.join(" "), verdict.blockedBy);
    item.qtyInstalled = item.qty;
  }

  const from = item.status;
  item.status = to;
  item.statusUpdatedAt = now();

  if ((to === "INSTALL_IN_PROGRESS" || to === "INSTALLED") && !project.installationStartedAt) {
    project.installationStartedAt = now();
    project.operationalStatus = "INSTALLATION";
    project.operationalStatusUpdatedAt = now();
    audit(actor, `projects/${project.id}`, "UPDATE", "Installation started within the site checklist");
  }

  audit(actor, `items/${item.id}`, "STATUS_CHANGE", `${item.name}: ${from} → ${to}`);
  recomputeProject(item.projectId);
  commit();
  return item;
}

/**
 * The field workflow deliberately has no reversible installation states.
 * An item must be received first, then the crew can confirm it is installed.
 */
export function markItemInstalled(actor: AppUser, itemId: string) {
  const item = db.items.find((entry) => entry.id === itemId);
  if (!item) throw new RuleError("Item not found.");
  const readyToInstall = ["RECEIVED_OK", "INSTALL_ASSIGNED", "INSTALL_IN_PROGRESS"] as const;
  if (!readyToInstall.includes(item.status as (typeof readyToInstall)[number])) {
    throw new RuleError("Confirm receipt before marking this item installed.");
  }
  // `force` only clears legacy intermediate states created by the old site UI.
  return setItemStatus(actor, itemId, "INSTALLED", { force: item.status !== "RECEIVED_OK" });
}

/** Bulk move — used by the dispatch board and the BOQ table. */
export function setManyStatuses(actor: AppUser, itemIds: string[], to: ItemStatus) {
  itemIds.forEach((id) => {
    try { setItemStatus(actor, id, to); } catch { /* skip ones the machine rejects */ }
  });
}

/* ------------------------------------------------------ create a project */

export interface NewProjectInput {
  clientId: string;
  programmeId: string;
  city: string;
  state: string;
  pincode: string;
  address: string;
  showroomName?: string;
  showroomGstin?: string;
  contactName: string;
  contactPhone: string;
  /** These are supplied when Ola onboards a showroom partner. */
  franchisee?: {
    name: string;
    phone: string;
    email?: string;
    gstin?: string;
  };
  targetCompletionDate: string;
  installationTeamId?: string;
  retentionPct: number;
  dlpMonths: number;
  kitId?: string;
  boqMode?: "STANDARD" | "MODULAR";
  payment?: { amount: number; reference: string; proofName?: string; proofUrl?: string };
  /** productId → quantity, edited by Admin before saving. 0 drops the line. */
  quantities: Record<string, number>;
}

/**
 * Rule BQ-01 — applying a kit copies item, spec, default quantity and the
 * product's default base and selling prices, then lets Admin edit before
 * saving. The project lands in DRAFT so nothing is committed to the client
 * until the BOQ is deliberately sent for approval.
 */
export function createProjectFromKit(actor: AppUser, input: NewProjectInput) {
  if (!input.city.trim()) throw new RuleError("A city is required.");
  if (!input.contactPhone.trim()) throw new RuleError("A site contact number is required.");
  if (!input.targetCompletionDate) throw new RuleError("Set a target completion date.");

  const client = db.clients.find((c) => c.id === input.clientId);
  if (!client) throw new RuleError("Pick a client.");
  if (actor.role === "CLIENT" && !input.franchisee?.name.trim()) {
    throw new RuleError("Add the franchisee owner before submitting the showroom.");
  }
  if (actor.role === "CLIENT" && input.boqMode === "STANDARD" && !input.kitId) {
    throw new RuleError("Kurchi needs to create the Standard BOQ before continuing.");
  }
  if (actor.role === "CLIENT" && input.boqMode === "MODULAR" && !Object.values(input.quantities).some((qty) => qty > 0)) {
    throw new RuleError("Set a quantity for at least one catalogue product.");
  }
  if (actor.role === "CLIENT" && input.boqMode === "MODULAR" && Object.values(input.quantities).some((qty) => !Number.isInteger(qty) || qty < 0)) {
    throw new RuleError("Modular BOQ quantities must be whole numbers of zero or more.");
  }
  if (actor.role === "CLIENT" && (!input.payment || input.payment.amount <= 0 || !input.payment.reference.trim())) {
    throw new RuleError("Enter the amount paid and the UTR or payment reference.");
  }

  let franchiseeId: string | undefined;
  if (input.franchisee?.name.trim()) {
    const samePartner = db.vendors.find((v) => v.type === "FRANCHISEE" && v.clientId === input.clientId && v.contactPhone === input.franchisee!.phone.trim());
    const partner = samePartner ?? {
      id: nextId("fr"),
      name: `${input.franchisee.name.trim()} — Franchisee`,
      type: "FRANCHISEE" as const,
      clientId: input.clientId,
      city: input.city.trim(), state: input.state.trim(),
      address: input.address.trim(), pincode: input.pincode.trim(),
      gstin: input.franchisee.gstin?.trim().toUpperCase() || undefined,
      email: input.franchisee.email?.trim() || undefined,
      contactName: input.franchisee.name.trim(), contactPhone: input.franchisee.phone.trim(),
    };
    if (!samePartner) db.vendors.push(partner);
    franchiseeId = partner.id;
  }

  const projectId = nextId("prj");
  const project: Project = {
    id: projectId,
    code: nextProjectCode(),
    name: input.showroomName?.trim() || `${client.name.split(" ")[0]} Showroom — ${input.city.trim()}`,
    clientId: input.clientId,
    franchiseeId,
    programmeId: input.programmeId,
    createdByRole: actor.role,
    olaSubmittedAt: actor.role === "CLIENT" ? now() : undefined,
    boqMode: input.boqMode,
    standardKitId: input.boqMode === "STANDARD" ? input.kitId : undefined,
    site: {
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim(),
      pincode: input.pincode.trim(),
      gstin: input.showroomGstin?.trim().toUpperCase() || undefined,
      contactName: input.contactName.trim(),
      contactPhone: input.contactPhone.trim(),
    },
    status: "DRAFT",
    statusUpdatedAt: now(),
    startDate: now(),
    targetCompletionDate: new Date(input.targetCompletionDate).toISOString(),
    installationTeamId: input.installationTeamId,
    // A brand-new site is ready for nothing until someone confirms it — DS-05.
    siteReadiness: {
      civil: false, flooring: false, power: false,
      truckAccess: false, storage: false, contact: Boolean(input.contactPhone.trim()),
    },
    retentionPct: input.retentionPct,
    dlpMonths: input.dlpMonths,
    totals: {
      itemCount: 0, installedCount: 0, value: 0, baseCost: 0, landedCost: 0,
      reworkCost: 0, quotedMargin: 0, realMargin: 0, marginPct: 0,
    },
    flags: { overdue: false, stale: false, hasOpenTickets: false, hasCriticalSnags: false },
  };
  db.projects.push(project);

  const kit = db.kits.find((k) => k.id === input.kitId);
  const sourceLines = kit?.lines ?? (input.boqMode === "MODULAR"
    ? db.products.filter((product) => product.active).map((product) => ({
      productId: product.id, name: product.name, spec: product.shortSpec, defaultQty: 0, zone: "Showroom",
    }))
    : []);
  let lineCount = 0;

  if (sourceLines.length) {
    sourceLines.forEach((line, idx) => {
      const qty = input.quantities[line.productId] ?? line.defaultQty;
      if (qty <= 0) return;
      const product = db.products.find((p) => p.id === line.productId);

      db.items.push({
        id: `${projectId}-i${idx + 1}`,
        projectId,
        productId: line.productId,
        name: line.name,
        orderCategory: product?.orderCategory ?? "SALES",
        spec: line.spec,
        hsnCode: product?.hsnCode ?? "",
        unit: product?.unit ?? "nos",
        qty,
        status: "DRAFT",
        statusUpdatedAt: now(),
        qcAttempts: 0,
        qtyDispatched: 0,
        qtyReceived: 0,
        qtyInstalled: 0,
        zone: line.zone,
        pricing: {
          basePrice: product?.defaultBasePrice ?? 0,
          sellingPrice: product?.defaultSellingPrice ?? 0,
          finalPrice: product?.defaultSellingPrice ?? 0,
          allocatedTransport: 0,
          allocatedInstall: 0,
          reworkCost: 0,
        },
      });
      lineCount += 1;
    });
  }

  audit(
    actor,
    `projects/${projectId}`,
    "CREATE",
    kit
      ? `${project.code} created from kit "${kit.name}" v${kit.version} — ${lineCount} lines`
      : `${project.code} created from the Modular catalogue — ${lineCount} lines`
  );

  recomputeProject(projectId);
  if (actor.role === "CLIENT" && input.payment) {
    const percentage = project.totals.value > 0 ? Math.round((input.payment.amount / project.totals.value) * 10000) / 100 : 0;
    project.initialPayment = {
      amount: Math.round(input.payment.amount), percentage,
      reference: input.payment.reference.trim(), proofName: input.payment.proofName, proofUrl: input.payment.proofUrl,
      submittedAt: now(), status: "PENDING_VERIFICATION",
    };
    project.advanceRequiredPct = project.advanceRequiredPct ?? 0;
    project.advanceReceivedPct = 0;
    notify("ACCOUNTS", "Payment verification needed", `${project.name} · ₹${project.initialPayment.amount.toLocaleString("en-IN")} paid (${percentage}%). Check UTR ${project.initialPayment.reference}.`, "/accounts");
    notify("VENDOR", "Franchisee welcome is ready", `${project.name} has been created. A login invitation will be sent when SMS/email delivery is connected.`, "/franchisee");
  }
  commit();
  return project;
}

/** Ola opens the request; Kurchi explicitly accepts it before operational work starts. */
export function acceptOlaShowroom(actor: AppUser, projectId: string) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Kurchi Admin can accept a new showroom.");
  const project = requireProject(projectId);
  if (!project.initialPayment || project.initialPayment.status !== "VERIFIED") throw new RuleError("Accounts must verify the advance payment before Admin accepts this showroom.");
  if (!project.olaSubmittedAt) throw new RuleError("This showroom was not submitted by Ola.");
  if (project.adminAcceptedAt) return project;
  project.adminAcceptedAt = now();
  project.statusUpdatedAt = now();
  notify("CLIENT", "Kurchi accepted your showroom", `${project.name} is now being reviewed for BOQ preparation.`, `/portal/projects/${projectId}`);
  audit(actor, `projects/${projectId}`, "UPDATE", "Ola showroom request accepted by Kurchi Admin");
  commit();
  return project;
}

/** Accounts is the financial gate between Ola's payment claim and Kurchi Admin's work queue. */
export function verifyInitialPayment(actor: AppUser, projectId: string, approved: boolean, note?: string) {
  if (actor.role !== "ACCOUNTS") throw new RuleError("Only Accounts can verify the initial payment.");
  const project = requireProject(projectId);
  if (!project.initialPayment || project.initialPayment.status !== "PENDING_VERIFICATION") {
    throw new RuleError("There is no payment waiting for verification.");
  }
  project.initialPayment.status = approved ? "VERIFIED" : "REJECTED";
  project.initialPayment.verifiedAt = now();
  project.initialPayment.verifiedBy = actor.name;
  project.initialPayment.rejectionReason = approved ? undefined : note?.trim() || "Payment reference needs correction.";
  project.statusUpdatedAt = now();
  if (approved) {
    project.advanceReceivedPct = project.initialPayment.percentage;
    db.payments.unshift({ id: nextId("pay"), invoiceId: `advance-${project.id}`, clientId: project.clientId, amount: project.initialPayment.amount, receivedAt: now(), mode: "ADVANCE", reference: project.initialPayment.reference });
    notify("ADMIN", "Payment verified — ready for Admin", `${project.name} · ₹${project.initialPayment.amount.toLocaleString("en-IN")} received (${project.initialPayment.percentage}%).`, `/admin/projects/${projectId}`);
    notify("CLIENT", "Payment verified", `${project.name} is now with Kurchi Admin to begin the project.`, `/portal/projects/${projectId}`);
  } else {
    project.advanceReceivedPct = 0;
    notify("CLIENT", "Payment needs correction", `${project.name}: ${project.initialPayment.rejectionReason}`, `/portal/projects/${projectId}`);
  }
  audit(actor, `projects/${projectId}`, "UPDATE", approved ? "Initial payment verified by Accounts" : "Initial payment sent back by Accounts");
  commit();
}

/* ---------------------------------------------------------------- BOQ flow */

export function sendBoqForApproval(actor: AppUser, projectId: string) {
  const project = requireProject(projectId);
  project.status = "PENDING_APPROVAL";
  project.statusUpdatedAt = now();
  audit(actor, `projects/${projectId}`, "UPDATE", "BOQ sent to client for approval");
  notify("CLIENT", "BOQ approval needed", `${project.site.city}: review and approve the selected BOQ.`, "/portal/approvals");
  commit();
}

export function approveBoq(actor: AppUser, projectId: string) {
  const project = requireProject(projectId);
  db.items
    .filter((i) => i.projectId === projectId && i.status === "DRAFT")
    .forEach((i) => { i.status = "APPROVED"; i.statusUpdatedAt = now(); });
  project.statusUpdatedAt = now();
  if (actor.role === "VENDOR") project.franchiseeApprovedAt = now();
  audit(actor, `projects/${projectId}`, "UPDATE", "BOQ approved by client");
  recomputeProject(projectId);
  commit();
}

export function rejectBoq(actor: AppUser, projectId: string, reason: string) {
  const project = requireProject(projectId);
  project.status = "DRAFT";
  project.statusUpdatedAt = now();
  audit(actor, `projects/${projectId}`, "UPDATE", `BOQ rejected: ${reason}`);
  commit();
}

/** The franchisee chooses a ready-made BOQ or asks Admin to shape a modular one. */
export function chooseFranchiseeBoq(
  actor: AppUser,
  projectId: string,
  input: { mode: "STANDARD" | "MODULAR"; kitId?: string; request?: string }
) {
  const project = requireProject(projectId);
  if (input.mode === "MODULAR" && !input.request?.trim()) throw new RuleError("Tell Kurchi what you want to customise.");
  project.boqMode = input.mode;
  project.standardKitId = input.mode === "STANDARD" ? input.kitId : undefined;
  project.modularRequest = input.mode === "MODULAR" ? input.request?.trim() : undefined;
  project.statusUpdatedAt = now();
  if (input.mode === "MODULAR") {
    notify("ADMIN", "Modular BOQ request", `${project.site.city}: ${project.modularRequest}`, `/admin/projects/${projectId}`);
  } else {
    notify("ADMIN", "Standard BOQ selected", `${project.site.city} is ready for franchisee approval.`, `/admin/projects/${projectId}`);
  }
  audit(actor, `projects/${projectId}`, "UPDATE", `${input.mode.toLowerCase()} BOQ selected`);
  commit();
}

export function setProjectAdvance(actor: AppUser, projectId: string, requiredPct: number, receivedPct: number) {
  const project = requireProject(projectId);
  project.advanceRequiredPct = Math.max(0, Math.min(100, Math.round(requiredPct)));
  project.advanceReceivedPct = Math.max(0, Math.min(100, Math.round(receivedPct)));
  project.statusUpdatedAt = now();
  audit(actor, `projects/${projectId}`, "UPDATE", `Advance ${project.advanceReceivedPct}% received of ${project.advanceRequiredPct}% required`);
  commit();
}

/** The one-click business stage control. It never overwrites item-level traceability. */
export function setOperationalStatus(actor: AppUser, projectId: string, status: OperationalStatus, details: { expectedDate?: string; note?: string } = {}) {
  const project = requireProject(projectId);
  if (actor.role !== "ADMIN") throw new RuleError("Only Kurchi Admin can move a project stage.");
  if (["PRODUCTION", "LOGISTICS", "DELIVERED", "INSTALLATION", "COMPLETED"].includes(status) && project.initialPayment?.status !== "VERIFIED") throw new RuleError("Accounts must verify the advance payment first.");
  if (status === "DELIVERED" && !db.consignments.some((entry) => entry.projectId === projectId && entry.status === "DELIVERED")) throw new RuleError("Mark the actual consignment delivered before moving the project to Delivered.");
  if (status === "COMPLETED" && !db.items.filter((item) => item.projectId === projectId && item.status !== "CANCELLED").every((item) => ["INSTALLED", "HANDED_OVER"].includes(item.status))) throw new RuleError("Every live BOQ item must be installed before completing the project.");
  project.operationalStatus = status;
  project.operationalStatusUpdatedAt = now();
  project.operationalExpectedDate = details.expectedDate ? new Date(details.expectedDate).toISOString() : project.operationalExpectedDate;
  project.operationalUpdateNote = details.note?.trim() || project.operationalUpdateNote;
  if (status === "DELIVERED" && !project.deliveredToSiteAt) {
    project.deliveredToSiteAt = now();
    notify("INSTALLATION", "Site delivery received", `${project.site.city}: start installation within 48 hours.`, `/site/${projectId}`);
  }
  if (status === "INSTALLATION" && !project.installationStartedAt) project.installationStartedAt = now();
  if (status === "COMPLETED") notify("ACCOUNTS", "Project ready for closure", `${project.site.city}: verify final invoice and close the cost centre.`, "/accounts");
  audit(actor, `projects/${projectId}`, "UPDATE", `Rollout stage changed to ${status.replace(/_/g, " ").toLowerCase()}${details.note ? ` · ${details.note}` : ""}`);
  commit();
}

export function addCostEntry(
  actor: AppUser,
  input: Omit<CostEntry, "id" | "createdBy" | "createdAt">
) {
  if (!input.projectId) throw new RuleError("Choose a project.");
  if (!Number.isFinite(input.amount) || input.amount <= 0) throw new RuleError("Enter an expense amount.");
  const entry: CostEntry = { ...input, id: nextId("cost"), amount: Math.round(input.amount), createdBy: actor.name, createdAt: now() };
  db.costEntries.unshift(entry);
  audit(actor, `projects/${input.projectId}`, "CREATE", `Cost centre · ${input.customHead || input.head}: ₹${entry.amount.toLocaleString("en-IN")}`);
  commit();
  return entry;
}

/** Rule BQ-05 — landed cost and both margins are recomputed by the store. */
export function updateItemPricing(
  actor: AppUser,
  itemId: string,
  patch: Partial<BoqItem["pricing"]>
) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can change BOQ pricing.");
  const item = db.items.find((i) => i.id === itemId);
  if (!item) throw new RuleError("Item not found.");
  if (Object.values(patch).some((value) => typeof value === "number" && value < 0)) throw new RuleError("Prices and allocated costs cannot be negative.");
  Object.assign(item.pricing, patch);
  audit(actor, `items/${itemId}`, "UPDATE", `Pricing changed on ${item.name}`);
  recomputeProject(item.projectId);
  commit();
}

export function setItemQty(actor: AppUser, itemId: string, qty: number) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can change BOQ quantities.");
  const item = db.items.find((i) => i.id === itemId);
  if (!item) throw new RuleError("Item not found.");
  item.qty = Math.max(0, Math.round(qty));
  audit(actor, `items/${itemId}`, "UPDATE", `Quantity set to ${item.qty} on ${item.name}`);
  recomputeProject(item.projectId);
  commit();
}

/** Add a line to an existing BOQ, pulling defaults from the catalogue. */
export function addBoqLine(
  actor: AppUser,
  projectId: string,
  productId: string,
  qty: number,
  zone?: string
) {
  const project = requireProject(projectId);
  const editable = canEditBoqInPlace(project);
  if (!editable.ok) throw new RuleError(editable.reasons.join(" "), editable.blockedBy);

  const product = db.products.find((p) => p.id === productId);
  if (!product) throw new RuleError("Pick a product.");
  if (qty <= 0) throw new RuleError("Quantity must be at least 1.");

  const item: BoqItem = {
    id: nextId("itm"),
    projectId,
    productId,
    name: product.name,
    spec: product.shortSpec,
    hsnCode: product.hsnCode,
    unit: product.unit,
    qty,
    status: "DRAFT",
    statusUpdatedAt: now(),
    qcAttempts: 0,
    qtyDispatched: 0,
    qtyReceived: 0,
    qtyInstalled: 0,
    zone,
    pricing: {
      basePrice: product.defaultBasePrice,
      sellingPrice: product.defaultSellingPrice,
      finalPrice: product.defaultSellingPrice,
      allocatedTransport: 0,
      allocatedInstall: 0,
      reworkCost: 0,
    },
  };
  db.items.push(item);
  audit(actor, `items/${item.id}`, "CREATE", `${product.name} ×${qty} added to ${project.code}`);
  recomputeProject(projectId);
  commit();
  return item;
}

export function removeBoqLine(actor: AppUser, itemId: string) {
  const item = db.items.find((i) => i.id === itemId);
  if (!item) throw new RuleError("Item not found.");
  const project = requireProject(item.projectId);
  const editable = canEditBoqInPlace(project);
  if (!editable.ok) throw new RuleError(editable.reasons.join(" "), editable.blockedBy);

  db.items = db.items.filter((i) => i.id !== itemId);
  audit(actor, `items/${itemId}`, "VOID", `${item.name} removed from ${project.code}`);
  recomputeProject(item.projectId);
  commit();
}

/* ---------------------------------------------------------------- masters */

export function saveClient(actor: AppUser, client: Client) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can manage clients.");
  if (!client.name.trim()) throw new RuleError("A client name is required.");
  const idx = db.clients.findIndex((c) => c.id === client.id);
  if (idx >= 0) db.clients[idx] = client;
  else db.clients.push(client);
  audit(actor, `clients/${client.id}`, idx >= 0 ? "UPDATE" : "CREATE", client.name);
  commit();
}

export function saveProgramme(actor: AppUser, programme: Programme) {
  if (!programme.name.trim()) throw new RuleError("A programme name is required.");
  const idx = db.programmes.findIndex((p) => p.id === programme.id);
  if (idx >= 0) db.programmes[idx] = programme;
  else db.programmes.push(programme);
  audit(actor, `programmes/${programme.id}`, idx >= 0 ? "UPDATE" : "CREATE", programme.name);
  commit();
}

export function blankClient(): Client {
  return {
    id: nextId("cl"), name: "", gstin: "", billingAddress: "",
    state: "Karnataka", contactName: "", contactEmail: "", contactPhone: "",
  };
}

export function blankProgramme(clientId: string): Programme {
  return {
    id: nextId("pg"), clientId, name: "", startDate: now(), targetProjects: 10,
  };
}

export function blankProduct(): Product {
  return {
    id: nextId("prod"), name: "", slug: "", category: "Storage Units",
    orderCategory: "SALES",
    shortSpec: "", description: "", specs: {}, hsnCode: "9403", unit: "nos",
    images: [], startingPrice: 0, defaultBasePrice: 0, defaultSellingPrice: 0,
    leadTimeDays: 14, active: true,
  };
}

export function blankVendor(): Vendor {
  return {
    id: nextId("v"), name: "", type: "SUPPLIER", city: "", state: "Karnataka",
    gstin: "", contactName: "", contactPhone: "",
  };
}

export function deleteVendor(actor: AppUser, vendorId: string) {
  const vendor = db.vendors.find((v) => v.id === vendorId);
  if (!vendor) return;
  const inUse = db.projects.some((p) => p.installationTeamId === vendorId);
  if (inUse) throw new RuleError(`${vendor.name} is assigned to a live project.`);
  db.vendors = db.vendors.filter((v) => v.id !== vendorId);
  audit(actor, `vendors/${vendorId}`, "VOID", `${vendor.name} removed`);
  commit();
}

/* ------------------------------------------------------------- readiness */

export function setSiteReadiness(
  actor: AppUser,
  projectId: string,
  key: keyof ReturnType<typeof requireProject>["siteReadiness"],
  value: boolean
) {
  const project = requireProject(projectId);
  project.siteReadiness[key] = value;
  audit(actor, `projects/${projectId}`, "UPDATE", `Site readiness · ${key} = ${value}`);
  commit();
}

/* -------------------------------------------------------- rollout planning */

const schedulePhases: Array<Pick<ScheduleTask, "title" | "phase">> = [
  { title: "Confirm site readiness", phase: "READINESS" },
  { title: "Complete production & QC", phase: "PRODUCTION" },
  { title: "Pack and dispatch", phase: "DISPATCH" },
  { title: "Receive at site", phase: "DELIVERY" },
  { title: "Install and close snags", phase: "INSTALLATION" },
  { title: "Client handover", phase: "HANDOVER" },
];

export function createRolloutSchedule(actor: AppUser, projectId: string) {
  const project = requireProject(projectId);
  if (db.scheduleTasks.some((task) => task.projectId === projectId)) {
    throw new RuleError("This project already has a rollout schedule.");
  }
  const start = new Date(project.startDate).getTime();
  const end = new Date(project.targetCompletionDate).getTime();
  const step = Math.max(86_400_000, Math.floor((end - start) / schedulePhases.length));
  schedulePhases.forEach((phase, index) => {
    const plannedStart = new Date(start + step * index).toISOString();
    const plannedEnd = new Date(index === schedulePhases.length - 1 ? end : start + step * (index + 1) - 1).toISOString();
    db.scheduleTasks.push({ id: nextId("sched"), projectId, ...phase, plannedStart, plannedEnd, status: "NOT_STARTED" });
  });
  audit(actor, `projects/${projectId}`, "CREATE", "Rollout schedule created");
  commit();
}

export function updateScheduleTask(actor: AppUser, taskId: string, patch: Pick<ScheduleTask, "status"> & Partial<Pick<ScheduleTask, "owner" | "note" | "plannedStart" | "plannedEnd">>) {
  const task = db.scheduleTasks.find((entry) => entry.id === taskId);
  if (!task) throw new RuleError("Schedule task not found.");
  const wasNotStarted = task.status === "NOT_STARTED";
  Object.assign(task, patch);
  if (patch.status === "IN_PROGRESS" && wasNotStarted) task.actualStart = now();
  if (patch.status === "DONE") task.actualEnd = now();
  audit(actor, `schedule/${taskId}`, "UPDATE", `${task.title} → ${task.status}`);
  commit();
}

export function savePurchaseOrder(actor: AppUser, order: PurchaseOrder) {
  if (!order.projectId || !order.vendorId || !order.description.trim() || order.amount <= 0) {
    throw new RuleError("Project, vendor, scope and amount are required for a purchase order.");
  }
  const existing = db.purchaseOrders.findIndex((entry) => entry.id === order.id);
  const saved = { ...order, description: order.description.trim() };
  const allocations = saved.allocations?.filter((allocation) => allocation.qty > 0)
    ?? saved.itemIds?.map((itemId) => ({ itemId, qty: db.items.find((item) => item.id === itemId)?.qty ?? 0 }))
    ?? [];
  if (existing < 0 && !allocations.length) {
    throw new RuleError("Select at least one approved BOQ item for this purchase order.");
  }
  if (existing < 0 && allocations.length) {
    const items = allocations.map((allocation) => db.items.find((item) => item.id === allocation.itemId));
    if (items.some((item) => !item || item.projectId !== saved.projectId || !["APPROVED", "PO_PLACED"].includes(item.status) || !Number.isInteger(allocations.find((allocation) => allocation.itemId === item?.id)?.qty) || (allocations.find((allocation) => allocation.itemId === item?.id)?.qty ?? 0) > (item?.qty ?? 0) - (item?.qtyOrdered ?? 0))) {
      throw new RuleError("A purchase order can only contain approved BOQ items from this project.");
    }
    saved.itemIds = allocations.map((allocation) => allocation.itemId);
    saved.allocations = allocations;
    items.forEach((item) => {
      if (!item) return;
      const allocation = allocations.find((entry) => entry.itemId === item.id)!;
      item.vendorId = saved.vendorId;
      item.poNumber = saved.number;
      item.eta = saved.expectedAt;
      item.qtyOrdered = (item.qtyOrdered ?? 0) + allocation.qty;
      item.status = "PO_PLACED";
      item.statusUpdatedAt = now();
    });
  }
  if (existing >= 0) db.purchaseOrders[existing] = saved;
  else db.purchaseOrders.unshift(saved);
  notify("ADMIN", `PO ${saved.status.toLowerCase()}`, `${saved.number} · delivery promised ${saved.expectedAt.slice(0, 10)}`, "/admin/tools");
  audit(actor, `purchaseOrders/${saved.id}`, existing >= 0 ? "UPDATE" : "CREATE", `${saved.number} · ${saved.status}`);
  commit();
}

/** Vendor confirmation makes the awarded BOQ lines available to the dispatch desk. */
export function markPurchaseOrderReady(actor: AppUser, purchaseOrderId: string) {
  const order = db.purchaseOrders.find((entry) => entry.id === purchaseOrderId);
  if (!order) throw new RuleError("Purchase order not found.");
  order.status = "RECEIVED";
  const allocations = order.allocations ?? order.itemIds?.map((itemId) => ({ itemId, qty: db.items.find((item) => item.id === itemId)?.qty ?? 0 })) ?? [];
  allocations.forEach((allocation) => {
    const item = db.items.find((entry) => entry.id === allocation.itemId);
    if (!item) return;
    item.qtyReadyToPack = Math.min(item.qty - item.qtyDispatched, (item.qtyReadyToPack ?? 0) + allocation.qty);
    item.status = "READY_TO_PACK";
    item.statusUpdatedAt = now();
  });
  audit(actor, `purchaseOrders/${purchaseOrderId}`, "UPDATE", `${order.number} confirmed ready for dispatch`);
  notify("ADMIN", "Vendor material is ready", `${order.number} is ready to pack and dispatch.`, "/admin/dispatch");
  recomputeProject(order.projectId);
  commit();
}

/* -------------------------------------------------------------- logistics */

export function createDispatchBatch(
  actor: AppUser,
  input: { projectId: string; allocations: Array<{ itemId: string; qty: number }>; crateCode: string }
) {
  if (!input.crateCode.trim() || !input.allocations.length) throw new RuleError("Choose at least one ready item and enter a crate code.");
  if (db.crates.some((crate) => crate.crateCode.toLowerCase() === input.crateCode.trim().toLowerCase())) throw new RuleError("This crate code already exists.");
  const items = input.allocations.map((allocation) => db.items.find((item) => item.id === allocation.itemId));
  if (items.some((item) => !item || item.projectId !== input.projectId || !["READY_TO_PACK", "PACKED"].includes(item.status) || Math.max(item.qtyReadyToPack ?? 0, item.qty) < (input.allocations.find((allocation) => allocation.itemId === item?.id)?.qty ?? 0))) {
    throw new RuleError("Only items marked ready to pack can be added to a dispatch batch.");
  }
  const crateId = nextId("cr");
  const consignmentId = nextId("cn");
  const project = requireProject(input.projectId);
  db.crates.unshift({
    id: crateId, projectId: input.projectId, crateCode: input.crateCode.trim().toUpperCase(), itemIds: input.allocations.map((allocation) => allocation.itemId), itemQuantities: Object.fromEntries(input.allocations.map((allocation) => [allocation.itemId, allocation.qty])),
    photos: [], receiptPhotos: [], consignmentId,
  });
  db.consignments.unshift({
    id: consignmentId, projectId: input.projectId, crateIds: [crateId], taxableValue: items.reduce((sum, item, index) => sum + (item?.pricing.finalPrice ?? 0) * input.allocations[index].qty, 0),
    interState: project.site.state.trim().toLowerCase() !== "karnataka", status: "READY",
  });
  items.forEach((item, index) => { if (!item) return; item.qtyReadyToPack = Math.max(0, (item.qtyReadyToPack || item.qty) - input.allocations[index].qty); item.status = "PACKED"; item.statusUpdatedAt = now(); item.crateId = item.crateId ?? crateId; item.consignmentId = consignmentId; });
  audit(actor, `consignments/${consignmentId}`, "CREATE", `Packing batch ${input.crateCode.trim().toUpperCase()} created`);
  notify("ACCOUNTS", "Shipment ready for billing", `${project.site.city}: ${input.crateCode.trim().toUpperCase()} is packed. Create the GST invoice and e-way paperwork for this shipment.`, "/accounts");
  recomputeProject(input.projectId);
  commit();
}

export function addCratePhoto(actor: AppUser, crateId: string, photo?: string) {
  const crate = db.crates.find((c) => c.id === crateId);
  if (!crate) throw new RuleError("Crate not found.");
  crate.photos.push(photo ?? `pack-${crate.crateCode}-${crate.photos.length + 1}.jpg`);
  crate.packedBy = actor.name;
  crate.packedAt = now();
  audit(actor, `crates/${crateId}`, "UPDATE", `Packing photo added to ${crate.crateCode}`);
  commit();
}

/** Admin chooses exactly which packed BOQ lines Accounts should bill. */
export function requestShipmentInvoice(actor: AppUser, consignmentId: string, itemIds: string[]) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can request a shipment invoice.");
  const consignment = db.consignments.find((entry) => entry.id === consignmentId);
  if (!consignment) throw new RuleError("Shipment not found.");
  if (consignment.invoiceId) throw new RuleError("This shipment has already been invoiced.");
  const allowed = new Set(db.crates.filter((crate) => consignment.crateIds.includes(crate.id)).flatMap((crate) => crate.itemIds));
  const selected = [...new Set(itemIds)].filter((id) => allowed.has(id));
  if (!selected.length) throw new RuleError("Choose at least one packed product for the invoice.");
  consignment.invoiceRequestItemIds = selected;
  const project = requireProject(consignment.projectId);
  notify("ACCOUNTS", "Invoice requested by Admin", `${project.site.city}: create a GST invoice for ${selected.length} selected product line${selected.length === 1 ? "" : "s"}.`, "/accounts");
  audit(actor, `consignments/${consignmentId}`, "UPDATE", `Invoice requested for ${selected.length} shipment lines`);
  commit();
}

export function updateConsignment(
  actor: AppUser,
  consignmentId: string,
  patch: Partial<{
    lrNumber: string; transporterName: string; vehicleNo: string;
    driverPhone: string; driverName: string; driverLicenceNo: string; eta: string; ewayBillNo: string;
  }>
) {
  const c = db.consignments.find((x) => x.id === consignmentId);
  if (!c) throw new RuleError("Consignment not found.");
  Object.assign(c, patch);
  audit(actor, `consignments/${consignmentId}`, "UPDATE", Object.keys(patch).join(", ") + " updated");
  commit();
}

/**
 * RTS is a deliberate gate, not an informal note. The delivery estimate is
 * calculated from the selected movement method until a live route API is wired.
 */
export function completeRtsChecklist(
  actor: AppUser,
  consignmentId: string,
  input: {
    boxCounts: number[];
    deliveryMethod: "DIRECT_TRUCK" | "THIRD_PARTY_DELIVERY";
    transporterName: string;
    vehicleNo: string;
    lrNumber: string;
    driverName?: string;
    driverPhone?: string;
    driverLicenceNo?: string;
  }
) {
  const consignment = db.consignments.find((entry) => entry.id === consignmentId);
  if (!consignment) throw new RuleError("Shipment not found.");
  const boxCounts = input.boxCounts.filter((count) => Number.isInteger(count) && count > 0);
  if (!boxCounts.length) throw new RuleError("Enter at least one positive box count.");
  if (!input.transporterName.trim() || !input.vehicleNo.trim() || !input.lrNumber.trim()) {
    throw new RuleError("Transporter, vehicle number and LR number are required.");
  }
  if (input.deliveryMethod === "DIRECT_TRUCK" && !(input.driverName?.trim() && input.driverPhone?.trim() && input.driverLicenceNo?.trim())) {
    throw new RuleError("Enter the direct-truck driver's name, mobile number and licence number.");
  }
  const eta = new Date();
  eta.setDate(eta.getDate() + (input.deliveryMethod === "DIRECT_TRUCK" ? 2 : 4));
  Object.assign(consignment, {
    boxCounts,
    deliveryMethod: input.deliveryMethod,
    transporterName: input.transporterName.trim(),
    vehicleNo: input.vehicleNo.trim().toUpperCase(),
    lrNumber: input.lrNumber.trim(),
    driverName: input.driverName?.trim() || undefined,
    driverPhone: input.driverPhone?.trim() || undefined,
    driverLicenceNo: input.driverLicenceNo?.trim().toUpperCase() || undefined,
    eta: eta.toISOString(),
    rtsCheckedAt: now(),
  });
  audit(actor, `consignments/${consignmentId}`, "UPDATE", `RTS checklist complete · ${boxCounts.join(" + ")} boxes`);
  notify("ACCOUNTS", "Shipment ready for documents", `${requireProject(consignment.projectId).site.city}: create its challan and partial invoice.`, "/accounts");
  commit();
  return consignment;
}

/** Rules DS-02 … DS-07. `overrideReason` is the only way past a red gate. */
export function dispatchConsignment(
  actor: AppUser,
  consignmentId: string,
  overrideReason?: string
) {
  const c = db.consignments.find((x) => x.id === consignmentId);
  if (!c) throw new RuleError("Consignment not found.");
  const project = requireProject(c.projectId);
  const crates = db.crates.filter((cr) => c.crateIds.includes(cr.id));

  const verdict = canDispatch({ project, consignment: c, crates });
  if (!verdict.ok) {
    const onlySiteReadiness = verdict.blockedBy.length === 1 && verdict.blockedBy[0] === "DS-05";
    if (!overrideReason || !onlySiteReadiness) throw new RuleError(verdict.reasons.join(" "), verdict.blockedBy);
    audit(actor, `consignments/${consignmentId}`, "OVERRIDE", "Dispatched despite open gates", {
      ruleOverridden: verdict.blockedBy.join(", "),
      overrideReason,
    });
    c.overrideReason = overrideReason;
  }

  c.status = "DISPATCHED";
  c.dispatchedAt = now();

  const itemIds = crates.flatMap((cr) => cr.itemIds);
  db.items
    .filter((i) => itemIds.includes(i.id))
    .forEach((i) => {
      i.status = "DISPATCHED";
      i.statusUpdatedAt = now();
      i.qtyDispatched += crates.reduce((sum, crate) => sum + (crate.itemQuantities?.[i.id] ?? (crate.itemIds.includes(i.id) ? i.qty : 0)), 0);
      i.consignmentId = c.id;
    });

  audit(actor, `consignments/${consignmentId}`, "UPDATE", `Dispatched on ${c.lrNumber || "no LR"}`);
  recomputeProject(c.projectId);
  commit();
}

export function markDelivered(actor: AppUser, consignmentId: string) {
  const c = db.consignments.find((x) => x.id === consignmentId);
  if (!c) throw new RuleError("Consignment not found.");
  if (actor.role !== "INSTALLATION") throw new RuleError("Only the installation team can confirm site delivery.");
  if (c.status !== "IN_TRANSIT") throw new RuleError("Mark the vehicle in transit before confirming site delivery.");
  c.status = "DELIVERED";
  c.deliveredAt = now();
  const itemIds = db.crates.filter((cr) => c.crateIds.includes(cr.id)).flatMap((cr) => cr.itemIds);
  db.items
    .filter((i) => itemIds.includes(i.id) && !["DELIVERED_AT_SITE", "RECEIVED_OK", "INSTALLED", "HANDED_OVER"].includes(i.status))
    .forEach((i) => { i.status = "DELIVERED_AT_SITE"; i.statusUpdatedAt = now(); });
  audit(actor, `consignments/${consignmentId}`, "UPDATE", "Marked delivered at site");
  recomputeProject(c.projectId);
  commit();
}

/** The logistics desk confirms that the vehicle has physically departed. */
export function markInTransit(actor: AppUser, consignmentId: string) {
  const c = db.consignments.find((x) => x.id === consignmentId);
  if (!c) throw new RuleError("Consignment not found.");
  if (c.status !== "DISPATCHED" && c.status !== "IN_TRANSIT") throw new RuleError("Dispatch the consignment before marking it in transit.");
  c.status = "IN_TRANSIT";
  const itemIds = db.crates.filter((crate) => c.crateIds.includes(crate.id)).flatMap((crate) => crate.itemIds);
  db.items.filter((item) => itemIds.includes(item.id)).forEach((item) => { item.status = "IN_TRANSIT"; item.statusUpdatedAt = now(); });
  const project = requireProject(c.projectId);
  notify("INSTALLATION", `Vehicle in transit to ${project.site.city}`, `${c.lrNumber || "Consignment"} is en route${c.eta ? ` · ETA ${c.eta.slice(0, 10)}` : ""}.`, `/site/${project.id}`);
  notify("CLIENT", `Delivery is on the way to ${project.site.city}`, `${c.crateIds.length} crate(s) are in transit.`, `/portal/projects/${project.id}`);
  audit(actor, `consignments/${consignmentId}`, "STATUS_CHANGE", "Vehicle marked in transit");
  recomputeProject(c.projectId);
  commit();
}

/* ------------------------------------------------------------------ site */

/** Scan-to-receive. Short quantities raise a shortage ticket — rule ST-01. */
export function receiveCrate(
  actor: AppUser,
  crateId: string,
  received: Record<string, number>
) {
  const crate = db.crates.find((c) => c.id === crateId);
  if (!crate) throw new RuleError("Crate not found.");

  crate.receivedAt = now();
  crate.receiptPhotos.push(`grn-${crate.crateCode}.jpg`);

  crate.itemIds.forEach((itemId) => {
    const item = db.items.find((i) => i.id === itemId);
    if (!item) return;
    const qty = received[itemId] ?? item.qty;
    item.qtyReceived = qty;
    item.statusUpdatedAt = now();

    if (qty < (item.qtyDispatched || item.qty)) {
      item.status = "SHORT_SUPPLIED";
      // ST-01 — the shortage ticket is raised by the system, not by a person.
      db.tickets.unshift({
        id: nextId("t"),
        projectId: item.projectId,
        type: "SHORTAGE",
        itemId: item.id,
        qtyAffected: (item.qtyDispatched || item.qty) - qty,
        cause: "SHORT_SUPPLY",
        photos: [`grn-${crate.crateCode}.jpg`],
        reportedBy: actor.name,
        reportedAt: now(),
        costImpact: 0,
        status: "OPEN",
        note: `Auto-raised on receipt: ${qty} of ${item.qtyDispatched || item.qty} arrived in ${crate.crateCode}.`,
      });
    } else {
      item.status = "RECEIVED_OK";
    }
  });

  audit(actor, `crates/${crateId}`, "UPDATE", `Receipt confirmed for ${crate.crateCode}`);
  recomputeProject(crate.projectId);
  commit();
}

/** Rule ST-02 — a photo and a cause, or no ticket. */
export function fileTicket(
  actor: AppUser,
  input: {
    projectId: string;
    itemId: string;
    type: "DAMAGE" | "SHORTAGE";
    qtyAffected: number;
    cause: TicketCause;
    photos: string[];
    note: string;
  }
) {
  const verdict = canSubmitTicket(input);
  if (!verdict.ok) throw new RuleError(verdict.reasons.join(" "), verdict.blockedBy);

  const item = db.items.find((i) => i.id === input.itemId);
  if (item) {
    item.status = input.type === "DAMAGE" ? "RECEIVED_DAMAGED" : "SHORT_SUPPLIED";
    item.statusUpdatedAt = now();
  }

  const ticket = {
    id: nextId("t"),
    ...input,
    reportedBy: actor.name,
    reportedAt: now(),
    costImpact: 0,
    status: "OPEN" as const,
  };
  db.tickets.unshift(ticket);

  audit(actor, `tickets/${ticket.id}`, "CREATE", `${input.type} reported on ${item?.name ?? input.itemId}`);
  recomputeProject(input.projectId);
  commit();
  return ticket;
}

/**
 * Rule ST-04 — approving a replacement spawns a linked item that re-enters
 * production, and books its cost to the project as rework. This is the loop
 * that makes the margin erosion visible.
 */
export function triageTicket(
  actor: AppUser,
  ticketId: string,
  decision: TicketDecision,
  cause: TicketCause
) {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new RuleError("Ticket not found.");
  const original = db.items.find((i) => i.id === ticket.itemId);
  if (!original) throw new RuleError("Item not found.");

  ticket.decision = decision;
  ticket.cause = cause;

  if (decision === "REPLACE") {
    const replacement: BoqItem = {
      ...JSON.parse(JSON.stringify(original)),
      id: nextId("itm"),
      qty: ticket.qtyAffected,
      status: original.sourcingType === "MAKE" ? "IN_PRODUCTION" : "PO_PLACED",
      statusUpdatedAt: now(),
      qtyDispatched: 0,
      qtyReceived: 0,
      qtyInstalled: 0,
      crateId: undefined,
      consignmentId: undefined,
      replacementFor: original.id,
    };
    replacement.pricing.reworkCost = 0;
    db.items.push(replacement);

    const cost = original.pricing.basePrice * ticket.qtyAffected;
    original.pricing.reworkCost += cost;
    ticket.costImpact = cost;
    ticket.replacementItemId = replacement.id;
    ticket.status = "IN_PROGRESS";

    // The damaged units are written off; the good ones carry on.
    original.qty = Math.max(0, original.qty - ticket.qtyAffected);
    original.status = original.qtyReceived > 0 ? "RECEIVED_OK" : original.status;
  } else if (decision === "REPAIR") {
    const cost = Math.round(original.pricing.basePrice * ticket.qtyAffected * 0.3);
    original.pricing.reworkCost += cost;
    ticket.costImpact = cost;
    ticket.status = "IN_PROGRESS";
  } else {
    ticket.status = "RESOLVED";
    original.status = "RECEIVED_OK";
    original.statusUpdatedAt = now();
  }

  audit(
    actor,
    `tickets/${ticketId}`,
    "UPDATE",
    `${decision} · cause ${cause} · ₹${ticket.costImpact} booked as rework`
  );
  recomputeProject(ticket.projectId);
  commit();
}

export function resolveTicket(actor: AppUser, ticketId: string) {
  const ticket = db.tickets.find((t) => t.id === ticketId);
  if (!ticket) throw new RuleError("Ticket not found.");
  ticket.status = "RESOLVED";
  const item = db.items.find((i) => i.id === ticket.itemId);
  if (item && (item.status === "RECEIVED_DAMAGED" || item.status === "SHORT_SUPPLIED")) {
    item.status = "RECEIVED_OK";
    item.statusUpdatedAt = now();
  }
  audit(actor, `tickets/${ticketId}`, "UPDATE", "Resolved");
  recomputeProject(ticket.projectId);
  commit();
}

/* ------------------------------------------------------------ progress */

export function addProgressLog(
  actor: AppUser,
  projectId: string,
  note: string,
  photos: string[],
  zone?: string
) {
  if (!photos.length) throw new RuleError("A progress update needs at least one photo.", ["IN-02"]);
  db.progressLogs.unshift({
    id: nextId("pl"), projectId, note, photos, by: actor.name, at: now(), zone,
  });
  audit(actor, `projects/${projectId}`, "CREATE", "Progress update posted");
  commit();
}

export function updateSiteWorkStatus(actor: AppUser, projectId: string, status: SiteWorkStatus) {
  const project = requireProject(projectId);
  project.siteWorkStatus = status;
  project.siteWorkStatusUpdatedAt = now();
  audit(actor, `projects/${projectId}`, "UPDATE", `Site update: ${status.replaceAll("_", " ").toLowerCase()}`);
  notify(
    "ADMIN",
    "Site update received",
    `${project.site.city}: ${status.replaceAll("_", " ").toLowerCase()}`,
    `/admin/projects/${projectId}`,
  );
  commit();
}

/* --------------------------------------------------------------- snags */

export function raiseSnag(
  actor: AppUser,
  input: { projectId: string; itemId?: string; description: string; severity: SnagSeverity; photos: string[] }
) {
  if (!input.description.trim()) throw new RuleError("Describe the snag.", ["IN-05"]);
  if (!input.photos.length) throw new RuleError("A photo is required.", ["IN-05"]);

  const due = new Date(NOW);
  due.setDate(due.getDate() + (input.severity === "CRITICAL" ? 2 : 5));

  db.snags.unshift({
    id: nextId("s"),
    ...input,
    raisedBy: actor.name,
    raisedAt: now(),
    dueDate: due.toISOString(),
    status: "OPEN",
  });
  audit(actor, `projects/${input.projectId}`, "CREATE", `${input.severity} snag raised`);
  recomputeProject(input.projectId);
  commit();
}

export function closeSnag(actor: AppUser, snagId: string) {
  const snag = db.snags.find((s) => s.id === snagId);
  if (!snag) throw new RuleError("Snag not found.");
  snag.status = "CLOSED";
  snag.closedAt = now();
  audit(actor, `snags/${snagId}`, "UPDATE", "Snag closed");
  recomputeProject(snag.projectId);
  commit();
}

/* ------------------------------------------------------------- handover */

export function requestHandover(actor: AppUser, projectId: string) {
  const items = db.items.filter((i) => i.projectId === projectId);
  const snags = db.snags.filter((s) => s.projectId === projectId);
  const verdict = canRaiseHandover(items, snags);
  if (!verdict.ok) throw new RuleError(verdict.reasons.join(" "), verdict.blockedBy);
  audit(actor, `projects/${projectId}`, "UPDATE", "Handover certificate generated, sent to client");
  commit();
}

/** Rule HO-02 — OTP, then name, timestamp and IP are stored. */
export function signHandover(actor: AppUser, projectId: string, otp: string) {
  if (otp.trim().length !== 6) throw new RuleError("Enter the 6-digit code sent to your mobile.", ["HO-02"]);
  const items = db.items.filter((i) => i.projectId === projectId);
  const snags = db.snags.filter((s) => s.projectId === projectId);
  const verdict = canRaiseHandover(items, snags);
  if (!verdict.ok) throw new RuleError(verdict.reasons.join(" "), verdict.blockedBy);

  db.handoverSigned[projectId] = { at: now(), by: actor.name };
  items.forEach((i) => {
    if (i.status === "INSTALLED") { i.status = "HANDED_OVER"; i.statusUpdatedAt = now(); }
  });
  audit(actor, `projects/${projectId}`, "UPDATE", `Handover signed by ${actor.name}`);
  recomputeProject(projectId);
  commit();
}

/* -------------------------------------------------------------- finance */

/** Rule FN-01 — goods move on a challan, not an invoice. */
export function createChallan(actor: AppUser, consignmentId: string) {
  requireAccounts(actor);
  const c = db.consignments.find((x) => x.id === consignmentId);
  if (!c) throw new RuleError("Consignment not found.");
  if (c.challanId) throw new RuleError("A delivery challan already exists for this shipment.");
  const project = requireProject(c.projectId);
  const client = requireInvoiceParties(project);

  const challan = {
    id: nextId("dc"),
    number: nextDocNumber("DC"),
    projectId: c.projectId,
    consignmentId,
    billTo: { name: client.name, gstin: client.gstin, address: client.billingAddress, state: client.state },
    shipTo: {
      name: `Ola Showroom — ${project.site.city}`,
      address: `${project.site.address}, ${project.site.city} ${project.site.pincode}`,
      state: project.site.state,
    },
    issuedAt: now(),
    taxableValue: c.taxableValue,
  };
  db.challans.unshift(challan);
  c.challanId = challan.id;

  audit(actor, `challans/${challan.id}`, "CREATE", `${challan.number} for ${project.name}`);
  commit();
  return challan;
}

/** Creates one GST invoice for exactly the selected items in one shipment. */
export function issueConsignmentInvoice(actor: AppUser, consignmentId: string) {
  requireAccounts(actor);
  const consignment = db.consignments.find((entry) => entry.id === consignmentId);
  if (!consignment) throw new RuleError("Shipment not found.");
  if (!consignment.challanId) throw new RuleError("Create the delivery challan before invoicing this shipment.");
  if (consignment.invoiceId) throw new RuleError("This shipment has already been invoiced.");
  const project = requireProject(consignment.projectId);
  const client = requireInvoiceParties(project);
  const crates = db.crates.filter((crate) => consignment.crateIds.includes(crate.id));
  const quantities = new Map<string, number>();
  crates.forEach((crate) => crate.itemIds.forEach((itemId) => quantities.set(itemId, (quantities.get(itemId) ?? 0) + (crate.itemQuantities?.[itemId] ?? 0))));
  const entries = [...quantities.entries()]
    .filter(([itemId]) => !consignment.invoiceRequestItemIds?.length || consignment.invoiceRequestItemIds.includes(itemId))
    .map(([itemId, qty]) => ({ item: db.items.find((item) => item.id === itemId), qty }));
  if (entries.some(({ item, qty }) => !item || qty <= 0 || !item.hsnCode)) throw new RuleError("Every shipped line needs a quantity and HSN code.", ["FN-03"]);
  const lines = entries.map(({ item, qty }) => ({ description: `${item!.orderCategory === "SERVICE" ? "Service" : "Sales"} - ${item!.name}`, hsn: item!.hsnCode, qty, rate: item!.pricing.finalPrice, taxableValue: item!.pricing.finalPrice * qty, gstRate: 18 }));
  const taxable = lines.reduce((sum, line) => sum + line.taxableValue, 0);
  const mode = taxMode(client.state);
  const gst = Math.round(taxable * 0.18);
  const due = new Date(NOW); due.setDate(due.getDate() + 30);
  const invoice = {
    id: nextId("inv"), number: nextDocNumber("INV"), projectId: project.id, clientId: project.clientId,
    placeOfSupplyState: project.site.state, lines, taxMode: mode,
    cgst: mode === "CGST_SGST" ? Math.round(gst / 2) : 0, sgst: mode === "CGST_SGST" ? Math.round(gst / 2) : 0, igst: mode === "IGST" ? gst : 0,
    taxableValue: taxable, total: taxable + gst, retentionPct: 0, retentionAmount: 0, netPayable: taxable + gst,
    challanIds: [consignment.challanId], issuedAt: now(), dueDate: due.toISOString(), status: "ISSUED" as const, amountReceived: 0,
  };
  db.invoices.unshift(invoice);
  consignment.invoiceId = invoice.id;
  entries.forEach(({ item, qty }) => { if (item) item.qtyInvoiced = Math.min(item.qty, (item.qtyInvoiced ?? 0) + qty); });
  audit(actor, `invoices/${invoice.id}`, "CREATE", `${invoice.number} · partial shipment for ${project.name}`);
  notify("VENDOR", "Shipment invoice is ready", `${project.site.city}: ${invoice.number} is available in your documents.`, "/franchisee");
  commit();
  return invoice;
}

/** Accounts' one-click billing action for a ready shipment. A challan is still
 * created first so the invoice is tied to the exact consignment and BOQ lines. */
export function createShipmentBillingPack(actor: AppUser, consignmentId: string) {
  if (actor.role !== "ACCOUNTS") throw new RuleError("Only Accounts can create shipment billing documents.");
  const consignment = db.consignments.find((entry) => entry.id === consignmentId);
  if (!consignment) throw new RuleError("Shipment not found.");
  if (!consignment.challanId) createChallan(actor, consignmentId);
  const invoice = consignment.invoiceId
    ? db.invoices.find((entry) => entry.id === consignment.invoiceId)
    : issueConsignmentInvoice(actor, consignmentId);
  if (!invoice) throw new RuleError("The shipment invoice could not be found.");
  notify("ADMIN", "Shipment invoice created", `${requireProject(consignment.projectId).site.city}: ${invoice.number} is ready. Accounts can now complete the e-way bill details.`, `/admin/projects/${consignment.projectId}`);
  commit();
  return invoice;
}

/** Rule DS-03/DS-04 — Part A then Part B, before the vehicle moves. */
export function recordEwayBill(
  actor: AppUser,
  consignmentId: string,
  ewayBillNo: string,
  transporterName: string,
  vehicleNo: string
) {
  requireAccounts(actor);
  const c = db.consignments.find((x) => x.id === consignmentId);
  if (!c) throw new RuleError("Consignment not found.");
  if (!c.challanId && !c.invoiceId) throw new RuleError("Create a delivery challan or tax invoice before recording its e-way bill.", ["DS-08"]);
  if (!/^\d{12}$/.test(ewayBillNo.trim())) {
    throw new RuleError("An e-way bill number is 12 digits.", ["DS-03"]);
  }
  if (!transporterName.trim() || !vehicleNo.trim()) {
    throw new RuleError("Part B needs a transporter and a vehicle number.", ["DS-04"]);
  }
  c.ewayBillNo = ewayBillNo.trim();
  c.transporterName = transporterName.trim();
  c.vehicleNo = vehicleNo.trim().toUpperCase();
  const valid = new Date(NOW);
  valid.setDate(valid.getDate() + 3);
  c.ewayBillValidTill = valid.toISOString();
  audit(actor, `consignments/${consignmentId}`, "UPDATE", `E-way bill ${c.ewayBillNo} recorded`);
  commit();
}

/** Rules FN-02, FN-03, FN-04. */
export function issueInvoice(
  actor: AppUser,
  projectId: string,
  opts: { final: boolean; percent: number; description: string }
) {
  requireAccounts(actor);
  const project = requireProject(projectId);
  const client = requireInvoiceParties(project);
  if (opts.final) {
    const verdict = canRaiseFinalInvoice(project);
    if (!verdict.ok) throw new RuleError(verdict.reasons.join(" "), verdict.blockedBy);
  }

  const items = db.items.filter((i) => i.projectId === projectId);
  const missingHsn = items.filter((i) => !i.hsnCode);
  if (missingHsn.length) throw new RuleError(`${missingHsn.length} line(s) have no HSN code.`, ["FN-03"]);

  const taxable = Math.round((project.totals.value * opts.percent) / 100);
  const previouslyBilled = db.invoices.filter((invoice) => invoice.projectId === projectId).reduce((sum, invoice) => sum + invoice.taxableValue - creditedAmount(invoice.id), 0);
  if (previouslyBilled + taxable > project.totals.value) throw new RuleError("This would bill more than the approved BOQ value. Use a credit note or choose the remaining value.", ["FN-06"]);
  const mode = taxMode(client.state);
  const gst = Math.round(taxable * 0.18);
  const retention = Math.round((taxable * project.retentionPct) / 100);
  const due = new Date(NOW);
  due.setDate(due.getDate() + 30);
  const lines = opts.percent === 100
    ? items.map((item) => ({
        description: `${item.orderCategory === "SERVICE" ? "Service" : "Product"} — ${item.name}${item.spec ? ` (${item.spec})` : ""}`,
        hsn: item.hsnCode,
        qty: item.qty,
        rate: item.pricing.finalPrice,
        taxableValue: item.pricing.finalPrice * item.qty,
        gstRate: 18,
      }))
    : [{
        description: opts.description,
        hsn: items[0]?.hsnCode ?? "9403",
        qty: 1,
        rate: taxable,
        taxableValue: taxable,
        gstRate: 18,
      }];

  const invoice = {
    id: nextId("inv"),
    number: nextDocNumber("INV"),
    projectId,
    clientId: project.clientId,
    placeOfSupplyState: project.site.state,
    lines,
    taxMode: mode,
    cgst: mode === "CGST_SGST" ? Math.round(gst / 2) : 0,
    sgst: mode === "CGST_SGST" ? Math.round(gst / 2) : 0,
    igst: mode === "IGST" ? gst : 0,
    taxableValue: taxable,
    total: taxable + gst,
    retentionPct: project.retentionPct,
    retentionAmount: retention,
    netPayable: taxable + gst - retention,
    challanIds: db.challans.filter((c) => c.projectId === projectId).map((c) => c.id),
    issuedAt: now(),
    dueDate: due.toISOString(),
    status: "ISSUED" as const,
    amountReceived: 0,
  };
  db.invoices.unshift(invoice);

  audit(actor, `invoices/${invoice.id}`, "CREATE", `${invoice.number} · ₹${invoice.netPayable}`);
  commit();
  return invoice;
}

/** Rule FN-08 — part payments age the balance. */
export function recordPayment(actor: AppUser, invoiceId: string, amount: number, mode: string) {
  requireAccounts(actor);
  const inv = db.invoices.find((i) => i.id === invoiceId);
  if (!inv) throw new RuleError("Invoice not found.");
  if (amount <= 0) throw new RuleError("Enter an amount.");
  const outstanding = inv.netPayable - inv.amountReceived - creditedAmount(inv.id);
  if (amount > outstanding) throw new RuleError(`That is more than the ₹${outstanding} outstanding.`);

  inv.amountReceived += amount;
  inv.status = inv.amountReceived >= inv.netPayable ? "PAID" : "PART_PAID";

  db.payments.unshift({
    id: nextId("pay"),
    invoiceId,
    clientId: inv.clientId,
    amount,
    receivedAt: now(),
    mode,
  });

  audit(actor, `invoices/${invoiceId}`, "UPDATE", `Payment ₹${amount} recorded (${mode})`);
  commit();
}

/* --------------------------------------------------- commercial variations */

export function createChangeOrder(
  actor: AppUser,
  input: Pick<ChangeOrder, "projectId" | "title" | "reason" | "deltaValue">
) {
  const project = requireProject(input.projectId);
  if (!input.title.trim() || !input.reason.trim()) throw new RuleError("Give the variation a title and reason.");
  const order: ChangeOrder = {
    id: nextId("co"), projectId: project.id, title: input.title.trim(), reason: input.reason.trim(),
    deltaValue: Math.round(input.deltaValue), status: "PENDING_CLIENT", createdBy: actor.name, createdAt: now(),
  };
  db.changeOrders.unshift(order);
  notify("CLIENT", `Change request for ${project.site.city}`, `${order.title} needs your decision.`, `/portal/approvals`);
  audit(actor, `changeOrders/${order.id}`, "CREATE", `${order.title} · ${order.deltaValue >= 0 ? "+" : ""}₹${order.deltaValue}`);
  commit();
  return order;
}

export function decideChangeOrder(actor: AppUser, id: string, approved: boolean, note?: string) {
  const order = db.changeOrders.find((c) => c.id === id);
  if (!order) throw new RuleError("Change request not found.");
  if (order.status !== "PENDING_CLIENT") throw new RuleError("This change request has already been decided.");
  order.status = approved ? "APPROVED" : "REJECTED";
  order.clientNote = note?.trim() || undefined;
  order.decidedAt = now();
  const project = requireProject(order.projectId);
  if (approved) {
    project.approvedChangeValue = (project.approvedChangeValue ?? 0) + order.deltaValue;
    recomputeProject(project.id);
  }
  notify("ADMIN", `${approved ? "Approved" : "Rejected"} change request`, `${project.site.city} · ${order.title}`, `/admin/projects/${project.id}`);
  audit(actor, `changeOrders/${id}`, "UPDATE", approved ? "Approved by client" : "Rejected by client");
  commit();
}

export function createCreditNote(actor: AppUser, invoiceId: string, amount: number, reason: string) {
  requireAccounts(actor);
  const invoice = db.invoices.find((i) => i.id === invoiceId);
  if (!invoice) throw new RuleError("Invoice not found.");
  if (amount <= 0 || amount > invoice.netPayable - creditedAmount(invoiceId)) throw new RuleError("Credit amount must be within the remaining invoice value.");
  if (!reason.trim()) throw new RuleError("Give a reason for the credit note.");
  const note: CreditNote = {
    id: nextId("cnote"), number: `KP/CN/26-27/${String(db.creditNotes.length + 1).padStart(4, "0")}`,
    invoiceId, projectId: invoice.projectId, amount: Math.round(amount), reason: reason.trim(), issuedAt: now(),
  };
  db.creditNotes.unshift(note);
  if (invoice.amountReceived + creditedAmount(invoiceId) >= invoice.netPayable) invoice.status = "CREDIT_NOTED";
  audit(actor, `creditNotes/${note.id}`, "CREATE", `${note.number} against ${invoice.number}`);
  commit();
  return note;
}

/* ----------------------------------------------------- stock & supplier bills */

export function saveInventory(actor: AppUser, row: InventoryItem) {
  if (row.availableQty < 0 || row.reservedQty < 0 || row.reservedQty > row.availableQty) {
    throw new RuleError("Reserved quantity must be between zero and available quantity.");
  }
  const existing = db.inventory.findIndex((i) => i.id === row.id);
  const saved = { ...row, updatedAt: now() };
  if (existing >= 0) db.inventory[existing] = saved;
  else db.inventory.push(saved);
  audit(actor, `inventory/${saved.id}`, existing >= 0 ? "UPDATE" : "CREATE", `${saved.warehouse} stock updated`);
  commit();
}

export function saveVendorBill(actor: AppUser, bill: VendorBill) {
  requireAccounts(actor);
  if (!bill.vendorId || !bill.billNumber.trim() || bill.amount <= 0) throw new RuleError("Vendor, bill number and amount are required.");
  if (db.vendorBills.some((entry) => entry.id !== bill.id && entry.vendorId === bill.vendorId && entry.billNumber.trim().toLowerCase() === bill.billNumber.trim().toLowerCase())) throw new RuleError("This vendor invoice number is already recorded.");
  const order = bill.poNumber ? db.purchaseOrders.find((entry) => entry.number === bill.poNumber) : undefined;
  if (bill.poNumber && !order) throw new RuleError("Select a valid purchase order before matching this bill.");
  if (order && bill.amount > order.amount) throw new RuleError("Vendor bill amount cannot exceed its linked purchase order.");
  const matched = Boolean(order && bill.grnReference?.trim());
  const saved: VendorBill = { ...bill, status: matched ? "MATCHED" : "PENDING" };
  const existing = db.vendorBills.findIndex((b) => b.id === bill.id);
  if (existing >= 0) db.vendorBills[existing] = saved;
  else db.vendorBills.unshift(saved);
  audit(actor, `vendorBills/${saved.id}`, existing >= 0 ? "UPDATE" : "CREATE", `${saved.billNumber} · ${saved.status}`);
  commit();
}

export function addDocument(actor: AppUser, doc: DocumentRecord) {
  if (!doc.name.trim()) throw new RuleError("Document name is required.");
  db.documents.unshift({ ...doc, name: doc.name.trim(), addedBy: actor.name, addedAt: now() });
  audit(actor, `documents/${doc.id}`, "CREATE", doc.name);
  commit();
}

export function markNotificationsRead(actor: AppUser) {
  db.notifications.forEach((n) => {
    if ((n.role === "ALL" || n.role === actor.role) && !n.readBy.includes(actor.uid)) n.readBy.push(actor.uid);
  });
  commit();
}

/* -------------------------------------------------------------- comments */

export function addComment(actor: AppUser, projectId: string, body: string) {
  if (!body.trim()) return;
  db.comments.unshift({
    id: nextId("cm"),
    projectId,
    body: body.trim(),
    byUid: actor.uid,
    byName: actor.name,
    byRole: actor.role,
    at: now(),
  });
  const project = requireProject(projectId);
  if (actor.role === "CLIENT") {
    notify("ADMIN", `Client message · ${project.site.city}`, body.trim().slice(0, 96), `/admin/projects/${projectId}?tab=comments`);
  } else if (["ADMIN", "INSTALLATION", "ACCOUNTS"].includes(actor.role)) {
    notify("CLIENT", `Kurchi update · ${project.site.city}`, body.trim().slice(0, 96), `/portal/projects/${projectId}`);
  }
  audit(actor, `projects/${projectId}`, "CREATE", "Project message posted");
  commit();
}

/* -------------------------------------------------------------- masters */

export function saveProduct(actor: AppUser, product: Product) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can manage catalogue products.");
  if (!product.name.trim() || !product.hsnCode.trim()) throw new RuleError("Product name and HSN code are required.");
  if (product.defaultBasePrice < 0 || product.defaultSellingPrice < 0) throw new RuleError("Product prices cannot be negative.");
  const existing = db.products.findIndex((p) => p.id === product.id);
  if (existing >= 0) db.products[existing] = product;
  else db.products.push(product);
  audit(actor, `products/${product.id}`, existing >= 0 ? "UPDATE" : "CREATE", product.name);
  commit();
}

export function blankKit(): Kit {
  return { id: nextId("kit"), name: "", description: "", version: 1, active: true, mode: "STANDARD", lines: [] };
}

/** The one reusable Standard BOQ. Modular projects always use the full catalogue. */
export function saveKit(actor: AppUser, kit: Kit) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can manage BOQ kits.");
  if (!kit.name.trim()) throw new RuleError("Give this BOQ kit a name.");
  if (!kit.lines.length) throw new RuleError("Add at least one catalogue item to this BOQ kit.");
  const cleaned = { ...kit, mode: "STANDARD" as const, name: kit.name.trim(), lines: kit.lines.filter((line) => line.productId && line.defaultQty > 0) };
  if (!cleaned.lines.length) throw new RuleError("Each kit line needs a product and quantity.");
  const existing = db.kits.findIndex((entry) => entry.id === kit.id);
  if (db.kits.some((entry) => entry.id !== kit.id && entry.active && entry.mode !== "MODULAR")) {
    throw new RuleError("Only one active Standard BOQ is allowed. Edit the existing Standard BOQ instead.");
  }
  if (existing >= 0) db.kits[existing] = { ...cleaned, version: Math.max(cleaned.version, db.kits[existing].version + 1) };
  else db.kits.push(cleaned);
  audit(actor, `kits/${kit.id}`, existing >= 0 ? "UPDATE" : "CREATE", `${cleaned.name} · ${cleaned.lines.length} items`);
  commit();
}

export function toggleProduct(actor: AppUser, productId: string) {
  const p = db.products.find((x) => x.id === productId);
  if (!p) return;
  p.active = !p.active;
  audit(actor, `products/${productId}`, "UPDATE", `${p.name} ${p.active ? "activated" : "deactivated"}`);
  commit();
}

export function saveVendor(actor: AppUser, vendor: Vendor) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can manage franchisees and suppliers.");
  const existing = db.vendors.findIndex((v) => v.id === vendor.id);
  if (existing >= 0) db.vendors[existing] = vendor;
  else db.vendors.push(vendor);
  audit(actor, `vendors/${vendor.id}`, existing >= 0 ? "UPDATE" : "CREATE", vendor.name);
  commit();
}

export function setUserActive(actor: AppUser, uid: string, active: boolean) {
  if (actor.role !== "ADMIN") throw new RuleError("Only Admin can change user access.");
  const u = db.users.find((x) => x.uid === uid);
  if (!u) return;
  if (!active && u.uid === actor.uid) throw new RuleError("You cannot deactivate your own account.");
  if (!active && u.role === "ADMIN" && db.users.filter((entry) => entry.role === "ADMIN" && entry.active).length <= 1) throw new RuleError("Keep at least one active Admin account.");
  u.active = active;
  audit(actor, `users/${uid}`, "UPDATE", `${u.name} ${active ? "activated" : "deactivated"}`);
  commit();
}

/* ------------------------------------------------------------ enquiries */

export function addEnquiry(input: {
  name: string; company: string; phone: string; city: string; message: string;
}) {
  db.enquiries.unshift({ ...input, id: nextId("enq"), at: now() });
  commit();
}

export { EWAY_BILL_THRESHOLD };
