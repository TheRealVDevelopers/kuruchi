/**
 * Domain types for Kurchi Projects.
 * Mirrors docs/04-data-model.md — keep the two in step.
 */

/* ------------------------------------------------------------------ roles */

export const ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "INSTALLATION",
  "ACCOUNTS",
  "CLIENT",
  "VENDOR",
] as const;

export type Role = (typeof ROLES)[number];

export interface AppUser {
  uid: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
  /** set when role = CLIENT */
  clientId?: string;
  /** set when role = INSTALLATION — points at a vendor of type INSTALLATION */
  teamId?: string;
  /** set when role = VENDOR — limits the partner work queue */
  vendorId?: string;
  active: boolean;
}

/* --------------------------------------------------------------- statuses */

export const ITEM_STATUSES = [
  "DRAFT",
  "APPROVED",
  "IN_PRODUCTION",
  "PO_PLACED",
  "QC_PENDING",
  "QC_FAILED",
  "READY_TO_PACK",
  "PACKED",
  "DISPATCHED",
  "IN_TRANSIT",
  "DELIVERED_AT_SITE",
  "RECEIVED_OK",
  "RECEIVED_DAMAGED",
  "SHORT_SUPPLIED",
  "REPLACEMENT_REQUESTED",
  "INSTALL_ASSIGNED",
  "INSTALL_IN_PROGRESS",
  "INSTALLED",
  "SNAG_OPEN",
  "HANDED_OVER",
  "CANCELLED",
] as const;

export type ItemStatus = (typeof ITEM_STATUSES)[number];

