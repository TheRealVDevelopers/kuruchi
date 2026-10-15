const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const React = require("../../node_modules/react");
const { renderToStaticMarkup } = require("../../node_modules/react-dom/server");
function compile(file) { return ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 } }).outputText; }
function load(file, imports = {}, extra = {}, suffix = "") {
  const exports = {};
  vm.runInNewContext(compile(file) + suffix, { exports, require: (name) => imports[name] ?? {}, ...extra });
  return exports;
}
const money = load("lib/money.ts");
const rules = load("lib/rules.ts");
const admin = { role: "ADMIN", uid: "admin", name: "Admin" };
function owners() {
  const owner = { id: "owner", type: "FRANCHISEE", name: "Old — Franchisee", contactName: "Old", contactPhone: "9876543210", city: "Bengaluru", state: "Karnataka", clientId: "client" };
  const db = { vendors: [owner], projects: [], users: [], purchaseOrders: [], vendorBills: [] };
  let writes = 0;
  const api = load("data/actions.ts", { "./store": { db, commit: () => { writes++; }, audit: () => {} } });
  return { db, api, owner, get writes() { return writes; } };
}
test("Admin edits owner details in place while retaining showroom assignments", () => {
  const h = owners(); h.db.projects.push({ id: "p", franchiseeId: "owner" });
  h.api.saveFranchiseeOwner(admin, { ...h.owner, contactName: " New Name ", email: "new@example.com" });
  assert.equal(h.db.vendors.length, 1); assert.equal(h.db.vendors[0].contactName, "New Name");
  assert.equal(h.db.vendors[0].email, "new@example.com"); assert.equal(h.db.projects[0].franchiseeId, "owner");
});
test("owner deletion requires Admin and protects linked showrooms, logins and billing history", () => {
  const h = owners();
  assert.throws(() => h.api.deleteFranchiseeOwner({ role: "CLIENT" }, "owner"), /Only Admin/);
  assert.throws(() => h.api.saveFranchiseeOwner({ role: "CLIENT" }, h.owner), /Only Admin/);
  for (const [collection, reference] of [["projects", { franchiseeId: "owner" }], ["users", { vendorId: "owner" }], ["purchaseOrders", { vendorId: "owner" }], ["vendorBills", { vendorId: "owner" }]]) {
    h.db[collection].push(reference); const before = JSON.stringify(h.db);
    assert.throws(() => h.api.deleteFranchiseeOwner(admin, "owner")); assert.equal(JSON.stringify(h.db), before); h.db[collection] = [];
  }
  h.api.deleteFranchiseeOwner(admin, "owner"); assert.equal(h.db.vendors.length, 0); assert.equal(h.writes, 1);
});

const jsx = { "react": React, "react/jsx-runtime": require("../../node_modules/react/jsx-runtime") };

test("Accounts shows newly created owners without projects and reflects Admin edits and removal", () => {
  const h = owners(); h.db.vendors = [];
  const { repo } = load("data/repo.ts", { "./store": { db: h.db } });
  let user = { role: "ACCOUNTS" };
  const { AccountsFranchiseeOwners } = load("features/accounts/components/AccountsFranchiseeOwners.tsx", { ...jsx,
    "@/features/auth/AuthContext": { useAuth: () => ({ user }) },
    "@/data/store": { useDb: () => {} }, "@/data/repo": { repo },
    "@/lib/showroom": load("lib/showroom.ts"),
  });
  const render = () => renderToStaticMarkup(React.createElement(AccountsFranchiseeOwners));
  assert.match(render(), /No franchisee owners added yet/);
  h.api.saveFranchiseeOwner(admin, { ...h.owner, contactName: "New Owner", email: "owner@example.com" });
  h.db.vendors.push({ id: "supplier", type: "SUPPLIER", name: "Unrelated supplier" });
  assert.equal(h.db.projects.length, 0);
  const html = render();
  for (const text of ["New Owner", "9876543210", "owner@example.com", "Bengaluru", "Karnataka"]) assert.ok(html.includes(text));
  assert.doesNotMatch(html, /Unrelated supplier|<button/);
  h.api.saveFranchiseeOwner(admin, { ...h.db.vendors[0], contactName: "Updated Owner" });
  assert.match(render(), /Updated Owner/); assert.doesNotMatch(render(), /New Owner/);
  h.api.deleteFranchiseeOwner(admin, "owner");
  assert.match(render(), /No franchisee owners added yet/);
  user = { role: "CLIENT" }; assert.equal(render(), "");
});
test("client portal displays the signed-in client's name, phone and email only", () => {
  const user = { role: "CLIENT", clientId: "mine", name: "My Client", phone: "9876543210", email: "mine@example.com" };
  const api = load("features/portal/pages/MyShowroomsPage.tsx", { ...jsx, "@/features/auth/AuthContext": { useAuth: () => ({ user }) }, "@/data/store": { useDb: () => {} }, "@/data/repo": { repo: { clientById: (id) => { assert.equal(id, "mine"); return null; }, projects: () => [] } }, "react-router-dom": { Link: (props) => React.createElement("a", { href: props.to }, props.children) }, "lucide-react": { ArrowRight: () => null, BellRing: () => null, Building2: () => null, CheckCircle2: () => null, MapPin: () => null, Plus: () => null }, "@/components/app/Shell": { EmptyState: () => null } });
  const html = renderToStaticMarkup(React.createElement(api.default));
  assert.match(html, /My Client/); assert.match(html, /9876543210/); assert.match(html, /mine@example.com/); assert.match(html, /Your client details/);
});

