const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

function profileInput(data = {}) {
  if (Object.keys(data).some((key) => key !== "name")) throw new HttpsError("invalid-argument", "Only your display name can be edited here. Email and password changes use secure Firebase verification.");
  if (data.name === undefined) return {};
  if (typeof data.name !== "string" || !data.name.trim() || data.name.trim().length > 100) throw new HttpsError("invalid-argument", "Enter a name between 1 and 100 characters.");
  return { name: data.name.trim() };
}

const saveMyWorkspaceProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const input = profileInput(request.data || {});
  const firestore = getFirestore();
  const reference = firestore.collection("workspaceProfiles").doc(request.auth.uid);
  const initial = await reference.get();
  if (!initial.exists || initial.data().active === false || initial.data().deleting) throw new HttpsError("permission-denied", "Your workspace access is not active.");
  // Never trust an email supplied by the browser. Auth owns the verified change.
  let identity = await getAuth().getUser(request.auth.uid);
  if (identity.disabled) throw new HttpsError("permission-denied", "Your account is disabled.");
  if (input.name) identity = await getAuth().updateUser(identity.uid, { displayName: input.name });
  return firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    const workspaceRef = firestore.collection("workspaceState").doc("default");
    const workspace = await transaction.get(workspaceRef);
    if (!current.exists || current.data().active === false || current.data().deleting) throw new HttpsError("permission-denied", "Your workspace access is not active.");
    const existing = current.data();
    const name = input.name || identity.displayName || existing.name || "Kurchi user";
    const email = identity.email || "";
    const profile = { uid: request.auth.uid, name, email, role: existing.role, active: true,
      phone: identity.phoneNumber || null, clientId: existing.clientId || null, teamId: existing.teamId || null, vendorId: existing.vendorId || null };
    if (existing.name !== name || existing.email !== email || existing.phone !== profile.phone) {
      transaction.update(reference, { name, email, phone: profile.phone, profileUpdatedAt: FieldValue.serverTimestamp() });
      if (workspace.exists) {
        const payload = workspace.data().payload || {};
        payload.users = [...(payload.users || []).filter((user) => user.uid !== request.auth.uid), profile];
        transaction.update(workspaceRef, { payload, revision: Number(workspace.data().revision || 0) + 1, updatedAt: FieldValue.serverTimestamp() });
      }
    }
    return profile;
  });
});

module.exports = { saveMyWorkspaceProfile, profileInput };
