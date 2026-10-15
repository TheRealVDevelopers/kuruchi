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
function harness(shareReferences = false) {
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
  exports.connectSharedWorkspace(() => local, (payload) => { local = shareReferences ? payload : copy(payload); }, (message) => reports.push(message));
  return {
    api: exports, reports,
    get local() { return local; }, get server() { return server; }, get writes() { return writes; }, get unsubscribed() { return unsubscribed; },
    signIn() { authListener({ uid: "admin" }); }, signOut() { authListener(null); }, emit() { snapshotListener?.(snapshot()); },
    changeLocal(name) { local.projects[0].name = name; },
    addShowroom() { local.projects.push({ id: "new-showroom", name: "New Ola showroom", initialPayment: { status: "PENDING_VERIFICATION" } }); local.notifications = [{ id: "account-request", role: "ACCOUNTS", title: "Payment verification needed" }]; },
    publish() { exports.publishSharedWorkspace(() => local, (message) => reports.push(message)); },
    blockGet(promise) { beforeGet = promise; }, blockReturn(promise) { beforeReturn = promise; },
    cleanup(emit = true) { server = { payload: { projects: [], items: [], workspaceGeneration: 1 }, revision: server.revision + 1, generation: 1 }; if (emit) snapshotListener?.(snapshot()); },
    remoteEdit() { server.payload.items.push({ id: "item-from-another-user" }); server.revision++; },
  };
}

test("real store reference semantics preserve a new showroom and Accounts notification", async () => {
  const h = harness(true);
  h.signIn(); h.emit(); h.addShowroom(); h.publish();
  await h.api.waitForSharedWorkspaceSave();
  assert.equal(h.server.payload.projects.length, 2);
  assert.equal(h.server.payload.projects[1].initialPayment.status, "PENDING_VERIFICATION");
  assert.equal(h.server.payload.notifications[0].role, "ACCOUNTS");
});

test("editing a record after a remote snapshot does not mutate the merge baseline", async () => {
  const h = harness(true);
  h.signIn(); h.emit(); h.remoteEdit(); h.emit();
  h.changeLocal("Payment verified by Accounts"); h.publish();
  await h.api.waitForSharedWorkspaceSave();
  assert.equal(h.server.payload.projects[0].name, "Payment verified by Accounts");
  assert.equal(h.server.payload.items[0].id, "item-from-another-user");
});

test("handoff cannot report success before the shared workspace connects", async () => {
  const h = harness();
  await assert.rejects(h.api.waitForSharedWorkspaceSave(), /not connected/);
});

test("handoff waits for the server acknowledgment", async () => {
  const h = harness();
  h.signIn(); h.emit();
  const gate = deferred();
  h.blockReturn(gate.promise);
  h.changeLocal("Ola request pending Accounts"); h.publish();
  let completed = false;
  const handoff = h.api.waitForSharedWorkspaceSave().then(() => { completed = true; });
  await settle();
  assert.equal(completed, false);
  gate.resolve(); await handoff;
  assert.equal(h.server.payload.projects[0].name, "Ola request pending Accounts");
});

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

test("an invoice rename cannot overwrite a number changed concurrently in another browser", async () => {
  const h = harness();
  h.server.payload.invoices = [{ id: "invoice", number: "OLD/001" }];
  h.signIn(); h.emit(); h.local.invoices[0].number = "LOCAL/002";
  h.server.payload.invoices[0].number = "REMOTE/003";
  h.publish();
  await assert.rejects(h.api.waitForSharedWorkspaceSave(), /another session/);
  assert.equal(h.writes, 0); assert.equal(h.server.payload.invoices[0].number, "REMOTE/003");
});

test("invoice number uniqueness is checked inside the shared save transaction", async () => {
  const h = harness();
  h.server.payload.invoices = [{ id: "invoice", number: "OLD/001" }];
  h.signIn(); h.emit(); h.local.invoices[0].number = "NEW/002";
  h.server.payload.invoices.push({ id: "another-invoice", number: "NEW/002" });
  h.publish();
  await assert.rejects(h.api.waitForSharedWorkspaceSave(), /already used or reserved/);
  assert.equal(h.writes, 0);
});

test("renumbering retains a concurrent payment and the highest reserved invoice sequence", async () => {
  const h = harness();
  h.server.payload.invoices = [{ id: "invoice", number: "OLD/100", amountReceived: 0 }];
  h.server.payload.documentNumberFloor = { INV: 100, DC: 141 };
  h.signIn(); h.emit(); h.local.invoices[0].number = "NEW/200"; h.local.invoices[0].previousNumbers = ["OLD/100"];
  h.local.documentNumberFloor.INV = 200;
  h.server.payload.invoices[0].amountReceived = 500;
  h.server.payload.documentNumberFloor.INV = 300;
  h.publish(); await h.api.waitForSharedWorkspaceSave();
  assert.equal(h.server.payload.invoices[0].number, "NEW/200");
  assert.equal(h.server.payload.invoices[0].amountReceived, 500);
  assert.equal(h.server.payload.documentNumberFloor.INV, 300);
});
