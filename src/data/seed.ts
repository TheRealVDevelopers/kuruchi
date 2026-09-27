/**
 * Demo data so every screen opens in a realistic working state.
 * Replace with Firestore reads once a project is provisioned — see lib/firebase.ts.
 *
 * The Kochi project deliberately reproduces the worked example from
 * docs/02-workflow.md section 6: six visitor chairs, one cracked in transit.
 */

import type {
  AppUser, BoqItem, Client, Comment, Consignment, Crate, InventoryItem, Invoice,
  ItemStatus, Kit, Product, Programme, Project, ProgressLog, Snag, Ticket, Vendor,
} from "@/types";
import { deriveProjectStatus, projectProgress } from "@/lib/statuses";
import { rollUp } from "@/lib/money";

/* ------------------------------------------------------------------ dates */

const TODAY = new Date("2026-09-21T09:00:00+05:30");

function day(offset: number): string {
  const d = new Date(TODAY);
  d.setDate(d.getDate() + offset);
  return d.toISOString();
}

export const NOW = TODAY;

/* ------------------------------------------------------------------ users */

export const USERS: AppUser[] = [
  { uid: "u-super", email: "md@kurchi.in", name: "R. Venkatesh", role: "SUPER_ADMIN", active: true },
  { uid: "u-admin", email: "ops@kurchi.in", name: "Priya Nair", role: "ADMIN", active: true },
  { uid: "u-site", email: "site@kurchi.in", name: "Imran Shaikh", role: "INSTALLATION", teamId: "v-inst-south", active: true },
  { uid: "u-acct", email: "accounts@kurchi.in", name: "Deepa Rao", role: "ACCOUNTS", active: true },
  { uid: "u-client", email: "projects@ola.com", name: "Ankit Sharma", role: "CLIENT", clientId: "c-ola", active: true },
  { uid: "u-vendor", email: "franchisee@ola.com", name: "Rahul Mehta", role: "VENDOR", vendorId: "v-sharma", active: true },
];

/* -------------------------------------------------------------- catalogue */

