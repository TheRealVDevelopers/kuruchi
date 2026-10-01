const { HttpsError } = require("firebase-functions/v2/https");
const { randomBytes } = require("node:crypto");

function normaliseInvite(data) {
  const name = String(data.name || "").trim();
  const email = String(data.email || "").trim().toLowerCase();
  let phoneNumber = String(data.phoneNumber || "").replace(/[\s()-]/g, "");
  if (/^\d{10}$/.test(phoneNumber)) phoneNumber = `+91${phoneNumber}`;
  if (!name) throw new HttpsError("invalid-argument", "Enter the team member's name.");
  if (!email && !phoneNumber) throw new HttpsError("invalid-argument", "Enter an email address or mobile number.");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }
  if (phoneNumber && !/^\+[1-9]\d{7,14}$/.test(phoneNumber)) {
    throw new HttpsError("invalid-argument", "Enter a 10-digit Indian mobile or a number with its country code.");
  }
  const scope = {};
  const scopeKey = { CLIENT: "clientId", INSTALLATION: "teamId", VENDOR: "vendorId" }[data.role];
  if (scopeKey) {
    const scopeId = String(data[scopeKey] || "").trim();
    if (!scopeId) throw new HttpsError("invalid-argument", "Choose the Ola account, installation team or franchisee this user belongs to.");
    scope[scopeKey] = scopeId;
  }
  if (data.initialPassword && !/^\d{6}$/.test(String(data.initialPassword))) {
    throw new HttpsError("invalid-argument", "An initial password must contain six digits.");
  }
  return { name, email, phoneNumber, role: data.role, ...scope, initialPassword: data.initialPassword ? String(data.initialPassword) : "" };
}

async function findUser(lookup) {
  try {
    return await lookup();
  } catch (error) {
    if (error.code === "auth/user-not-found") return null;
    throw error;
  }
}

function phoneConflict() {
  return new HttpsError("already-exists", "This mobile is linked to a different email account. Use that account's email, or leave mobile blank to invite this person by email only.", { field: "phoneNumber" });
}

/** Resolve both identifiers before writing. A phone-only OTP user keeps its UID. */
async function provisionIdentity(auth, input, actorUid) {
  const [emailUser, phoneUser] = await Promise.all([
    input.email ? findUser(() => auth.getUserByEmail(input.email)) : null,
    input.phoneNumber ? findUser(() => auth.getUserByPhoneNumber(input.phoneNumber)) : null,
  ]);
  if (emailUser && phoneUser && emailUser.uid !== phoneUser.uid) throw phoneConflict();
  if (!emailUser && phoneUser?.email && input.email && phoneUser.email.toLowerCase() !== input.email) throw phoneConflict();

  const existing = emailUser || phoneUser;
  if (existing?.uid === actorUid && input.role !== "ADMIN") {
    throw new HttpsError("failed-precondition", "Keep your own account as Admin. Enter the new team member's email or mobile.");
  }
  const properties = {
    displayName: input.name,
    ...(input.email && !existing?.email ? { email: input.email } : {}),
    ...(input.phoneNumber ? { phoneNumber: input.phoneNumber } : {}),
    ...(input.email && (!existing?.email || input.initialPassword) ? {
      password: input.initialPassword || `Kp!${randomBytes(18).toString("base64url")}`,
    } : {}),
  };

  // Only the lookup can mean "not found". An update failure must not fall
  // through to createUser and accidentally make a second identity.
  return existing
    ? auth.updateUser(existing.uid, properties)
    : auth.createUser({ ...properties, disabled: false });
}

function invitationError(error) {
  if (error instanceof HttpsError) return error;
  const messages = {
    "auth/phone-number-already-exists": ["already-exists", "This mobile is already assigned to another account. Use its email or leave the mobile field blank."],
    "auth/email-already-exists": ["already-exists", "This email was registered while you were adding it. Please try again to finish its workspace access."],
    "auth/invalid-email": ["invalid-argument", "Enter a valid email address."],
    "auth/invalid-phone-number": ["invalid-argument", "Enter a valid mobile number including its country code."],
    "auth/invalid-password": ["invalid-argument", "The initial password is invalid."],
    "auth/too-many-requests": ["resource-exhausted", "Too many invitations. Please wait a moment and try again."],
  };
  const known = messages[error.code];
  return known ? new HttpsError(...known) : new HttpsError("internal", "We could not finish this account. Your details are still here; please try again.");
}

module.exports = { normaliseInvite, provisionIdentity, invitationError };
