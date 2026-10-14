const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const actions = fs.readFileSync(path.join(__dirname, "../../src/data/actions.ts"), "utf8");
const source = actions.slice(actions.indexOf("export function deleteClient("), actions.indexOf("export function blankClient("));
function harness() {
  const db = { clients: [{ id: "cl-1", name: "Unused client" }, { id: "cl-2", name: "Keep" }], projects: [], invoices: [], payments: [], programmes: [], vendors: [], users: [] };
  let commits = 0;
  const events = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports, db, RuleError: Error, audit: (...event) => events.push(event), commit: () => { commits++; } });
  return { db, events, api: exports, get commits() { return commits; } };
}
test("Admin can delete an unused client without changing other clients", () => {
  const h = harness(); h.api.deleteClient({ role: "ADMIN" }, "cl-1");
  assert.equal(h.db.clients.length, 1);
  assert.equal(h.db.clients[0].id, "cl-2");
  assert.equal(h.commits, 1);
  assert.equal(h.events[0][2], "VOID");
});
test("non-admin and missing-client deletion are rejected without writes", () => {
  const h = harness();
  assert.throws(() => h.api.deleteClient({ role: "CLIENT" }, "cl-1"), /Only Admin/);
  assert.throws(() => h.api.deleteClient({ role: "ADMIN" }, "missing"), /not found/);
  assert.equal(h.commits, 0);
});
test("linked work, finance, programmes, franchisees and logins prevent deletion", () => {
  for (const collection of ["projects", "invoices", "payments", "programmes", "vendors", "users"]) {
    const h = harness(); h.db[collection].push({ id: "linked", clientId: "cl-1" });
    assert.throws(() => h.api.deleteClient({ role: "ADMIN" }, "cl-1"), /linked to/);
    assert.equal(h.db.clients.length, 2);
    assert.equal(h.commits, 0);
  }
});
