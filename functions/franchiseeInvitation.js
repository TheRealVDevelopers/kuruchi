const { HttpsError } = require("firebase-functions/v2/https");
const { normaliseInvite, provisionIdentity } = require("./workspaceUserProvisioning");

/** Invite the saved owner's email and mobile onto one scoped Firebase identity. */
async function provisionFranchiseeIdentity(auth, firestore, clientId, data, actorUid) {
  const workspace = await firestore.collection("workspaceState").doc("default").get();
  const payload = workspace.exists ? workspace.data().payload || {} : {};
  const owner = (payload.vendors || []).find((vendor) => vendor.id === data.vendorId && vendor.type === "FRANCHISEE" && vendor.clientId === clientId);
  if (!owner || !(payload.projects || []).some((project) => project.franchiseeId === owner.id && project.clientId === clientId)) {
    throw new HttpsError("permission-denied", "Choose a franchisee assigned to your Ola showroom.");
  }
  if (String(owner.email || "").trim().toLowerCase() !== String(data.email || "").trim().toLowerCase()) {
    throw new HttpsError("failed-precondition", "The invitation email must match the saved franchisee owner.");
  }
  const input = normaliseInvite({ name: owner.contactName, email: owner.email, phoneNumber: owner.contactPhone, role: "VENDOR", vendorId: owner.id });
  const candidates = await Promise.all([
    input.email ? lookup(() => auth.getUserByEmail(input.email)) : null,
    input.phoneNumber ? lookup(() => auth.getUserByPhoneNumber(input.phoneNumber)) : null,
  ]);
  for (const candidate of candidates.filter(Boolean)) {
    const profile = await firestore.collection("workspaceProfiles").doc(candidate.uid).get();
    const claims = candidate.customClaims || {};
    const existing = profile.exists ? profile.data() : null;
    if (candidate.disabled || claims.active === false || (claims.role && (claims.role !== "VENDOR" || claims.vendorId !== owner.id || claims.clientId !== clientId)) ||
      (existing && (existing.active === false || existing.deleting || existing.role !== "VENDOR" || existing.vendorId !== owner.id || existing.clientId !== clientId))) {
      throw new HttpsError("permission-denied", "This account needs Kurchi Admin to review its existing workspace access.");
    }
  }
  return provisionIdentity(auth, input, actorUid);
}

async function lookup(find) {
  try { return await find(); }
  catch (error) { if (error.code === "auth/user-not-found") return null; throw error; }
}

module.exports = { provisionFranchiseeIdentity };
