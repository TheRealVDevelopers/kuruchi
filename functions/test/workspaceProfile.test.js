const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const copy = (value) => JSON.parse(JSON.stringify(value));
function harness(role = "ADMIN") {
  const records = new Map([
    ["workspaceProfiles/me", { uid: "me", name: "Old Name", email: "old@example.com", phone: null, active: true, role, clientId: "client-1", teamId: "team-1", vendorId: "vendor-1" }],
    ["workspaceProfiles/other", { uid: "other", name: "Someone else", role: "ADMIN", active: true }],
    ["workspaceState/default", { revision: 4, generation: 2, payload: { workspaceGeneration: 2, users: [{ uid: "me", name: "Old Name" }, { uid: "other", name: "Someone else" }] } }],
  ]);
  let identity = { uid: "me", displayName: "Old Name", email: "old@example.com", phoneNumber: null, disabled: false };
  let writes = 0;
  const ref = (key) => ({ key, get: async () => snap(key) });
  const snap = (key) => ({ exists: records.has(key), data: () => copy(records.get(key) || {}) });
  const firestore = {
    collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
    runTransaction: async (callback) => {
      const queued = [];
      const result = await callback({ get: async (reference) => snap(reference.key), update: (reference, patch) => queued.push(() => { records.set(reference.key, { ...records.get(reference.key), ...copy(patch) }); writes++; }) });
      for (const action of queued) action();
      return result;
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../workspaceProfile.js"), "utf8"), { module, require: (name) => {
    if (name === "firebase-admin/auth") return { getAuth: () => ({ getUser: async (uid) => { assert.equal(uid, "me"); return copy(identity); }, updateUser: async (uid, patch) => { assert.equal(uid, "me"); identity = { ...identity, ...patch }; return copy(identity); } }) };
    if (name === "firebase-admin/firestore") return { getFirestore: () => firestore, FieldValue: { serverTimestamp: () => "now" } };
    if (name === "firebase-functions/v2/https") return { onCall: (fn) => fn, HttpsError };
    throw new Error(name);
  } });
  return { api: module.exports, records, get writes() { return writes; }, identity: (patch) => { identity = { ...identity, ...patch }; }, request: (data = {}) => ({ auth: { uid: "me", token: { role } }, data }) };
}
test("every role can change only its own name while keeping all access assignments", async () => {
  for (const role of ["ADMIN", "SUPER_ADMIN", "ACCOUNTS", "INSTALLATION", "CLIENT", "VENDOR"]) {
    const h = harness(role), result = await h.api.saveMyWorkspaceProfile(h.request({ name: "  New Name  " }));
    assert.equal(result.name, "New Name"); assert.equal(result.role, role);
    assert.equal(result.clientId, "client-1"); assert.equal(result.teamId, "team-1"); assert.equal(result.vendorId, "vendor-1");
    assert.equal(h.records.get("workspaceProfiles/other").name, "Someone else");
    assert.equal(h.records.get("workspaceState/default").generation, 2);
    assert.equal(h.records.get("workspaceState/default").revision, 5);
  }
});
test("email sync uses the Firebase identity, never a browser-supplied email", async () => {
  const h = harness(); h.identity({ email: "verified-new@example.com" });
  const result = await h.api.saveMyWorkspaceProfile(h.request());
  assert.equal(result.email, "verified-new@example.com");
  assert.equal(h.records.get("workspaceProfiles/me").email, "verified-new@example.com");
  assert.equal(h.records.get("workspaceState/default").payload.users.find((u) => u.uid === "me").email, "verified-new@example.com");
});
test("role, uid, password, email and assignment fields are rejected", async () => {
  for (const data of [{ role: "ADMIN" }, { uid: "other" }, { password: "secret" }, { email: "unverified@example.com" }, { clientId: "another-client" }, { active: true }]) {
    const h = harness("CLIENT"); await assert.rejects(h.api.saveMyWorkspaceProfile(h.request(data)), { code: "invalid-argument" }); assert.equal(h.writes, 0);
  }
});
test("invalid names and unauthenticated calls are blocked", async () => {
  const h = harness();
  await assert.rejects(h.api.saveMyWorkspaceProfile({ data: {} }), { code: "unauthenticated" });
  for (const name of ["", "  ", 42, "a".repeat(101)]) await assert.rejects(h.api.saveMyWorkspaceProfile(h.request({ name })), { code: "invalid-argument" });
  assert.equal(h.writes, 0);
});
test("disabled, deleting, and uninvited accounts cannot edit a profile", async () => {
  for (const status of ["disabledAuth", "disabledProfile", "deleting", "missing"]) {
    const h = harness();
    if (status === "disabledAuth") h.identity({ disabled: true });
    if (status === "disabledProfile") h.records.get("workspaceProfiles/me").active = false;
    if (status === "deleting") h.records.get("workspaceProfiles/me").deleting = true;
    if (status === "missing") h.records.delete("workspaceProfiles/me");
    await assert.rejects(h.api.saveMyWorkspaceProfile(h.request({ name: "New" })), { code: "permission-denied" }); assert.equal(h.writes, 0);
  }
});
test("an unchanged profile sync does not create extra workspace writes", async () => {
  const h = harness(); await h.api.saveMyWorkspaceProfile(h.request()); assert.equal(h.writes, 0);
});