export const PRODUCTS: Product[] = [
  {
    id: "p-su-a", name: "Storage Unit A", slug: "storage-unit-a", category: "Storage Units",
    shortSpec: "1800 × 900 × 450 mm · laminate over ply",
    description:
      "Full-height closed storage for showroom back-of-house. Adjustable shelves, soft-close doors, levelling feet for uneven retail flooring.",
    specs: { Dimensions: "1800 × 900 × 450 mm", Material: "18mm BWR ply", Finish: "0.8mm laminate", Shelves: "4 adjustable", Warranty: "24 months" },
    hsnCode: "9403", unit: "nos", images: [], startingPrice: 18500,
    defaultBasePrice: 12400, defaultSellingPrice: 18500, leadTimeDays: 18, active: true,
  },
  {
    id: "p-su-b", name: "Storage Unit B — Open", slug: "storage-unit-b-open", category: "Storage Units",
    shortSpec: "1200 × 900 × 400 mm · open display",
    description: "Open-shelf display unit for accessories and merchandise walls. Powder-coated steel frame with ply shelves.",
    specs: { Dimensions: "1200 × 900 × 400 mm", Material: "MS frame + 18mm ply", Finish: "Powder coat + laminate", Shelves: "3 fixed", Warranty: "24 months" },
    hsnCode: "9403", unit: "nos", images: [], startingPrice: 11200,
    defaultBasePrice: 7600, defaultSellingPrice: 11200, leadTimeDays: 14, active: true,
  },
  {
    id: "p-sofa-2", name: "Lounge Sofa — 2 Seater", slug: "lounge-sofa-2-seater", category: "Sofas",
    shortSpec: "1400 × 780 × 760 mm · fabric",
    description: "Customer waiting sofa. High-density foam, commercial-grade upholstery rated for retail footfall.",
    specs: { Dimensions: "1400 × 780 × 760 mm", Frame: "Seasoned hardwood", Foam: "40 density HR", Upholstery: "Commercial fabric", Warranty: "36 months" },
    hsnCode: "9401", unit: "nos", images: [], startingPrice: 32000,
    defaultBasePrice: 21500, defaultSellingPrice: 32000, leadTimeDays: 21, active: true,
  },
  {
    id: "p-sofa-3", name: "Lounge Sofa — 3 Seater", slug: "lounge-sofa-3-seater", category: "Sofas",
    shortSpec: "2000 × 780 × 760 mm · fabric",
    description: "Three-seat variant of the lounge sofa for larger waiting areas.",
    specs: { Dimensions: "2000 × 780 × 760 mm", Frame: "Seasoned hardwood", Foam: "40 density HR", Upholstery: "Commercial fabric", Warranty: "36 months" },
    hsnCode: "9401", unit: "nos", images: [], startingPrice: 44000,
    defaultBasePrice: 29800, defaultSellingPrice: 44000, leadTimeDays: 21, active: true,
  },
  {
    id: "p-chair-vc", name: "Visitor Chair VC-02", slug: "visitor-chair-vc-02", category: "Chairs",
    shortSpec: "Cantilever · fabric seat",
    description: "Stackable visitor chair for customer consultation desks. Chrome cantilever frame.",
    specs: { Dimensions: "540 × 580 × 820 mm", Frame: "Chrome MS", Seat: "Moulded foam + fabric", Stackable: "Yes, 4 high", Warranty: "24 months" },
    hsnCode: "9401", unit: "nos", images: [], startingPrice: 5400,
    defaultBasePrice: 3200, defaultSellingPrice: 5400, leadTimeDays: 12, active: true,
  },
  {
    id: "p-chair-exec", name: "Executive Chair EC-01", slug: "executive-chair-ec-01", category: "Chairs",
    shortSpec: "High back · mesh · gas lift",
    description: "Manager and sales-desk chair. Mesh back, lumbar support, nylon base with castors.",
    specs: { Dimensions: "620 × 640 × 1150 mm", Back: "Mesh", Mechanism: "Synchro tilt", Base: "Nylon 5-star", Warranty: "24 months" },
    hsnCode: "9401", unit: "nos", images: [], startingPrice: 9800,
    defaultBasePrice: 6300, defaultSellingPrice: 9800, leadTimeDays: 15, active: true,
  },
  {
    id: "p-counter", name: "Cash & Delivery Counter", slug: "cash-delivery-counter", category: "Counters",
    shortSpec: "2400 × 750 × 1050 mm · with drawers",
    description: "Front-of-house transaction counter with lockable drawer bank and cable management.",
    specs: { Dimensions: "2400 × 750 × 1050 mm", Material: "18mm BWR ply", Finish: "Laminate + edge band", Drawers: "3 lockable", Warranty: "24 months" },
    hsnCode: "9403", unit: "nos", images: [], startingPrice: 52000,
    defaultBasePrice: 34000, defaultSellingPrice: 52000, leadTimeDays: 24, active: true,
  },
  {
    id: "p-table-disc", name: "Discussion Table — 6 Seat", slug: "discussion-table-6-seat", category: "Tables",
    shortSpec: "1800 × 900 × 750 mm",
    description: "Customer discussion table for finance and delivery conversations.",
    specs: { Dimensions: "1800 × 900 × 750 mm", Top: "25mm prelam", Legs: "MS powder coat", Warranty: "24 months" },
    hsnCode: "9403", unit: "nos", images: [], startingPrice: 24500,
    defaultBasePrice: 16200, defaultSellingPrice: 24500, leadTimeDays: 18, active: true,
  },
];

export const CATEGORIES = ["Storage Units", "Sofas", "Chairs", "Counters", "Tables"];

/* ------------------------------------------------------------------- kits */

