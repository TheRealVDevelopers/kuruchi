const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("../../node_modules/typescript");

const copy = (value) => JSON.parse(JSON.stringify(value));
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../../src/data/cloudSync.ts"), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(setImmediate); };
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function harness() {
  let local = { projects: [{ id: "pr-1", name: "Before" }], items: [], workspaceGeneration: 0 };
  let server = { payload: copy(local), revision: 1, generation: 0 };
  let authListener, snapshotListener, writes = 0, unsubscribed = 0;
  let beforeGet = null, beforeReturn = null;
  const reports = [];
  const snapshot = () => { const data = copy(server); return { exists: () => true, data: () => data, metadata: { hasPendingWrites: false } }; };
  const firebase = {
    doc: () => ({}), serverTimestamp: () => "now",
    onSnapshot: (_, callback) => { snapshotListener = callback; return () => { unsubscribed++; snapshotListener = null; }; },
    setDoc: async (_, value) => { server = copy(value); writes++; },
    runTransaction: async (_, callback) => {
      const result = await callback({ get: async () => { if (beforeGet) await beforeGet; return snapshot(); }, set: (_, value) => { server = { ...server, ...copy(value) }; writes++; } });
      if (beforeReturn) await beforeReturn;
      return result;
    },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, window: {}, require: (name) => {
    if (name === "firebase/firestore") return firebase;
    if (name === "firebase/auth") return { onAuthStateChanged: (_, callback) => { authListener = callback; } };
    if (name === "@/lib/firebase") return { auth: {}, db: {} };
    throw new Error(name);
  } });
  exports.connectSharedWorkspace(() => local, (payload) => { local = copy(payload); }, (message) => reports.push(message));
  return {
    api: exports, reports,
    get local() { return local; }, get server() { return server; }, get writes() { return writes; }, get unsubscribed() { return unsubscribed; },
    signIn() { authListener({ uid: "admin" }); }, signOut() { authListener(null); }, emit() { snapshotListener?.(snapshot()); },
    changeLocal(name) { local.projects[0].name = name; },
    publish() { exports.publishSharedWorkspace(() => local, (message) => reports.push(message)); },
    blockGet(promise) { beforeGet = promise; }, blockReturn(promise) { beforeReturn = promise; },
    cleanup(emit = true) { server = { payload: { projects: [], items: [], workspaceGeneration: 1 }, revision: server.revision + 1, generation: 1 }; if (emit) snapshotListener?.(snapshot()); },
    remoteEdit() { server.payload.items.push({ id: "item-from-another-user" }); server.revision++; },
  };
}

test("shared connection waits for sign-in and reconnects after sign-out", () => {
  const h = harness(); assert.equal(h.api.sharedWorkspaceStatus.connected, false);
  h.signIn(); h.emit(); assert.equal(h.api.sharedWorkspaceStatus.connected, true);
  h.signOut(); assert.equal(h.api.sharedWorkspaceStatus.connected, false);
  h.signIn(); h.emit(); assert.equal(h.api.sharedWorkspaceStatus.connected, true); assert.equal(h.unsubscribed, 1);
});
test("cleanup immediately cancels every queued old-generation save", async () => {
  const h = harness(); h.signIn(); h.emit(); h.changeLocal("Queued edit");
  h.publish(); h.publish(); h.cleanup(); await settle();
  assert.deepEqual(h.local.projects, []); assert.deepEqual(h.server.payload.projects, []); assert.equal(h.writes, 0);
});
test("an offline/stale tab discovers cleanup inside the transaction and never resurrects records", async () => {
  const h = harness(); h.signIn(); h.emit(); h.changeLocal("Offline edit"); h.cleanup(false);
  h.publish(); await settle();
  assert.deepEqual(h.local.projects, []); assert.equal(h.writes, 0); assert.equal(h.reports.length, 1);
});
test("cleanup wins over an in-flight save even before its transaction reads", async () => {
  const h = harness(); const gate = deferred(); h.signIn(); h.emit(); h.blockGet(gate.promise);
  h.changeLocal("In-flight"); h.publish(); await settle(); h.cleanup(); gate.resolve(); await settle();
  assert.deepEqual(h.local.projects, []); assert.deepEqual(h.server.payload.projects, []); assert.equal(h.writes, 0);
});
test("a delayed acknowledgment from before cleanup cannot repaint the cleared workspace", async () => {
  const h = harness(); const gate = deferred(); h.signIn(); h.emit(); h.blockReturn(gate.promise);
  h.changeLocal("Saved before cleanup"); h.publish(); await settle(); assert.equal(h.writes, 1);
  h.cleanup(); gate.resolve(); await settle();
  assert.deepEqual(h.local.projects, []); assert.deepEqual(h.server.payload.projects, []);
});
test("ordinary saves preserve another user's unrelated records and keep the cleanup marker", async () => {
  const h = harness(); h.signIn(); h.emit(); h.remoteEdit(); h.changeLocal("New name"); h.publish(); await settle();
  assert.equal(h.local.projects[0].name, "New name"); assert.equal(h.local.items[0].id, "item-from-another-user");
  assert.equal(h.server.payload.workspaceGeneration, h.server.generation);
});
test("queued saves belonging to the previous login are not published after switching accounts", async () => {
  const h = harness(); h.signIn(); h.emit(); h.changeLocal("Old account edit"); h.publish(); h.signOut(); h.signIn(); h.emit(); await settle();
  assert.equal(h.writes, 0); assert.equal(h.local.projects[0].name, "Before");
});
