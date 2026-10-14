const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");
const text = fs.readFileSync(path.join(__dirname, "../../src/data/actions.ts"), "utf8");
const source = text.slice(text.indexOf("export function verifyInitialPayment("), text.indexOf("export function releaseApprovedBoqToProduction("));
function setup() {
  const project = { id: "p", name: "Showroom", clientId: "ola", totals: { value: 1000 }, initialPayment: { status: "PENDING_VERIFICATION", amount: 200, percentage: 20, reference: "UTR" } };
  const db = { payments: [] }; const notifications = []; const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, db, RuleError: Error, requireProject: () => project, roundMoney: value => Math.round((value + Number.EPSILON) * 100) / 100, nextId: () => "receipt", now: () => "now", notify: (...n) => notifications.push(n), audit: () => {}, commit: () => {} });
  return { project, db, notifications, api: exports };
}
const accounts = { role: "ACCOUNTS", name: "Accounts" };
test("holding requires a reason and creates no receipt or Admin handoff", () => {
  const h = setup(); assert.throws(() => h.api.holdInitialPayment(accounts, "p", " "), /reason/);
  h.api.holdInitialPayment(accounts, "p", "Verify bank receipt");
  assert.equal(h.project.initialPayment.status, "ON_HOLD");
  assert.equal(h.project.initialPayment.holdReason, "Verify bank receipt");
  assert.equal(h.db.payments.length, 0); assert.equal(h.notifications[0][0], "CLIENT");
});
test("held payment can be approved exactly once", () => {
  const h = setup(); h.api.holdInitialPayment(accounts, "p", "Checking"); h.api.verifyInitialPayment(accounts, "p", true);
  assert.equal(h.project.initialPayment.status, "VERIFIED"); assert.equal(h.project.initialPayment.holdReason, undefined);
  assert.equal(h.db.payments.length, 1);
  assert.throws(() => h.api.verifyInitialPayment(accounts, "p", true), /no payment/);
  assert.equal(h.db.payments.length, 1);
});
test("denial requires a reason and keeps the request out of Admin", () => {
  const h = setup(); assert.throws(() => h.api.verifyInitialPayment(accounts, "p", false), /reason/);
  h.api.verifyInitialPayment(accounts, "p", false, "UTR does not match");
  assert.equal(h.project.initialPayment.status, "REJECTED"); assert.equal(h.db.payments.length, 0);
  assert.equal(h.notifications.some(n => n[0] === "ADMIN"), false);
});
test("non-Accounts users cannot hold or deny", () => {
  const h = setup(); assert.throws(() => h.api.holdInitialPayment({ role: "ADMIN" }, "p", "Hold"), /Only Accounts/);
  assert.throws(() => h.api.verifyInitialPayment({ role: "CLIENT" }, "p", false, "Deny"), /Only Accounts/);
});

const ola = { role: "CLIENT", clientId: "ola", name: "Ola" };
test("Ola corrects a denied payment on the same showroom and notifies Accounts", () => {
  const h = setup(); h.api.verifyInitialPayment(accounts, "p", false, "Wrong reference");
  h.api.resubmitInitialPayment(ola, "p", { amount: 300.5, reference: " Corrected UTR " });
  assert.equal(h.project.id, "p"); assert.equal(h.project.initialPayment.status, "PENDING_VERIFICATION");
  assert.equal(h.project.initialPayment.amount, 300.5); assert.equal(h.project.initialPayment.percentage, 30.05);
  assert.equal(h.project.initialPayment.reference, "Corrected UTR"); assert.equal(h.project.initialPayment.rejectionReason, undefined);
  assert.equal(h.db.payments.length, 0); assert.equal(h.notifications.at(-1)[0], "ACCOUNTS");
});
test("held claims can be corrected, but approved or accepted claims cannot", () => {
  const h = setup(); h.api.holdInitialPayment(accounts, "p", "Need proof");
  h.api.resubmitInitialPayment(ola, "p", { amount: 200, reference: "NEW" });
  assert.equal(h.project.initialPayment.holdReason, undefined);
  h.api.verifyInitialPayment(accounts, "p", true);
  assert.throws(() => h.api.resubmitInitialPayment(ola, "p", { amount: 1, reference: "NEW" }), /Only denied/);
  assert.equal(h.db.payments.length, 1);
});
test("another client or Admin cannot correct Ola's payment", () => {
  const h = setup(); h.api.holdInitialPayment(accounts, "p", "Checking");
  for (const actor of [{ role: "ADMIN" }, { role: "CLIENT", clientId: "other" }]) assert.throws(() => h.api.resubmitInitialPayment(actor, "p", { amount: 100, reference: "NEW" }), /owning Ola/);
  assert.equal(h.project.initialPayment.status, "ON_HOLD");
});
test("correction validates amount and UTR before changing the claim", () => {
  const h = setup(); h.api.holdInitialPayment(accounts, "p", "Checking");
  for (const amount of [0, -1, NaN, Infinity]) assert.throws(() => h.api.resubmitInitialPayment(ola, "p", { amount, reference: "NEW" }), /positive/);
  assert.throws(() => h.api.resubmitInitialPayment(ola, "p", { amount: 100, reference: " " }), /reference/);
  assert.equal(h.project.initialPayment.amount, 200);
});