test("printed tax invoices show actual challan numbers, advances, receipts, credits and balance", () => {
  let html = "";
  const invoice = { id: "inv", projectId: "p", number: "KP/INV/1", issuedAt: "2026-10-15", dueDate: "2026-11-15", taxMode: "CGST_SGST", cgst: 9, sgst: 9, igst: 0, taxableValue: 100, total: 118, netPayable: 118, retentionAmount: 0, advanceApplied: 20, amountReceived: 30, challanIds: ["internal-dc-id"], lines: [{ description: "<script>bad</script>", hsn: "9403", qty: 1, rate: 100, taxableValue: 100 }] };
  const api = load("lib/printInvoice.ts", { "@/data/actions": { requireSellerProfile: () => ({ legalName: "Kurchi", gstin: "GST" }) }, "@/lib/money": money, "@/data/repo": { repo: { challans: () => [{ id: "internal-dc-id", number: "KP/DC/2026/1" }], creditNotes: () => [{ amount: 8 }] } } }, { window: { open: () => ({ document: { write: (value) => { html = value; }, close: () => {} } }) } });
  assert.equal(api.printTaxInvoice(invoice, undefined, { name: "Correct customer", contactPhone: "9876543210", contactEmail: "customer@example.com" }), true);
  assert.match(html, /KP\/DC\/2026\/1/); assert.doesNotMatch(html, /internal-dc-id/);
  assert.match(html, /Advance applied<\/td><td[^>]*>−₹20\.00/);
  assert.match(html, /Other payments received<\/td><td[^>]*>−₹10\.00/);
  assert.match(html, /Balance due<\/td><td[^>]*>₹80\.00/);
  assert.match(html, /Correct customer/); assert.match(html, /customer@example.com/); assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
});

test("invoice project selection recovers when projects load after opening the form", () => {
  let hook = 0;
  const project = { id: "p", name: "Loaded showroom", clientId: "customer", retentionPct: 0, site: { state: "Karnataka", address: "Site", city: "Bengaluru", pincode: "560001" } };
  const api = load("features/accounts/pages/FinancePages.tsx", { ...jsx, "react": { ...React, useState: (initial) => { hook++; return React.useState(hook === 1 ? "" : initial); } }, "@/data/repo": { repo: { clientById: () => ({ name: "Customer" }), itemsRaw: () => [{ id: "i", name: "Chair", qty: 1, hsnCode: "9403", pricing: { finalPrice: 100 } }], sellerProfile: () => ({ state: "Karnataka" }) } }, "@/lib/money": money, "@/lib/rules": rules }, {}, "\nexports.TestForm = RaiseInvoiceForm;");
  const html = renderToStaticMarkup(React.createElement(api.TestForm, { projects: [project], onSubmit: () => {} }));
  assert.match(html, /Customer/); assert.match(html, /Chair/);
  assert.doesNotMatch(html.match(/<button[^>]*>Issue GST invoice<\/button>/)?.[0], /\sdisabled=/);
  assert.match(html, /step="any"/);
});
