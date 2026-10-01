const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const copy = (value) => JSON.parse(JSON.stringify(value));

function harness() {
  const records = new Map([
    ["workspaceProfiles/admin", { uid: "admin", role: "ADMIN", active: true, email: "admin@example.com" }],
    ["workspaceProfiles/accounts", { uid: "accounts", role: "ACCOUNTS", active: true, email: "accounts@example.com" }],
    ["workspaceState/default", { revision: 5, generation: 0, payload: { projects: [{ id: "pr-1" }], items: [{ id: "item-1", projectId: "pr-1" }], users: [{ uid: "demo" }, { uid: "accounts" }], sellerProfile: { legalName: "Kurchi" } } }],
  ]);
  const authDeletes = [];
  let sequence = 0, failAuth = false, writes = 0;
  function reference(key) {
    return { key, get: async () => snapshot(key), update: async (patch) => { if (!records.has(key)) throw new Error("not-found"); records.set(key, { ...records.get(key), ...patch }); } };
  }
  function snapshot(key) { return { id: key.split("/").pop(), ref: reference(key), exists: records.has(key), data: () => copy(records.get(key) || {}) }; }
  const firestore = {
    collection: (name) => ({ name, doc: (id = `generated-${++sequence}`) => reference(`${name}/${id}`) }),
    runTransaction: async (callback) => {
      const operations = [];
      const result = await callback({
        get: async (target) => target.key ? snapshot(target.key) : { docs: [...records.keys()].filter((key) => key.startsWith(`${target.name}/`)).map(snapshot) },
        update: (target, patch) => operations.push(() => records.set(target.key, { ...records.get(target.key), ...patch })),
        delete: (target) => operations.push(() => records.delete(target.key)),
        set: (target, value, options) => operations.push(() => records.set(target.key, options?.merge ? { ...records.get(target.key), ...copy(value) } : copy(value))),
      });
      for (const operation of operations) { operation(); writes++; }
      return result;
    },
  };
  class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
  const exports = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../workspaceMaintenance.js"), "utf8"), { exports, Date, require: (name) => {
    if (name === "firebase-admin/firestore") return { getFirestore: () => firestore, FieldValue: { serverTimestamp: () => "server-time" } };
    if (name === "firebase-admin/auth") return { getAuth: () => ({ deleteUser: async (uid) => { if (failAuth) throw new Error("unavailable"); authDeletes.push(uid); } }) };
    if (name === "firebase-functions/v2/https") return { onCall: (callback) => callback, HttpsError };
    if (name === "./workspaceCleanup") return require("../workspaceCleanup");
    throw new Error(name);
  } });
  const request = (data, auth = { uid: "admin", token: { role: "ADMIN", email: "admin@example.com" } }) => ({ data, auth });
  return { api: exports, records, authDeletes, request, get writes() { return writes; }, failAuth() { failAuth = true; } };
}

test("live-function contract: preview performs zero writes", async () => {
  const h = harness(), original = copy(h.records.get("workspaceState/default"));
  const preview = await h.api.manageWorkspaceData(h.request({ scope: "CLEAR_WORKSPACE", dryRun: true }));
  assert.equal(preview.revision, 5); assert.equal(preview.counts.projects, 1); assert.equal(h.writes, 0);
  assert.deepEqual(h.records.get("workspaceState/default"), original);
});
test("unauthenticated, non-admin and disabled-admin requests are rejected", async () => {
  const h = harness();
  await assert.rejects(h.api.manageWorkspaceData(h.request({ scope: "CLEAR_WORKSPACE", dryRun: true }, null)), { code: "unauthenticated" });
  await assert.rejects(h.api.manageWorkspaceData(h.request({}, { uid: "accounts", token: { role: "ACCOUNTS" } })), { code: "permission-denied" });
  h.records.get("workspaceProfiles/admin").active = false;
  await assert.rejects(h.api.deleteWorkspaceUsers(h.request({ uids: ["accounts"], confirmation: "DELETE USERS" })), { code: "permission-denied" });
  assert.equal(h.writes, 0);
});
test("wrong confirmation and outdated preview cannot delete records", async () => {
  const h = harness();
  await assert.rejects(h.api.manageWorkspaceData(h.request({ scope: "CLEAR_WORKSPACE", confirmation: "wrong", expectedRevision: 5 })), { code: "failed-precondition" });
  await assert.rejects(h.api.manageWorkspaceData(h.request({ scope: "CLEAR_WORKSPACE", confirmation: "CLEAR WORKSPACE", expectedRevision: 4 })), { code: "aborted" });
  assert.equal(h.writes, 0);
});
test("confirmed clear updates revision/generation together, removes browser demo users and preserves login profiles", async () => {
  const h = harness();
  await h.api.manageWorkspaceData(h.request({ scope: "CLEAR_WORKSPACE", confirmation: "CLEAR WORKSPACE", expectedRevision: 5 }));
  const saved = h.records.get("workspaceState/default");
  assert.equal(saved.revision, 6); assert.equal(saved.generation, 1); assert.equal(saved.payload.workspaceGeneration, 1);
  assert.deepEqual(saved.payload.projects, []); assert.deepEqual(saved.payload.sellerProfile, { legalName: "Kurchi" });
  assert.deepEqual(saved.payload.users.map((u) => u.uid), ["admin", "accounts"]);
  assert.equal(h.records.has("workspaceProfiles/admin"), true); assert.equal(h.authDeletes.length, 0);
});
test("confirmed user deletion removes the Auth identity and profile, not the current Admin or unrelated Auth users", async () => {
  const h = harness();
  const result = await h.api.deleteWorkspaceUsers(h.request({ uids: ["accounts"], confirmation: "DELETE USERS" }));
  assert.deepEqual(copy(result.deleted), ["accounts"]); assert.deepEqual(h.authDeletes, ["accounts"]);
  assert.equal(h.records.has("workspaceProfiles/accounts"), false); assert.equal(h.records.has("workspaceProfiles/admin"), true);
  assert.equal(h.records.get("workspaceState/default").payload.users.some((u) => u.uid === "accounts"), false);
  assert.equal(h.records.get("workspaceState/default").payload.workspaceGeneration, 1);
});
test("self deletion or an unknown workspace member does not make any Auth call", async () => {
  const h = harness();
  await assert.rejects(h.api.deleteWorkspaceUsers(h.request({ uids: ["admin"], confirmation: "DELETE USERS" })), { code: "failed-precondition" });
  await assert.rejects(h.api.deleteWorkspaceUsers(h.request({ uids: ["outside-customer"], confirmation: "DELETE USERS" })), { code: "failed-precondition" });
  assert.equal(h.authDeletes.length, 0); assert.equal(h.writes, 0);
});
test("Auth deletion failures are reported and leave the profile disabled and retryable", async () => {
  const h = harness(); h.failAuth();
  const result = await h.api.deleteWorkspaceUsers(h.request({ uids: ["accounts"], confirmation: "DELETE USERS" }));
  assert.equal(result.failed.length, 1); assert.equal(result.deleted.length, 0);
  assert.equal(h.records.get("workspaceProfiles/accounts").active, false);
  assert.equal(h.records.get("workspaceProfiles/accounts").deleting, false);
});