export const KITS: Kit[] = [
  {
    id: "k-ola-std", name: "Ola Standard Showroom", version: 3, active: true,
    programmeId: "pg-ola-fy26",
    description: "The 1,800–2,200 sq ft standard Ola experience-centre layout.",
    lines: [
      { productId: "p-counter", name: "Cash & Delivery Counter", spec: "2400mm", defaultQty: 1, zone: "Front" },
      { productId: "p-su-a", name: "Storage Unit A", spec: "1800 × 900", defaultQty: 2, zone: "Back office" },
      { productId: "p-su-b", name: "Storage Unit B — Open", spec: "1200 × 900", defaultQty: 3, zone: "Display" },
      { productId: "p-sofa-2", name: "Lounge Sofa — 2 Seater", spec: "Fabric — Ola grey", defaultQty: 2, zone: "Waiting" },
      { productId: "p-chair-vc", name: "Visitor Chair VC-02", spec: "Fabric — Ola grey", defaultQty: 6, zone: "Consultation" },
      { productId: "p-chair-exec", name: "Executive Chair EC-01", spec: "Mesh — black", defaultQty: 3, zone: "Sales desk" },
      { productId: "p-table-disc", name: "Discussion Table — 6 Seat", spec: "1800 × 900", defaultQty: 1, zone: "Consultation" },
    ],
  },
];

/* --------------------------------------------------------------- partners */

export const CLIENTS: Client[] = [
  {
    id: "c-ola", name: "Ola Electric Mobility Ltd", gstin: "29AAFCO1234M1Z5",
    billingAddress: "Ola Campus, Lavelle Road, Bengaluru 560001",
    state: "Karnataka", contactName: "Ankit Sharma",
    contactEmail: "projects@ola.com", contactPhone: "+91 98450 11234",
  },
];

export const PROGRAMMES: Programme[] = [
  {
    id: "pg-ola-fy26", clientId: "c-ola", name: "Ola Showroom Roll-out FY26",
    defaultKitId: "k-ola-std", startDate: day(-180), targetProjects: 50,
  },
];

export const VENDORS: Vendor[] = [
  { id: "v-sharma", name: "Mehta Mobility Partner", type: "FRANCHISEE", clientId: "c-ola", city: "Kochi", state: "Kerala", gstin: "32AABCS4567K1Z2", contactName: "Rahul Mehta", contactPhone: "+91 99860 22110" },
  { id: "v-woodcraft", name: "Woodcraft Interiors", type: "SUPPLIER", city: "Hosur", state: "Tamil Nadu", gstin: "33AAECW7788L1Z9", contactName: "S. Murugan", contactPhone: "+91 94430 55120" },
  { id: "v-inst-south", name: "Southern Fitout Crew", type: "INSTALLATION", city: "Kochi", state: "Kerala", contactName: "Imran Shaikh", contactPhone: "+91 97440 88231", scorecard: { onTimePct: 88, damagePct: 4.2, snagCount: 11, reworkCostCaused: 18400 } },
  { id: "v-inst-north", name: "Delhi Interiors Co", type: "INSTALLATION", city: "New Delhi", state: "Delhi", contactName: "Harpreet Singh", contactPhone: "+91 98110 44520", scorecard: { onTimePct: 71, damagePct: 9.8, snagCount: 27, reworkCostCaused: 62300 } },
  { id: "v-inst-west", name: "Pune Fitout Partners", type: "INSTALLATION", city: "Pune", state: "Maharashtra", contactName: "Sagar Patil", contactPhone: "+91 90280 71140", scorecard: { onTimePct: 94, damagePct: 2.1, snagCount: 5, reworkCostCaused: 6200 } },
  { id: "v-tci", name: "TCI Freight", type: "TRANSPORTER", city: "Bengaluru", state: "Karnataka", contactName: "Booking desk", contactPhone: "+91 80 4123 7000" },
];

/** Starting stock is intentionally small so the reservation/reorder flow is visible. */
export const INVENTORY: InventoryItem[] = [
  { id: "stock-1", productId: "p-su-a", warehouse: "Bengaluru factory", availableQty: 8, reservedQty: 2, reorderLevel: 4, updatedAt: day(-1) },
  { id: "stock-2", productId: "p-chair-vc", warehouse: "Bengaluru factory", availableQty: 14, reservedQty: 6, reorderLevel: 10, updatedAt: day(-1) },
  { id: "stock-3", productId: "p-sofa-2", warehouse: "Bengaluru factory", availableQty: 2, reservedQty: 1, reorderLevel: 3, updatedAt: day(-2) },
];

