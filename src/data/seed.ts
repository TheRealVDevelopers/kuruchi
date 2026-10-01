/**
 * Clean first-run workspace.
 *
 * This is intentionally empty: Kurchi starts with its real catalogue, BOQs,
 * showrooms, users and operational records come from the real workspace.
 */

import type {
  AppUser, BoqItem, Client, Comment, Consignment, Crate, InventoryItem, Invoice,
  Kit, Product, Programme, Project, ProgressLog, Snag, Ticket, Vendor,
} from "@/types";

export const NOW = new Date();

export const USERS: AppUser[] = [];

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
