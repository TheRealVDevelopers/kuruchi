const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");

function load(file, imports = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(source, { exports, require: (name) => imports[name] ?? {} });
  return exports;
}
const account = { uid: "accounts", name: "Accounts Team", role: "ACCOUNTS", active: true };
const oldNumber = "KUR/I/26-27/0123";
function harness() {
  const invoice = { id: "invoice1", projectId: "project1", number: oldNumber, netPayable: 118, amountReceived: 118, status: "PAID", lines: [{ description: "Chair", qty: 1, rate: 100 }], advanceApplied: 118 };
  const db = { invoices: [invoice, { id: "invoice2", projectId: "other", number: "KUR/I/26-27/0124", previousNumbers: ["KUR/I/26-27/0100"] }],
    projects: [{ id: "project1", franchiseeId: "owner" }, { id: "other", franchiseeId: "other" }],
    payments: [{ id: "payment1", invoiceId: "invoice1", amount: 118 }],
    creditNotes: [{ id: "credit1", invoiceId: "invoice1", projectId: "project1", amount: 0 }],
    consignments: [{ id: "shipment1", projectId: "project1", invoiceId: "invoice1", ewayBillNo: "123456789012" }],
    challans: [{ id: "dc1", projectId: "project1", number: "DC/1" }], documents: [], documentNumberFloor: { INV: 124, DC: 141 },
    notifications: [{ detail: `Bill ${oldNumber} is ready.` }, { detail: `Another invoice ${oldNumber}4 is unrelated.` }], audit: [],
  };
  let writes = 0;
  const imports = { "./store": { db, commit: () => { writes++; }, audit: (_actor, entity, action, detail) => db.audit.push({ entity, action, detail }) } };
  const api = load("data/actions.ts", imports);
  const { repo } = load("data/repo.ts", imports);
  return { api, db, invoice, repo, get writes() { return writes; } };
}

test("renumbering preserves every financial ID, payment and amount while both portals read the new number", () => {
  const h = harness();
  const before = JSON.stringify({ payments: h.db.payments, credits: h.db.creditNotes, shipments: h.db.consignments, challans: h.db.challans });
  h.api.renameInvoice(account, h.invoice.id, " kur/i/26-27/0200 ", oldNumber);
  assert.equal(h.invoice.number, "KUR/I/26-27/0200"); assert.equal(h.invoice.id, "invoice1");
  assert.equal(h.invoice.netPayable, 118); assert.equal(h.invoice.amountReceived, 118); assert.equal(h.invoice.status, "PAID");
  assert.equal(JSON.stringify({ payments: h.db.payments, credits: h.db.creditNotes, shipments: h.db.consignments, challans: h.db.challans }), before);
  assert.equal(h.repo.invoices()[0].number, "KUR/I/26-27/0200");
  assert.equal(h.repo.franchiseeBilling({ role: "VENDOR", active: true, vendorId: "owner" })[0].invoices[0].number, "KUR/I/26-27/0200");
  assert.match(h.db.notifications[0].detail, /0200/); assert.equal(h.db.notifications[1].detail, `Another invoice ${oldNumber}4 is unrelated.`);
  assert.equal(h.db.documentNumberFloor.INV, 200); assert.ok(h.invoice.previousNumbers.includes(oldNumber));
  assert.equal(h.db.audit.length, 1); assert.match(h.db.audit[0].detail, /0123.*0200/); assert.equal(h.writes, 1);
});

test("duplicate, reserved, stale or invalid number edits fail without any mutation", () => {
  for (const [value, expected] of [["KUR/I/26-27/0124", oldNumber], ["KUR/I/26-27/0100", oldNumber], ["", oldNumber], ["<script>", oldNumber], ["X".repeat(65), oldNumber], ["INV/999999999999999999999", oldNumber], ["NEW/001", "STALE/001"]]) {
    const h = harness(), before = JSON.stringify(h.db);
    assert.throws(() => h.api.renameInvoice(account, h.invoice.id, value, expected));
    assert.equal(JSON.stringify(h.db), before); assert.equal(h.writes, 0);
  }
});

test("only an active Accounts user can rename and retries do not duplicate the audit", () => {
  const h = harness();
  for (const actor of [{ ...account, active: false }, ...["ADMIN", "CLIENT", "VENDOR", "INSTALLATION", "SUPER_ADMIN"].map((role) => ({ ...account, role }))]) {
    assert.throws(() => h.api.renameInvoice(actor, h.invoice.id, "NEW/001", oldNumber));
  }
  assert.equal(h.writes, 0);
  h.api.renameInvoice(account, h.invoice.id, "NEW/001", oldNumber);
  h.api.renameInvoice(account, h.invoice.id, "NEW/001", oldNumber);
  assert.equal(h.writes, 1); assert.equal(h.db.audit.length, 1);
  assert.equal(h.db.documentNumberFloor.INV, 124);
});
