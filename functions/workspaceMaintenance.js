const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { buildDeletionPlan, assertUserDeletion } = require("./workspaceCleanup");

async function requireWorkspaceAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.role !== "ADMIN") throw new HttpsError("permission-denied", "Only Kurchi Admin can delete workspace data.");
  const profile = await getFirestore().collection("workspaceProfiles").doc(request.auth.uid).get();
  if (!profile.exists || profile.data().role !== "ADMIN" || profile.data().active === false) throw new HttpsError("permission-denied", "An active Admin account is required.");
}

function safeProfile(snapshot) {
  const p = snapshot.data();
  return { uid: snapshot.id, name: p.name || "Kurchi user", email: p.email || "", role: p.role, active: p.active !== false,
    phone: p.phoneNumber || p.phone || null, clientId: p.clientId || null, teamId: p.teamId || null, vendorId: p.vendorId || null };
}

exports.manageWorkspaceData = onCall(async (request) => {
  await requireWorkspaceAdmin(request);
  const data = request.data || {};
  if (data.scope === "PROJECTS" && (!Array.isArray(data.projectIds) || data.projectIds.length > 100 || data.projectIds.some((id) => typeof id !== "string" || !id || id.includes("/")))) throw new HttpsError("invalid-argument", "Select up to 100 projects.");
  const firestore = getFirestore();
  const reference = firestore.collection("workspaceState").doc("default");
  return firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(reference);
    const revision = Number(current.data()?.revision || 0);
    const generation = Number(current.data()?.generation || 0);
    let plan;
    try { plan = buildDeletionPlan(current.data()?.payload || {}, data.scope, data.projectIds); }
    catch (error) { throw new HttpsError("invalid-argument", error.message); }
    const summary = { counts: plan.counts, total: plan.total, projects: plan.projects, confirmation: plan.confirmation, revision, generation };
    if (data.dryRun === true) return summary;
    if (data.confirmation !== plan.confirmation) throw new HttpsError("failed-precondition", `Type ${plan.confirmation} to confirm deletion.`);
    if (data.expectedRevision !== revision) throw new HttpsError("aborted", "The workspace changed since your preview. Review the latest counts and confirm again.");
    // A full cleanup preserves legal details and real logins, not browser demo identities.
    if (data.scope === "CLEAR_WORKSPACE") {
      const profiles = await transaction.get(firestore.collection("workspaceProfiles"));
      plan.payload.users = profiles.docs.map(safeProfile);
    }
    const audit = { id: `cleanup-${generation + 1}-${Date.now()}`, at: new Date().toISOString(), actorName: request.auth.token.email || "Admin", actorRole: "ADMIN", entity: "workspace/maintenance", action: "DELETE", detail: `${data.scope === "CLEAR_WORKSPACE" ? "Workspace work data cleared" : `${plan.projects.length} projects deleted`} · ${plan.total} records removed` };
    plan.payload.workspaceGeneration = generation + 1;
    plan.payload.audit = [audit, ...(plan.payload.audit || [])];
    transaction.set(reference, { payload: plan.payload, revision: revision + 1, generation: generation + 1, updatedAt: FieldValue.serverTimestamp(), schemaVersion: 1 }, { merge: true });
    transaction.set(firestore.collection("workspaceMaintenanceLog").doc(audit.id), { ...audit, counts: plan.counts, projectIds: data.projectIds || [] });
    return { ...summary, revision: revision + 1, generation: generation + 1, deleted: true };
  });
});

exports.deleteWorkspaceUsers = onCall(async (request) => {
  await requireWorkspaceAdmin(request);
  const { uids, confirmation } = request.data || {};
  if (confirmation !== "DELETE USERS") throw new HttpsError("failed-precondition", "Type DELETE USERS to confirm deletion.");
  const firestore = getFirestore();
  // Reserve the deletion first. Disabled profiles immediately lose database access,
  // and concurrent delete requests cannot remove the last active Admin.
  const selected = await firestore.runTransaction(async (transaction) => {
    const snapshots = await transaction.get(firestore.collection("workspaceProfiles"));
    const profiles = snapshots.docs.map(safeProfile);
    try { assertUserDeletion(profiles, uids, request.auth.uid); }
    catch (error) { throw new HttpsError("failed-precondition", error.message); }
    const targets = snapshots.docs.filter((snapshot) => uids.includes(snapshot.id));
    if (targets.some((snapshot) => snapshot.data().deleting)) throw new HttpsError("aborted", "A selected user is already being deleted. Refresh shortly.");
    for (const snapshot of targets) transaction.update(snapshot.ref, { active: false, deleting: true });
    return profiles.filter((p) => uids.includes(p.uid));
  });
  const deleted = [], failed = [];
  for (const profile of selected) {
    try {
      try { await getAuth().deleteUser(profile.uid); }
      catch (error) { if (error.code !== "auth/user-not-found") throw error; }
      // Remove the login profile and cache together; never touch unrelated Auth users.
      await firestore.runTransaction(async (transaction) => {
        const reference = firestore.collection("workspaceState").doc("default");
        const current = await transaction.get(reference);
        const payload = current.data()?.payload || {};
        payload.users = (payload.users || []).filter((p) => p.uid !== profile.uid);
        payload.workspaceGeneration = Number(current.data()?.generation || 0) + 1;
        transaction.delete(firestore.collection("workspaceProfiles").doc(profile.uid));
        transaction.delete(firestore.collection("users").doc(profile.uid));
        transaction.set(reference, { payload, revision: Number(current.data()?.revision || 0) + 1, generation: Number(current.data()?.generation || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        transaction.set(firestore.collection("workspaceMaintenanceLog").doc(), { action: "DELETE_USER", uid: profile.uid, by: request.auth.uid, at: FieldValue.serverTimestamp() });
      });
      deleted.push(profile.uid);
    } catch {
      // Leave failed/partially deleted accounts disabled. An Admin can retry safely.
      await firestore.collection("workspaceProfiles").doc(profile.uid).update({ deleting: false, active: false }).catch(() => undefined);
      failed.push({ uid: profile.uid, message: "Could not finish deletion. This account is disabled; retry deleting it." });
    }
  }
  return { deleted, failed };
});