/* --------------------------------------------------------------- projects */

interface ProjectSpec {
  id: string; code: string; city: string; state: string; pincode: string;
  address: string; contactName: string; contactPhone: string;
  teamId: string; startOffset: number; targetOffset: number;
  /** status pattern applied across the kit lines */
  pattern: ItemStatus[];
  readinessGaps?: Array<keyof Project["siteReadiness"]>;
}

const PROJECT_SPECS: ProjectSpec[] = [
  {
    id: "pr-kochi", code: "KP-2026-041", city: "Kochi", state: "Kerala", pincode: "682024",
    address: "Ground Floor, Lulu Marina Mall, Edappally", contactName: "Jestin Thomas",
    contactPhone: "+91 98470 33112", teamId: "v-inst-south",
    startOffset: -36, targetOffset: 4,
    pattern: ["INSTALLED", "INSTALLED", "INSTALLED", "INSTALLED", "RECEIVED_DAMAGED", "INSTALL_IN_PROGRESS", "INSTALLED"],
  },
  {
    id: "pr-delhi", code: "KP-2026-046", city: "New Delhi", state: "Delhi", pincode: "110085",
    address: "Shop 12, Rohini Sector 10 Market", contactName: "Naveen Kumar",
    contactPhone: "+91 98110 77231", teamId: "v-inst-north",
    startOffset: -22, targetOffset: 12,
    pattern: ["DELIVERED_AT_SITE", "IN_TRANSIT", "IN_TRANSIT", "PACKED", "PACKED", "QC_PENDING", "IN_PRODUCTION"],
    readinessGaps: ["flooring"],
  },
  {
    id: "pr-pune", code: "KP-2026-049", city: "Pune", state: "Maharashtra", pincode: "411038",
    address: "Unit 4, Kothrud Commercial Complex", contactName: "Mahesh Joshi",
    contactPhone: "+91 90280 11987", teamId: "v-inst-west",
    startOffset: -12, targetOffset: 26,
    pattern: ["PO_PLACED", "IN_PRODUCTION", "IN_PRODUCTION", "PO_PLACED", "APPROVED", "APPROVED", "IN_PRODUCTION"],
    readinessGaps: ["civil", "flooring", "power"],
  },
  {
    id: "pr-indore", code: "KP-2026-052", city: "Indore", state: "Madhya Pradesh", pincode: "452010",
    address: "C-Block, Vijay Nagar High Street", contactName: "Rohit Agarwal",
    contactPhone: "+91 94250 66301", teamId: "v-inst-west",
    startOffset: -3, targetOffset: 41,
    pattern: ["APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED", "APPROVED"],
    readinessGaps: ["civil", "flooring", "power", "truckAccess", "storage"],
  },
];

const kit = KITS[0];

