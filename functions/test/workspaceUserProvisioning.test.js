const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normaliseInvite, provisionIdentity, invitationError } = require("../workspaceUserProvisioning");

function fakeAuth(records = []) {
  const users = records.map((record) => ({ disabled: false, ...record }));
  const writes = [];
  function find(key, value) {
    const user = users.find((record) => record[key] === value);
    if (!user) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
    return { ...user };
  }
  function checkUnique(properties, uid) {
    for (const key of ["email", "phoneNumber"]) {
      if (properties[key] && users.some((record) => record.uid !== uid && record[key] === properties[key])) {
        throw Object.assign(new Error("duplicate identifier"), { code: key === "email" ? "auth/email-already-exists" : "auth/phone-number-already-exists" });
      }
    }
    assert.ok(Object.values(properties).every((value) => value !== undefined), "No undefined Auth properties");
  }
  return {
    writes, users,
    async getUserByEmail(email) { return find("email", email); },
    async getUserByPhoneNumber(phoneNumber) { return find("phoneNumber", phoneNumber); },
    async updateUser(uid, properties) {
      checkUnique(properties, uid);
      writes.push({ kind: "update", uid, properties });
      Object.assign(users.find((user) => user.uid === uid), properties);
      return find("uid", uid);
    },
    async createUser(properties) {
      checkUnique(properties);
      const user = { uid: `created-${users.length}`, ...properties };
      writes.push({ kind: "create", properties });
      users.push(user);
      return { ...user };
    },
  };
}

const member = { name: "Test member", role: "SUPER_ADMIN", email: "member@example.com", phoneNumber: "+919876543210" };

test("an email invitation attaches to an existing phone-only OTP identity", async () => {
  const auth = fakeAuth([{ uid: "otp-user", phoneNumber: member.phoneNumber }]);
  const user = await provisionIdentity(auth, normaliseInvite(member), "admin");
  assert.equal(user.uid, "otp-user");
  assert.equal(user.email, member.email);
  assert.equal(user.phoneNumber, member.phoneNumber);
  assert.equal(auth.users.length, 1);
  assert.equal(auth.writes[0].kind, "update");
  assert.ok(auth.writes[0].properties.password.length >= 6);
});

test("retrying after a partially completed invite keeps UID and existing password", async () => {
  const auth = fakeAuth([{ uid: "otp-user", phoneNumber: member.phoneNumber }]);
  const input = normaliseInvite(member);
  const first = await provisionIdentity(auth, input, "admin");
  const second = await provisionIdentity(auth, input, "admin");
  assert.equal(second.uid, first.uid);
  assert.equal(auth.users.length, 1);
  assert.equal(auth.writes[1].properties.password, undefined);
});

test("both identifiers already on the same account are updated once", async () => {
  const auth = fakeAuth([{ uid: "member", ...member }]);
  const user = await provisionIdentity(auth, normaliseInvite(member), "admin");
  assert.equal(user.uid, "member");
  assert.equal(auth.writes.length, 1);
  assert.equal(auth.writes[0].properties.password, undefined);
});

test("a mobile belonging to another email fails clearly before changing either identity", async () => {
  const auth = fakeAuth([{ uid: "other", email: "other@example.com", phoneNumber: member.phoneNumber }]);
  await assert.rejects(provisionIdentity(auth, normaliseInvite(member), "admin"), (error) => {
    assert.equal(error.code, "already-exists");
    assert.match(error.message, /leave mobile blank/);
    return true;
  });
  assert.equal(auth.writes.length, 0);
});

test("separate existing email and phone accounts are never silently merged", async () => {
  const auth = fakeAuth([{ uid: "email-user", email: member.email }, { uid: "phone-user", phoneNumber: member.phoneNumber }]);
  await assert.rejects(provisionIdentity(auth, normaliseInvite(member), "admin"), { code: "already-exists" });
  assert.equal(auth.writes.length, 0);
});

test("new email-only, mobile-only and email plus mobile users are created", async () => {
  for (const input of [{ ...member, phoneNumber: "" }, { ...member, email: "" }, member]) {
    const auth = fakeAuth();
    const user = await provisionIdentity(auth, normaliseInvite(input), "admin");
    assert.ok(user.uid);
    assert.equal(auth.writes[0].kind, "create");
    assert.equal(Boolean(auth.writes[0].properties.password), Boolean(input.email));
  }
});

test("an existing email account can gain a new mobile without resetting its password", async () => {
  const auth = fakeAuth([{ uid: "email-user", email: member.email }]);
  await provisionIdentity(auth, normaliseInvite(member), "admin");
  assert.equal(auth.writes[0].properties.phoneNumber, member.phoneNumber);
  assert.equal(auth.writes[0].properties.password, undefined);
});

test("an update failure does not fall through to creating a duplicate", async () => {
  const auth = fakeAuth([{ uid: "existing", email: member.email }]);
  auth.updateUser = async () => { throw Object.assign(new Error("network error"), { code: "auth/internal-error" }); };
  await assert.rejects(provisionIdentity(auth, normaliseInvite(member), "admin"), { code: "auth/internal-error" });
  assert.equal(auth.users.length, 1);
  assert.equal(auth.writes.length, 0);
});

test("input trims email, normalises Indian mobiles and requires role scopes", () => {
  const input = normaliseInvite({ ...member, email: " MEMBER@EXAMPLE.COM ", phoneNumber: "98765 43210" });
  assert.equal(input.email, member.email);
  assert.equal(input.phoneNumber, member.phoneNumber);
  for (const role of ["CLIENT", "INSTALLATION", "VENDOR"]) {
    assert.throws(() => normaliseInvite({ ...member, role }), { code: "invalid-argument" });
  }
  assert.equal(normaliseInvite({ ...member, role: "CLIENT", clientId: "ola" }).clientId, "ola");
});

test("identity conflicts and invalid input do not become an INTERNAL error", () => {
  assert.equal(invitationError({ code: "auth/phone-number-already-exists" }).code, "already-exists");
  assert.equal(invitationError({ code: "auth/invalid-email" }).code, "invalid-argument");
  assert.equal(invitationError({ code: "unknown" }).code, "internal");
});

test("an Admin cannot replace their own role while adding a member", async () => {
  const auth = fakeAuth([{ uid: "admin", email: member.email }]);
  await assert.rejects(provisionIdentity(auth, normaliseInvite(member), "admin"), { code: "failed-precondition" });
  assert.equal(auth.writes.length, 0);
});
