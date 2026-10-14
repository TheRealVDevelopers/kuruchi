/** Official B2C AWB tracking. Token stays in a server-only Firestore document. */
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { parseTracking } = require("./delhiveryParser");
async function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const profile = await getFirestore().collection("workspaceProfiles").doc(request.auth.uid).get();
  if (profile.data()?.role !== "ADMIN" || profile.data()?.active !== true) throw new HttpsError("permission-denied", "Only active Admin can manage tracking.");
}
exports.configureDelhivery = onCall(async (request) => {
  await requireAdmin(request);
  const token = String(request.data?.token ?? "").trim();
  if (token.length < 10 || token.length > 1024 || /\s/.test(token)) throw new HttpsError("invalid-argument", "Enter a valid Delhivery production API token.");
  await getFirestore().collection("privateIntegrations").doc("delhivery").set({ token, updatedAt: FieldValue.serverTimestamp() });
  return { configured: true }; // Never return the token.
});
async function refreshOne(id) {
  const db = getFirestore();
  const reference = db.collection("workspaceState").doc("default");
  const [config, workspace] = await Promise.all([db.collection("privateIntegrations").doc("delhivery").get(), reference.get()]);
  const token = config.data()?.token;
  if (!token) throw new HttpsError("failed-precondition", "Add the Delhivery API token in Admin logistics settings first.");
  const shipment = workspace.data()?.payload?.consignments?.find(entry => entry.id === id);
  if (!shipment || shipment.deliveryMethod !== "THIRD_PARTY_DELIVERY" || !shipment.awbNumber) throw new HttpsError("failed-precondition", "Choose a Delhivery shipment with an AWB number.");
  if (!["DISPATCHED", "IN_TRANSIT"].includes(shipment.status)) throw new HttpsError("failed-precondition", "Only dispatched or in-transit shipments can be refreshed.");
  let tracking;
  try {
    const response = await fetch(`https://track.delhivery.com/api/v1/packages/json/?waybill=${encodeURIComponent(shipment.awbNumber)}`, { headers: { Authorization: `Token ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Partner request failed");
    tracking = parseTracking(await response.json(), shipment.awbNumber);
  } catch { throw new HttpsError("unavailable", "Delhivery could not confirm tracking. Check the API token and AWB, then retry."); }
  await db.runTransaction(async tx => {
    const current = await tx.get(reference);
    const data = current.data(); const payload = data?.payload;
    const target = payload?.consignments?.find(entry => entry.id === id);
    if (!target || target.awbNumber !== shipment.awbNumber || !["DISPATCHED", "IN_TRANSIT"].includes(target.status)) return;
    target.trackingStatus = tracking.status; target.trackingLocation = tracking.location; target.trackingUpdatedAt = new Date().toISOString();
    if (tracking.eta) { target.eta = tracking.eta; target.etaSource = "DELHIVERY"; }
    if (tracking.delivered) {
      target.status = "DELIVERED"; target.deliveredAt = tracking.at || target.trackingUpdatedAt;
      const ids = (payload.crates || []).filter(crate => target.crateIds.includes(crate.id)).flatMap(crate => crate.itemIds);
      (payload.items || []).filter(item => ids.includes(item.id) && ["DISPATCHED", "IN_TRANSIT"].includes(item.status)).forEach(item => { item.status = "DELIVERED_AT_SITE"; item.statusUpdatedAt = target.trackingUpdatedAt; });
      const project = payload.projects.find(entry => entry.id === target.projectId);
      if (project && !project.deliveredToSiteAt) project.deliveredToSiteAt = target.deliveredAt;
    }
    tx.update(reference, { payload, revision: Number(data.revision || 0) + 1, updatedAt: FieldValue.serverTimestamp() });
  });
  return tracking;
}
exports.refreshDelhiveryTracking = onCall(async request => { await requireAdmin(request); return refreshOne(String(request.data?.consignmentId ?? "")); });
exports.pollDelhiveryTracking = onSchedule({ schedule: "every 30 minutes", timeoutSeconds: 300 }, async () => {
  const db = getFirestore();
  if (!(await db.collection("privateIntegrations").doc("delhivery").get()).exists) return;
  const workspace = await db.collection("workspaceState").doc("default").get();
  const pending = (workspace.data()?.payload?.consignments || []).filter(entry => entry.deliveryMethod === "THIRD_PARTY_DELIVERY" && entry.awbNumber && ["DISPATCHED", "IN_TRANSIT"].includes(entry.status));
  pending.sort((a, b) => (a.trackingUpdatedAt || "").localeCompare(b.trackingUpdatedAt || ""));
  for (const shipment of pending.slice(0, 10)) { try { await refreshOne(shipment.id); } catch { /* Retry on the next poll; never substitute guessed status/ETA. */ } }
});