function buildItems(spec: ProjectSpec): BoqItem[] {
  return kit.lines.map((line, idx) => {
    const product = PRODUCTS.find((p) => p.id === line.productId)!;
    const status = spec.pattern[idx % spec.pattern.length];
    const qty = line.defaultQty;
    const reached = (s: ItemStatus) =>
      ["DISPATCHED", "IN_TRANSIT", "DELIVERED_AT_SITE", "RECEIVED_OK", "RECEIVED_DAMAGED",
       "INSTALL_ASSIGNED", "INSTALL_IN_PROGRESS", "INSTALLED", "HANDED_OVER"].includes(s);

    return {
      id: `${spec.id}-i${idx + 1}`,
      projectId: spec.id,
      productId: product.id,
      name: line.name,
      spec: line.spec,
      hsnCode: product.hsnCode,
      unit: product.unit,
      qty,
      status,
      statusUpdatedAt: day(-(3 + (idx * 2) % 11)),
      sourcingType: idx % 3 === 0 ? "MAKE" : "BUY",
      vendorId: idx % 3 === 0 ? undefined : idx % 2 ? "v-sharma" : "v-woodcraft",
      poNumber: idx % 3 === 0 ? undefined : `PO-${1180 + idx}`,
      eta: day(spec.targetOffset - 10),
      qcAttempts: status === "QC_PENDING" ? 1 : 0,
      qtyDispatched: reached(status) ? qty : 0,
      qtyReceived: reached(status) ? (status === "RECEIVED_DAMAGED" ? qty - 1 : qty) : 0,
      qtyInstalled: status === "INSTALLED" ? qty : status === "INSTALL_IN_PROGRESS" ? Math.floor(qty / 2) : 0,
      zone: line.zone,
      pricing: {
        basePrice: product.defaultBasePrice,
        sellingPrice: product.defaultSellingPrice,
        finalPrice: Math.round(product.defaultSellingPrice * 0.96),
        discountReason: "Programme rate — 4% volume discount",
        allocatedTransport: Math.round(product.defaultBasePrice * qty * 0.045),
        allocatedInstall: Math.round(product.defaultBasePrice * qty * 0.03),
        reworkCost: 0,
        internalNotes: idx === 4 ? "Chrome frame supply has been tight since August." : undefined,
      },
    };
  });
}

const allItems: BoqItem[] = PROJECT_SPECS.flatMap(buildItems);

// The Kochi chair line carries the rework from the cracked leg (ticket t-1).
const kochiChairs = allItems.find((i) => i.id === "pr-kochi-i5")!;
kochiChairs.pricing.reworkCost = 3200;

function buildProject(spec: ProjectSpec): Project {
  const items = allItems.filter((i) => i.projectId === spec.id);
  const money = rollUp(items);
  const readiness: Project["siteReadiness"] = {
    civil: true, flooring: true, power: true, truckAccess: true, storage: true, contact: true,
  };
  (spec.readinessGaps ?? []).forEach((k) => { readiness[k] = false; });

  const openSnagCount = SNAGS.filter((s) => s.projectId === spec.id && s.status === "OPEN").length;
  const status = deriveProjectStatus(items.map((i) => i.status), { openSnags: openSnagCount });

  return {
    id: spec.id,
    code: spec.code,
    name: `Ola Showroom — ${spec.city}`,
    clientId: "c-ola",
    franchiseeId: spec.id === "pr-kochi" ? "v-sharma" : undefined,
    programmeId: "pg-ola-fy26",
    site: {
      address: spec.address, city: spec.city, state: spec.state, pincode: spec.pincode,
      contactName: spec.contactName, contactPhone: spec.contactPhone,
    },
    status,
    statusUpdatedAt: day(-2),
    boqMode: "STANDARD",
    standardKitId: "k-ola-std",
    franchiseeApprovedAt: day(-20),
    advanceRequiredPct: 50,
    advanceReceivedPct: spec.id === "pr-kochi" ? 50 : 25,
    startDate: day(spec.startOffset),
    targetCompletionDate: day(spec.targetOffset),
    installationTeamId: spec.teamId,
    siteReadiness: readiness,
    retentionPct: 5,
    dlpMonths: 12,
    totals: {
      itemCount: items.length,
      installedCount: items.filter((i) => i.status === "INSTALLED").length,
      value: money.revenue,
      baseCost: money.baseCost,
      landedCost: money.landedCost,
      reworkCost: money.rework,
      quotedMargin: money.quotedMargin,
      realMargin: money.realMargin,
      marginPct: money.marginPct,
    },
    flags: {
      overdue: spec.targetOffset < 0,
      stale: spec.id === "pr-delhi",
      hasOpenTickets: TICKETS.some((t) => t.projectId === spec.id && t.status !== "RESOLVED"),
      hasCriticalSnags: SNAGS.some((s) => s.projectId === spec.id && s.status === "OPEN" && s.severity === "CRITICAL"),
    },
  };
}

