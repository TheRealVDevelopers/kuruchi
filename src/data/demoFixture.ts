import type { AppUser, Client, Kit, Product, Programme, Role, SellerProfile, Vendor } from "@/types";

/** Fictional master records only. Every showroom must go through the actual UI. */
export function demoUser(role: Role, vendorId?: string): AppUser {
  return {
    uid: `local-demo-${role.toLowerCase()}`, role, active: true,
    name: `Demo ${role === "CLIENT" ? "Ola" : role === "VENDOR" ? "Franchisee" : role.replace("_", " ")}`,
    email: `${role.toLowerCase()}@example.test`,
    ...(role === "CLIENT" ? { clientId: "local-demo-ola" } : {}),
    ...(role === "INSTALLATION" ? { teamId: "local-demo-crew" } : {}),
    ...(role === "VENDOR" ? { vendorId: vendorId ?? "local-demo-owner" } : {}),
  };
}

export function demoMasters() {
  const products: Product[] = [
    ["storage", "General Storage", 12000, 8000, 1],
    ["desk", "Billing Desk", 18000, 12000, 1],
    ["chair", "Staff Chair", 3000, 1800, 2],
  ].map(([id, name, price, cost]) => ({
    id: `local-demo-${id}`, name: String(name), slug: String(id), category: "Showroom furniture", orderCategory: "SALES",
    shortSpec: "Walkthrough sample — not a live order", description: "Local test catalogue item", specs: {},
    hsnCode: "9403", unit: "nos", images: [], startingPrice: Number(price), defaultBasePrice: Number(cost),
    defaultSellingPrice: Number(price), leadTimeDays: 7, active: true,
  }));
  const kit: Kit = { id: "local-demo-kit", name: "Showroom Sales BOQ — Sample", description: "Three products, four units. Local recording only.", version: 1, active: true, mode: "STANDARD", lines: products.map((p) => ({ productId: p.id, name: p.name, spec: p.shortSpec, defaultQty: p.id.endsWith("chair") ? 2 : 1, zone: "Showroom" })) };
  const client: Client = { id: "local-demo-ola", name: "Ola — LOCAL TEST ONLY", gstin: "29ABCDE1234F1Z5", state: "Karnataka", billingAddress: "Demo billing address, Bengaluru 560001", contactName: "Demo Ola coordinator", contactEmail: "ola@example.test", contactPhone: "9000000001" };
  const programme: Programme = { id: "local-demo-rollout", clientId: client.id, name: "Recorded walkthrough", defaultKitId: kit.id, startDate: new Date().toISOString().slice(0, 10), targetProjects: 1 };
  const crew: Vendor = { id: "local-demo-crew", name: "Demo Installation Team", type: "INSTALLATION", city: "Bengaluru", state: "Karnataka", contactName: "Demo installer", contactPhone: "9000000002" };
  const sellerProfile: SellerProfile = { legalName: "Kurchi — LOCAL TEST ONLY", gstin: "29AAAAA0000A1Z5", pan: "AAAAA0000A", address: "Sample factory address, Bengaluru", state: "Karnataka", pincode: "560001", bankName: "Demo bank — no real payment", accountName: "Test account", accountNumber: "0000000000", ifsc: "TEST0000000", invoicePrefix: "DEMO" };
  return { products, kits: [kit], clients: [client], programmes: [programme], vendors: [crew], sellerProfile, users: (["CLIENT", "ACCOUNTS", "ADMIN", "INSTALLATION", "VENDOR", "SUPER_ADMIN"] as Role[]).map((role) => demoUser(role)) };
}
