const { test } = require("node:test");
const assert = require("node:assert/strict");
const { WORK_COLLECTIONS, buildDeletionPlan, assertUserDeletion } = require("../workspaceCleanup");

function sample() {
  return {
    sellerProfile: { legalName: "Real Company" }, users: [{ uid: "admin" }],
    projects: [{ id: "pr-1", code: "K1", name: "First" }, { id: "pr-10", code: "K10" }],
    items: [{ id: "itm-1500", projectId: "pr-1" }, { id: "itm-2000", projectId: "pr-10" }],
    invoices: [{ id: "inv-1", projectId: "pr-1", number: "KP/I/26-27/0987" }, { id: "inv-2", projectId: "pr-10", number: "KP/I/26-27/0988" }],
    payments: [{ id: "pay-1", invoiceId: "inv-1" }, { id: "pay-2", invoiceId: "advance-pr-1" }, { id: "pay-3", invoiceId: "inv-2" }],
    costEntries: [{ id: "cost-1", projectId: "pr-1", amount: 10 }, { id: "cost-2", projectId: "pr-10", amount: 25 }],
    notifications: [{ id: "n-1", link: "/admin/projects/pr-1?tab=boq" }, { id: "n-2", link: "/portal/projects/pr-10" }],
    audit: [{ id: "a-1", entity: "projects/pr-1" }, { id: "a-2", entity: "items/itm-1500" }, { id: "a-3", entity: "invoices/inv-2" }],
    handoverSigned: { "pr-1": { at: "today" }, "pr-10": { at: "yesterday" } },
    products: [{ id: "prod-1" }], kits: [{ id: "kit-1" }], inventory: [{ id: "stock-1" }],
  };
}

test("project deletion cascades into invoices, advances, expenses and handover without affecting another project", () => {
  const plan = buildDeletionPlan(sample(), "PROJECTS", ["pr-1"]);
  assert.deepEqual(plan.payload.projects.map((p) => p.id), ["pr-10"]);
  assert.deepEqual(plan.payload.payments.map((p) => p.id), ["pay-3"]);
  assert.deepEqual(plan.payload.costEntries.map((p) => p.id), ["cost-2"]);
  assert.deepEqual(Object.keys(plan.payload.handoverSigned), ["pr-10"]);
  assert.equal(plan.counts.payments, 2);
  assert.equal(plan.payload.products.length, 1);
  assert.equal(plan.payload.users.length, 1);
});
test("every project-owned record is removed, including replacement/service lines and documents", () => {
  const data = sample();
  for (const key of WORK_COLLECTIONS.filter((key) => !["projects", "payments", "notifications", "audit"].includes(key))) {
    data[key] = [{ id: `${key}-1`, projectId: "pr-1" }, { id: `${key}-2`, projectId: "pr-10" }];
  }
  const plan = buildDeletionPlan(data, "PROJECTS", ["pr-1"]);
  for (const key of WORK_COLLECTIONS) assert.equal(plan.payload[key].some((row) => row.projectId === "pr-1"), false, key);
});
test("notification matching is exact, and activity records of deleted child items are removed", () => {
  const { payload } = buildDeletionPlan(sample(), "PROJECTS", ["pr-1"]);
  assert.deepEqual(payload.notifications.map((row) => row.id), ["n-2"]);
  assert.deepEqual(payload.audit.map((row) => row.id), ["a-3"]);
});
test("clear workspace empties every work collection but preserves legal profile and user logins", () => {
  const { payload } = buildDeletionPlan(sample(), "CLEAR_WORKSPACE");
  for (const key of WORK_COLLECTIONS) assert.deepEqual(payload[key], [], key);
  assert.deepEqual(payload.handoverSigned, {});
  assert.deepEqual(payload.sellerProfile, { legalName: "Real Company" });
  assert.deepEqual(payload.users, [{ uid: "admin" }]);
});
test("invoice/challan numbers and record id floors survive deletion", () => {
  const data = sample(); data.challans = [{ id: "dc-2200", number: "KP/D/26-27/1000", projectId: "pr-1" }];
  const { payload } = buildDeletionPlan(data, "CLEAR_WORKSPACE");
  assert.deepEqual(payload.documentNumberFloor, { INV: 988, DC: 1000 });
  assert.equal(payload.recordIdFloor, 2200);
});
test("preview never mutates its source; invalid and missing projects are blocked", () => {
  const data = sample(), original = JSON.stringify(data);
  buildDeletionPlan(data, "PROJECTS", ["pr-1"]);
  assert.equal(JSON.stringify(data), original);
  assert.throws(() => buildDeletionPlan(data, "UNKNOWN"));
  assert.throws(() => buildDeletionPlan(data, "PROJECTS", []));
  assert.throws(() => buildDeletionPlan(data, "PROJECTS", ["missing"]));
});
test("user deletion protects the signed-in admin and the last active admin", () => {
  const profiles = [{ uid: "admin", role: "ADMIN", active: true }, { uid: "a2", role: "ADMIN", active: true }, { uid: "accounts", role: "ACCOUNTS" }];
  assert.throws(() => assertUserDeletion(profiles, ["admin"], "admin"), /account you are using/);
  assert.throws(() => assertUserDeletion(profiles, ["admin", "a2"], "other"), /at least one/);
  assert.doesNotThrow(() => assertUserDeletion(profiles, ["a2", "accounts"], "admin"));
});
test("user deletion is limited to known workspace members, not unrelated Firebase accounts", () => {
  const profiles = [{ uid: "admin", role: "ADMIN", active: true }];
  assert.throws(() => assertUserDeletion(profiles, ["ecommerce-customer"], "admin"), /no longer exists/);
  assert.throws(() => assertUserDeletion(profiles, ["x", "x"], "admin"), /only once/);
  assert.throws(() => assertUserDeletion(profiles, ["bad/path"], "admin"));
});
