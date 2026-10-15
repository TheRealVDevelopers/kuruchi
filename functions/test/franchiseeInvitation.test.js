const { test } = require("node:test");
const assert = require("node:assert/strict");
const { provisionFranchiseeIdentity } = require("../franchiseeInvitation");

function harness(initialUsers = []) {
  const users = initialUsers.map((user) => ({ ...user }));
  const writes = [];
  const owner = { id: "owner", type: "FRANCHISEE", clientId: "ola", contactName: "Saved Owner", email: "owner@example.com", contactPhone: "9876543210" };
  const payload = { vendors: [owner], projects: [{ franchiseeId: "owner", clientId: "ola" }] };
  const profiles = new Map();
  const firestore = { collection: (collection) => ({ doc: (id) => ({ get: async () => {
    const value = collection === "workspaceState" ? { payload } : profiles.get(id);
    return { exists: Boolean(value), data: () => value };
  } }) }) };
  function find(key, value) {
    const user = users.find((entry) => entry[key] === value);
    if (!user) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
    return { ...user };
  }
  const auth = {
    getUserByEmail: async (email) => find("email", email),
    getUserByPhoneNumber: async (phone) => find("phoneNumber", phone),
    updateUser: async (uid, patch) => { writes.push(patch); Object.assign(users.find((user) => user.uid === uid), patch); return find("uid", uid); },
    createUser: async (data) => { writes.push(data); const user = { uid: "created", ...data }; users.push(user); return user; },
  };
  const input = { vendorId: "owner", email: "owner@example.com", name: "Browser name" };
  return { auth, firestore, owner, payload, profiles, users, writes, invite: (clientId = "ola", data = input) => provisionFranchiseeIdentity(auth, firestore, clientId, data, "client-user") };
}

test("franchisee email invitations include the saved mobile on the same identity", async () => {
  const h = harness([{ uid: "email-user", email: "owner@example.com" }]);
  const user = await h.invite();
  assert.equal(user.uid, "email-user"); assert.equal(user.phoneNumber, "+919876543210");
  assert.equal(user.displayName, "Saved Owner"); assert.equal(h.users.length, 1);
  assert.equal(h.writes[0].password, undefined);
});

test("a phone-only account from an earlier OTP attempt keeps its UID when invited", async () => {
  const h = harness([{ uid: "otp-user", phoneNumber: "+919876543210" }]);
  const user = await h.invite();
  assert.equal(user.uid, "otp-user"); assert.equal(user.email, "owner@example.com");
  assert.equal(h.users.length, 1); assert.ok(h.writes[0].password);
});

test("new invitations create one account for both email and mobile", async () => {
  const h = harness(); const user = await h.invite();
  assert.equal(user.email, "owner@example.com"); assert.equal(user.phoneNumber, "+919876543210");
  assert.equal(h.users.length, 1);
});

test("retrying an existing scoped invitation preserves its identity and password", async () => {
  const h = harness([{ uid: "existing", email: "owner@example.com", phoneNumber: "+919876543210", customClaims: { role: "VENDOR", vendorId: "owner", clientId: "ola" } }]);
  h.profiles.set("existing", { role: "VENDOR", active: true, vendorId: "owner", clientId: "ola" });
  const user = await h.invite();
  assert.equal(user.uid, "existing"); assert.equal(h.writes[0].password, undefined);
});

test("separate email and phone identities require an explicit account repair", async () => {
  const h = harness([{ uid: "email", email: "owner@example.com" }, { uid: "phone", phoneNumber: "+919876543210" }]);
  await assert.rejects(h.invite(), { code: "already-exists" }); assert.equal(h.writes.length, 0);
});

test("a caller cannot invite another Ola account's owner or substitute an email", async () => {
  const h = harness();
  await assert.rejects(h.invite("another-client"), { code: "permission-denied" });
  await assert.rejects(h.invite("ola", { vendorId: "owner", email: "other@example.com" }), { code: "failed-precondition" });
  h.payload.projects = [];
  await assert.rejects(h.invite(), { code: "permission-denied" }); assert.equal(h.writes.length, 0);
});

test("invitations do not reactivate disabled accounts or replace existing workspace scopes", async () => {
  for (const patch of [{ role: "ADMIN" }, { role: "VENDOR", vendorId: "another-owner", clientId: "ola" }, { role: "VENDOR", vendorId: "owner", clientId: "ola", active: false }, { role: "VENDOR", vendorId: "owner", clientId: "ola", deleting: true }]) {
    const h = harness([{ uid: "existing", email: "owner@example.com" }]);
    h.profiles.set("existing", patch);
    await assert.rejects(h.invite(), { code: "permission-denied" }); assert.equal(h.writes.length, 0);
  }
  for (const properties of [{ disabled: true }, { customClaims: { role: "ADMIN" } }]) {
    const h = harness([{ uid: "existing", email: "owner@example.com", ...properties }]);
    await assert.rejects(h.invite(), { code: "permission-denied" }); assert.equal(h.writes.length, 0);
  }
});