/* ---------------------------------------------------------------- tickets */

export const TICKETS: Ticket[] = [
  {
    id: "t-1", projectId: "pr-kochi", type: "DAMAGE", itemId: "pr-kochi-i5",
    qtyAffected: 1, cause: "TRANSIT", photos: ["chair-leg-1.jpg", "chair-leg-2.jpg", "crate-KCH-07.jpg"],
    reportedBy: "Imran Shaikh", reportedAt: day(-13),
    decision: "REPLACE", replacementItemId: "pr-kochi-i5r", costImpact: 3200,
    status: "IN_PROGRESS", note: "Leg cracked at the weld. Crate corner crushed — claim filed with TCI.",
  },
  {
    id: "t-2", projectId: "pr-delhi", type: "SHORTAGE", itemId: "pr-delhi-i1",
    qtyAffected: 1, cause: "SHORT_SUPPLY", photos: ["grn-delhi-01.jpg"],
    reportedBy: "Harpreet Singh", reportedAt: day(-2),
    costImpact: 0, status: "OPEN", note: "Packing list shows 1 counter, nothing arrived on the vehicle.",
  },
];

/* ------------------------------------------------------------------ snags */

export const SNAGS: Snag[] = [
  {
    id: "s-1", projectId: "pr-kochi", itemId: "pr-kochi-i1",
    description: "Counter laminate edge lifting on the customer-facing side.",
    severity: "MINOR", photos: ["snag-counter.jpg"], raisedBy: "Ankit Sharma (Ola)",
    raisedAt: day(-4), assignedTo: "v-inst-south", dueDate: day(1), status: "OPEN",
  },
  {
    id: "s-2", projectId: "pr-kochi", itemId: "pr-kochi-i6",
    description: "Two executive chairs delivered in black, spec says Ola grey.",
    severity: "MAJOR", photos: ["snag-chairs.jpg"], raisedBy: "Ankit Sharma (Ola)",
    raisedAt: day(-3), assignedTo: "v-inst-south", dueDate: day(2), status: "OPEN",
  },
  {
    id: "s-3", projectId: "pr-kochi", description: "Storage unit levelling feet not adjusted, unit rocks.",
    severity: "MINOR", photos: [], raisedBy: "Imran Shaikh", raisedAt: day(-9),
    closedAt: day(-8), status: "CLOSED",
  },
];

/* --------------------------------------------------------- crates & moves */

export const CRATES: Crate[] = [
  { id: "cr-1", projectId: "pr-kochi", crateCode: "KCH-07", itemIds: ["pr-kochi-i5", "pr-kochi-i6"], weightKg: 96, photos: ["pack-1.jpg", "pack-2.jpg", "pack-3.jpg", "pack-4.jpg"], packedBy: "Priya Nair", packedAt: day(-18), consignmentId: "cn-1", receivedAt: day(-13), receiptPhotos: ["grn-1.jpg"] },
  { id: "cr-2", projectId: "pr-kochi", crateCode: "KCH-08", itemIds: ["pr-kochi-i1", "pr-kochi-i7"], weightKg: 210, photos: ["pack-5.jpg", "pack-6.jpg"], packedBy: "Priya Nair", packedAt: day(-18), consignmentId: "cn-1", receivedAt: day(-13), receiptPhotos: ["grn-2.jpg"] },
  { id: "cr-3", projectId: "pr-delhi", crateCode: "DEL-03", itemIds: ["pr-delhi-i4", "pr-delhi-i5"], weightKg: 145, photos: [], packedBy: "Priya Nair", packedAt: day(-1), receiptPhotos: [] },
];

