/**
 * Clean first-run workspace.
 *
 * This is intentionally empty: Kurchi starts with its real catalogue, BOQs,
 * showrooms and operational records created through the application. Only the
 * six clearly-labelled training logins are supplied to make role testing easy.
 */

import type {
  AppUser, BoqItem, Client, Comment, Consignment, Crate, InventoryItem, Invoice,
  Kit, Product, Programme, Project, ProgressLog, Snag, Ticket, Vendor,
} from "@/types";

export const NOW = new Date();

/**
 * Demo sign-in accounts. The browser demo accepts password `123456` for each.
 * Firebase copies are provisioned separately so these same addresses can later
 * use real Firebase email sign-in after Email/Password is enabled in Console.
 */
export const USERS: AppUser[] = [
  { uid: "demo-admin", email: "admin@kuruchi.com", name: "Kurchi Admin", role: "ADMIN", active: true },
  { uid: "demo-super-admin", email: "superadmin@kuruchi.com", name: "Kurchi Super Admin", role: "SUPER_ADMIN", active: true },
  { uid: "demo-installation", email: "installation@kuruchi.com", name: "Installation Team", role: "INSTALLATION", teamId: "demo-installation-team", active: true },
  { uid: "demo-accounts", email: "accounts@kuruchi.com", name: "Accounts Team", role: "ACCOUNTS", active: true },
  { uid: "demo-ola", email: "ola@kuruchi.com", name: "Ola Team", role: "CLIENT", clientId: "demo-ola", active: true },
  { uid: "demo-franchisee", email: "franchisee@kuruchi.com", name: "Franchisee Owner", role: "VENDOR", vendorId: "demo-franchisee", active: true },
];

export const CATEGORIES: string[] = [];
export const PRODUCTS: Product[] = [];
export const KITS: Kit[] = [];
export const CLIENTS: Client[] = [];
export const PROGRAMMES: Programme[] = [];
export const VENDORS: Vendor[] = [];
export const PROJECTS: Project[] = [];
export const BOQ_ITEMS: BoqItem[] = [];
export const CRATES: Crate[] = [];
export const CONSIGNMENTS: Consignment[] = [];
export const TICKETS: Ticket[] = [];
export const SNAGS: Snag[] = [];
export const PROGRESS_LOGS: ProgressLog[] = [];
export const COMMENTS: Comment[] = [];
export const INVOICES: Invoice[] = [];
export const INVENTORY: InventoryItem[] = [];

export function progressFor(_projectId: string): number {
  return 0;
}
