const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
function compile(file) { return ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src", file), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; }
const statuses = {}; vm.runInNewContext(compile("lib/statuses.ts"), { exports: statuses });
const source = compile("data/actions.ts");
function setup() {
  const db = { projects: [{ id: "p", initialPayment: { status: "VERIFIED" } }], items: Array.from({ length: 16 }, (_, i) => ({ id: "i" + i, name: "Item " + i, projectId: "p", status: "APPROVED", qty: 1, qtyDispatched: 0 })) };
  let writes = 0;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => name === "./store" ? { db, commit: () => { writes++; }, recomputeProject: () => {}, audit: () => {} } : name === "@/lib/statuses" ? statuses : {}, });
  return { db, api: exports, get writes() { return writes; } };
}
test("six of sixteen selected items move with exactly one save", () => {
  const h = setup(); const ids = h.db.items.slice(0, 6).map(item => item.id);
  const result = h.api.setManyStatuses({ role: "ADMIN" }, ids, "IN_PRODUCTION");
  assert.equal(result.moved.length, 6); assert.equal(h.writes, 1);
  assert.equal(h.db.items.slice(0, 6).every(item => item.status === "IN_PRODUCTION"), true);
  assert.equal(h.db.items.slice(6).every(item => item.status === "APPROVED"), true);
});
test("invalid and unverified moves do not write or bypass the payment gate", () => {
  const h = setup(); h.db.projects[0].initialPayment.status = "ON_HOLD";
  const result = h.api.setManyStatuses({ role: "ADMIN" }, ["i0", "i1"], "IN_PRODUCTION");
  assert.equal(result.moved.length, 0); assert.equal(result.notMoved.length, 2); assert.equal(h.writes, 0);
  assert.equal(h.db.items[0].status, "APPROVED");
});
test("mixed selections report blocked rows and save valid changes only once", () => {
  const h = setup(); h.db.items[1].status = "QC_PENDING";
  const result = h.api.setManyStatuses({ role: "ADMIN" }, ["i0", "i1"], "IN_PRODUCTION");
  assert.equal(result.moved.length, 1); assert.equal(result.notMoved.length, 1); assert.equal(h.writes, 1);
  assert.equal(h.db.items[1].status, "QC_PENDING");
});
test("non-Admin cannot bulk-update commercial production states", () => {
  const h = setup(); const result = h.api.setManyStatuses({ role: "CLIENT" }, ["i0"], "IN_PRODUCTION");
  assert.equal(result.moved.length, 0); assert.equal(h.writes, 0);
});