export const CONSIGNMENTS: Consignment[] = [
  {
    id: "cn-1", projectId: "pr-kochi", crateIds: ["cr-1", "cr-2"], challanId: "dc-1",
    ewayBillNo: "381029447712", ewayBillValidTill: day(-14),
    transporterName: "TCI Freight", vehicleNo: "KA01AB1234", driverPhone: "+91 99001 22334",
    lrNumber: "LR-2291", dispatchedAt: day(-17), eta: day(-14), deliveredAt: day(-13),
    taxableValue: 184_000, interState: true, status: "DELIVERED",
  },
  {
    id: "cn-2", projectId: "pr-delhi", crateIds: ["cr-3"],
    transporterName: "TCI Freight", vehicleNo: "", lrNumber: "",
    eta: day(3), taxableValue: 126_400, interState: true, status: "READY",
  },
];

/* --------------------------------------------------------------- finance */

export const INVOICES: Invoice[] = [
  {
    id: "inv-1", number: "KP/INV/26-27/0118", projectId: "pr-kochi", clientId: "c-ola",
    placeOfSupplyState: "Kerala",
    lines: [{ description: "Ola Kochi — milestone 1, on dispatch", hsn: "9403", qty: 1, rate: 384_000, taxableValue: 384_000, gstRate: 18 }],
    taxMode: "IGST", cgst: 0, sgst: 0, igst: 69_120, taxableValue: 384_000, total: 453_120,
    retentionPct: 5, retentionAmount: 19_200, netPayable: 433_920,
    challanIds: ["dc-1"], issuedAt: day(-16), dueDate: day(14),
    status: "PART_PAID", amountReceived: 250_000,
  },
  {
    id: "inv-2", number: "KP/INV/26-27/0121", projectId: "pr-delhi", clientId: "c-ola",
    placeOfSupplyState: "Delhi",
    lines: [{ description: "Ola Delhi Rohini — advance 30%", hsn: "9403", qty: 1, rate: 198_000, taxableValue: 198_000, gstRate: 18 }],
    taxMode: "IGST", cgst: 0, sgst: 0, igst: 35_640, taxableValue: 198_000, total: 233_640,
    retentionPct: 5, retentionAmount: 9_900, netPayable: 223_740,
    challanIds: [], issuedAt: day(-20), dueDate: day(-5),
    status: "ISSUED", amountReceived: 0,
  },
];

/* --------------------------------------------------------------- activity */

export const PROGRESS_LOGS: ProgressLog[] = [
  { id: "pl-1", projectId: "pr-kochi", note: "Counter and back-office storage installed. Consultation zone started.", photos: ["site-1.jpg", "site-2.jpg"], by: "Imran Shaikh", at: day(-6), zone: "Front" },
  { id: "pl-2", projectId: "pr-kochi", note: "Replacement chair received and fitted. Zone complete apart from the two grey chairs.", photos: ["site-3.jpg"], by: "Imran Shaikh", at: day(-3), zone: "Consultation" },
  { id: "pl-3", projectId: "pr-delhi", note: "Site flooring still under way, contractor says 3 more days. Holding the vehicle.", photos: ["site-delhi-1.jpg"], by: "Harpreet Singh", at: day(-2) },
];

export const COMMENTS: Comment[] = [
  { id: "cm-1", projectId: "pr-delhi", body: "Why is this one stale for 9 days? Flooring is the client's scope — has anyone written to Ankit in writing?", byUid: "u-super", byName: "R. Venkatesh", byRole: "SUPER_ADMIN", at: day(-1) },
  { id: "cm-2", projectId: "pr-delhi", body: "Mailed Ola on the 12th and again yesterday. Logging it under approvals so the delay sits on record.", byUid: "u-admin", byName: "Priya Nair", byRole: "ADMIN", at: day(-1) },
  { id: "cm-3", projectId: "pr-kochi", body: "Transporter claim for the cracked chair is filed. TCI have the crate photos.", byUid: "u-admin", byName: "Priya Nair", byRole: "ADMIN", at: day(-11) },
];

/* ------------------------------------------------------------- assembled */

export const PROJECTS: Project[] = PROJECT_SPECS.map(buildProject);
export const BOQ_ITEMS: BoqItem[] = allItems;

export function progressFor(projectId: string): number {
  return projectProgress(
    BOQ_ITEMS.filter((i) => i.projectId === projectId).map((i) => i.status)
  );
}