export const PROJECT_STATUSES = [
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
  "ON_HOLD",
  "CANCELLED",
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type SourcingType = "MAKE" | "BUY" | "STOCK";

export type TicketCause =
  | "TRANSIT"
  | "MANUFACTURING"
  | "HANDLING_AT_SITE"
  | "SHORT_SUPPLY";

export type TicketDecision = "REPLACE" | "REPAIR" | "WAIVE";

export type SnagSeverity = "MINOR" | "MAJOR" | "CRITICAL";

/* ------------------------------------------------------------- catalogue */

export interface Product {
  id: string;
  name: string;
  slug: string;
  category: string;
  /** Commercial bucket used to split BOQ, shipment and invoice lines. */
  orderCategory?: "SALES" | "SERVICE";
  shortSpec: string;
  description: string;
  /** dimensions, material, finish, warranty … */
  specs: Record<string, string>;
  hsnCode: string;
  unit: string;
  images: string[];
  /** starting price shown publicly */
  startingPrice: number;
  defaultBasePrice: number;
  defaultSellingPrice: number;
  leadTimeDays: number;
  active: boolean;
}

export interface KitLine {
  productId: string;
  name: string;
  spec: string;
  defaultQty: number;
  zone?: string;
}

export interface Kit {
  id: string;
  name: string;
  description: string;
  programmeId?: string;
  version: number;
  active: boolean;
  /** Standard kits are fixed; Modular kits let Ola increase listed quantities. */
  mode?: "STANDARD" | "MODULAR";
  lines: KitLine[];
}

/* ---------------------------------------------------------- client & work */

export interface Client {
  id: string;
  name: string;
  gstin: string;
  billingAddress: string;
  state: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export interface Programme {
  id: string;
  clientId: string;
  name: string;
  defaultKitId?: string;
  startDate: string;
  targetProjects: number;
}

export interface SiteReadiness {
  civil: boolean;
  flooring: boolean;
  power: boolean;
  truckAccess: boolean;
  storage: boolean;
  contact: boolean;
}

export interface ProjectTotals {
  itemCount: number;
  installedCount: number;
  /** Σ finalPrice */
  value: number;
  /** Σ basePrice */
  baseCost: number;
  /** Σ landedCost */
  landedCost: number;
  reworkCost: number;
  quotedMargin: number;
  realMargin: number;
  marginPct: number;
}

export interface ProjectFlags {
  overdue: boolean;
  stale: boolean;
  hasOpenTickets: boolean;
  hasCriticalSnags: boolean;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  clientId: string;
  /** Ola's selected showroom partner for this location. */
  franchiseeId?: string;
  /** Who first submitted this showroom. Ola submissions wait for Kurchi acceptance. */
  createdByRole?: Role;
  olaSubmittedAt?: string;
  adminAcceptedAt?: string;
  programmeId: string;
  site: {
    address: string;
    city: string;
    state: string;
    pincode: string;
    /** GSTIN for the franchisee showroom, used on delivery and tax documents. */
    gstin?: string;
    contactName: string;
    contactPhone: string;
  };
  status: ProjectStatus;
  statusUpdatedAt: string;
  boqMode?: "STANDARD" | "MODULAR";
  standardKitId?: string;
  modularRequest?: string;
  franchiseeApprovedAt?: string;
  /** Ola's payment claim is checked by Accounts before Admin can start work. */
  initialPayment?: {
    amount: number;
    percentage: number;
    reference: string;
    proofName?: string;
    /** Firebase Storage URL for the payment proof, when one was uploaded. */
    proofUrl?: string;
    submittedAt: string;
    status: "PENDING_VERIFICATION" | "VERIFIED" | "REJECTED";
    verifiedAt?: string;
    verifiedBy?: string;
    rejectionReason?: string;
  };
  advanceRequiredPct?: number;
  advanceReceivedPct?: number;
  /** Plain-language rollout stage shown to business users. Item status remains the operational source of truth. */
  operationalStatus?: OperationalStatus;
  operationalStatusUpdatedAt?: string;
  operationalExpectedDate?: string;
  operationalUpdateNote?: string;
  /** Starts the 48-hour installation commitment. */
  deliveredToSiteAt?: string;
  installationStartedAt?: string;
  /** Simple on-site check-in from the Installation crew; it never overwrites system status. */
  siteWorkStatus?: SiteWorkStatus;
  siteWorkStatusUpdatedAt?: string;
  startDate: string;
  targetCompletionDate: string;
  actualCompletionDate?: string;
  installationTeamId?: string;
  siteReadiness: SiteReadiness;
  retentionPct: number;
  dlpMonths: number;
  dlpStartDate?: string;
  dlpEndDate?: string;
  totals: ProjectTotals;
  /** Approved commercial variations, kept separate from the item BOQ roll-up. */
  approvedChangeValue?: number;
  flags: ProjectFlags;
  holdReason?: string;
  cancelReason?: string;
}

export type OperationalStatus =
  | "ADVANCE_PENDING"
  | "PRODUCTION"
  | "LOGISTICS"
  | "DELIVERED"
  | "INSTALLATION"
  | "COMPLETED";

export type SiteWorkStatus =
  | "NOT_STARTED"
  | "WORK_STARTED"
  | "WORK_IN_PROGRESS"
  | "WAITING"
  | "READY_FOR_HANDOVER";

/**
 * The four money fields. `basePrice`, `sellingPrice` and `finalPrice` are typed;
 * `landedCost` and both margins are computed — see lib/money.ts and rule BQ-05.
 *
 * Lives in a separate object because CLIENT and INSTALLATION must never receive
 * it (rules AC-02, AC-03). In Firestore this is the `private/pricing` doc.
 */
export interface ItemPricing {
  basePrice: number;
  sellingPrice: number;
  finalPrice: number;
  discountReason?: string;
  allocatedTransport: number;
  allocatedInstall: number;
  reworkCost: number;
  internalNotes?: string;
}

export interface BoqItem {
  id: string;
  projectId: string;
  productId?: string;
  name: string;
  orderCategory?: "SALES" | "SERVICE";
  spec: string;
  hsnCode: string;
  unit: string;
  qty: number;
  status: ItemStatus;
  statusUpdatedAt: string;
  sourcingType?: SourcingType;
  vendorId?: string;
  poNumber?: string;
  eta?: string;
  qcAttempts: number;
  crateId?: string;
  consignmentId?: string;
  qtyDispatched: number;
  qtyReceived: number;
  qtyInstalled: number;
  /** Quantity already billed through shipment-specific invoices. */
  qtyInvoiced?: number;
  /** Running quantities used when one BOQ line is split across suppliers or crates. */
  qtyOrdered?: number;
  qtyReadyToPack?: number;
  /** id of the damaged original this line replaces */
  replacementFor?: string;
  zone?: string;
  pricing: ItemPricing;
}

/* ------------------------------------------------------------- logistics */

export interface Crate {
  id: string;
  projectId: string;
  crateCode: string;
  itemIds: string[];
  /** Quantity of each BOQ line inside this crate. Falls back to the full line for legacy crates. */
  itemQuantities?: Record<string, number>;
  weightKg?: number;
  /** at least one required before dispatch — rule DS-02 */
  photos: string[];
  packedBy?: string;
  packedAt?: string;
  consignmentId?: string;
  receivedAt?: string;
  receiptPhotos: string[];
}

export interface Consignment {
  id: string;
  projectId: string;
  crateIds: string[];
  challanId?: string;
  ewayBillNo?: string;
  ewayBillValidTill?: string;
  transporterName?: string;
  vehicleNo?: string;
  driverPhone?: string;
  driverName?: string;
  driverLicenceNo?: string;
  /** Direct truck is Kurchi-arranged; delivery is a third-party service. */
  deliveryMethod?: "DIRECT_TRUCK" | "THIRD_PARTY_DELIVERY";
  /** Box counts captured in the ready-to-ship checklist before dispatch. */
  boxCounts?: number[];
  rtsCheckedAt?: string;
  lrNumber?: string;
  dispatchedAt?: string;
  eta?: string;
  deliveredAt?: string;
  taxableValue: number;
  /** One partial shipment can have its own invoice and delivery challan. */
  invoiceId?: string;
  /** interstate movement drives e-way bill and IGST — rules DS-03, FN-02 */
  interState: boolean;
  overrideReason?: string;
  status: "READY" | "DISPATCHED" | "IN_TRANSIT" | "DELIVERED";
}

/* --------------------------------------------------------------- tickets */

export interface Ticket {
  id: string;
  projectId: string;
  type: "DAMAGE" | "SHORTAGE";
  itemId: string;
  qtyAffected: number;
  cause: TicketCause;
  /** mandatory — rule ST-02 */
  photos: string[];
  reportedBy: string;
  reportedAt: string;
  decision?: TicketDecision;
  replacementItemId?: string;
  costImpact: number;
  status: "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED";
  note?: string;
}

export interface Snag {
  id: string;
  projectId: string;
  itemId?: string;
  description: string;
  severity: SnagSeverity;
  photos: string[];
  raisedBy: string;
  raisedAt: string;
  assignedTo?: string;
  dueDate?: string;
  closedAt?: string;
  status: "OPEN" | "CLOSED";
}

/* --------------------------------------------------------------- vendors */

export interface Vendor {
  id: string;
  name: string;
  type: "SUPPLIER" | "INSTALLATION" | "TRANSPORTER" | "FRANCHISEE";
  clientId?: string;
  city: string;
  state: string;
  gstin?: string;
  address?: string;
  pincode?: string;
  email?: string;
  contactName: string;
  contactPhone: string;
  scorecard?: {
    onTimePct: number;
    damagePct: number;
    snagCount: number;
    reworkCostCaused: number;
  };
}

export type ScheduleTaskStatus = "NOT_STARTED" | "IN_PROGRESS" | "BLOCKED" | "DONE";

/** A project-level rollout milestone. Item status remains the source of truth for goods. */
export interface ScheduleTask {
  id: string;
  projectId: string;
  title: string;
  phase: "READINESS" | "PRODUCTION" | "DISPATCH" | "DELIVERY" | "INSTALLATION" | "HANDOVER";
  plannedStart: string;
  plannedEnd: string;
  status: ScheduleTaskStatus;
  owner?: string;
  note?: string;
  actualStart?: string;
  actualEnd?: string;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  projectId: string;
  vendorId: string;
  /** Approved BOQ lines awarded to this vendor. */
  itemIds?: string[];
  /** Allows the same BOQ line to be split between multiple suppliers. */
  allocations?: Array<{ itemId: string; qty: number }>;
  description: string;
  amount: number;
  orderedAt: string;
  expectedAt: string;
  status: "DRAFT" | "ISSUED" | "PART_RECEIVED" | "RECEIVED" | "CANCELLED";
  createdBy: string;
}

/* --------------------------------------------------------------- finance */

export interface Challan {
  id: string;
  number: string;
  projectId: string;
  consignmentId: string;
  billTo: { name: string; gstin: string; address: string; state: string };
  shipTo: { name: string; gstin?: string; address: string; state: string };
  issuedAt: string;
  taxableValue: number;
}

export interface InvoiceLine {
  description: string;
  hsn: string;
  qty: number;
  rate: number;
  taxableValue: number;
  gstRate: number;
}

export interface Invoice {
  id: string;
  number: string;
  projectId: string;
  clientId: string;
  placeOfSupplyState: string;
  lines: InvoiceLine[];
  taxMode: "CGST_SGST" | "IGST";
  cgst: number;
  sgst: number;
  igst: number;
  taxableValue: number;
  total: number;
  retentionPct: number;
  retentionAmount: number;
  netPayable: number;
  challanIds: string[];
  issuedAt: string;
  dueDate: string;
  status: "ISSUED" | "PART_PAID" | "PAID" | "CREDIT_NOTED";
  amountReceived: number;
}

export interface Payment {
  id: string;
  invoiceId: string;
  clientId: string;
  amount: number;
  receivedAt: string;
  mode: string;
  reference?: string;
}

export interface CreditNote {
  id: string;
  number: string;
  invoiceId: string;
  projectId: string;
  amount: number;
  reason: string;
  issuedAt: string;
}

export interface ChangeOrder {
  id: string;
  projectId: string;
  title: string;
  reason: string;
  deltaValue: number;
  status: "DRAFT" | "PENDING_CLIENT" | "APPROVED" | "REJECTED";
  createdBy: string;
  createdAt: string;
  clientNote?: string;
  decidedAt?: string;
}

export interface InventoryItem {
  id: string;
  productId: string;
  warehouse: string;
  availableQty: number;
  reservedQty: number;
  reorderLevel: number;
  updatedAt: string;
}

export interface VendorBill {
  id: string;
  vendorId: string;
  projectId?: string;
  billNumber: string;
  billDate: string;
  amount: number;
  poNumber?: string;
  grnReference?: string;
  status: "PENDING" | "MATCHED" | "APPROVED" | "PAID";
  createdAt: string;
}

/** A simple project expense entry for Accounts and Admin. */
export interface CostEntry {
  id: string;
  projectId: string;
  head: "PRODUCTION" | "PACKAGING" | "LOGISTICS" | "INSTALLATION" | "SITE_EXPENSE" | "MISCELLANEOUS" | "OTHER";
  customHead?: string;
  amount: number;
  note: string;
  createdBy: string;
  createdAt: string;
}

export interface DocumentRecord {
  id: string;
  projectId: string;
  type: "DRAWING" | "BOQ" | "CHALLAN" | "INVOICE" | "LR" | "HANDOVER" | "KYC_GST" | "KYC_MSME" | "KYC_CANCELLED_CHEQUE" | "DESIGN_2D" | "DESIGN_3D" | "BROCHURE" | "EWAY_BILL" | "OTHER";
  name: string;
  addedBy: string;
  addedAt: string;
  /** Local data URL in the standalone app; cloud URL after Storage is connected. */
  fileUrl?: string;
}

export interface AppNotification {
  id: string;
  role: Role | "ALL";
  title: string;
  detail: string;
  link?: string;
  createdAt: string;
  readBy: string[];
}

/* ------------------------------------------------------------- activity */

export interface ProgressLog {
  id: string;
  projectId: string;
  note: string;
  photos: string[];
  by: string;
  at: string;
  zone?: string;
}

export interface Comment {
  id: string;
  projectId: string;
  body: string;
  byUid: string;
  byName: string;
  byRole: Role;
  at: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  actorName: string;
  actorRole: Role;
  entity: string;
  action: string;
  detail: string;
  ruleOverridden?: string;
  overrideReason?: string;
}

export interface Enquiry {
  id: string;
  name: string;
  company: string;
  phone: string;
  city: string;
  message: string;
  at: string;
}
