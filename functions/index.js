/**
 * Kurchi Projects — server-side operations.
 *
 * This file deliberately does not send SMS, WhatsApp messages or emails.
 * It only creates in-app alert records. Delivery channels are connected later.
 *
 * Firestore data contract (activated when the app moves off local demo data):
 *   projects/{projectId}
 *     operationalStatus: "DELIVERED"
 *     deliveredToSiteAt: Firestore Timestamp | ISO string
 *     installationStartedAt: absent until the site team starts work
 *
 *   notifications/installation-sla-{projectId}
 *     role: "ADMIN"
 *     title, detail, link, createdAt, readBy
 */

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 5 });

const SLA_MS = 48 * 60 * 60 * 1000;

function asMillis(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value.toMillis === "function") return value.toMillis();
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

async function checkInstallationStartSla() {
  const firestore = getFirestore();
  let delivered;
  try {
    delivered = await firestore.collection("projects").where("operationalStatus", "==", "DELIVERED").get();
  } catch (error) {
    // Firestore is intentionally connected in the next phase. Do not make the
    // scheduled function fail noisily before then.
    logger.warn("Installation SLA check skipped: Firestore is not ready.", error);
    return { checked: 0, alerted: 0, skipped: true };
  }

  const now = Date.now();
  let alerted = 0;
  const writes = [];
  delivered.forEach((snapshot) => {
    const project = snapshot.data();
    const deliveredAt = asMillis(project.deliveredToSiteAt);
    if (!deliveredAt || project.installationStartedAt || now - deliveredAt < SLA_MS) return;

    const alertRef = firestore.collection("notifications").doc(`installation-sla-${snapshot.id}`);
    writes.push(alertRef.set({
      id: alertRef.id,
      role: "ADMIN",
      title: "Installation start overdue",
      detail: `${project.name || project.site?.city || "A showroom"} was delivered more than 48 hours ago. Contact the installation team.`,
      link: `/admin/projects/${snapshot.id}`,
      createdAt: FieldValue.serverTimestamp(),
      readBy: [],
      projectId: snapshot.id,
      type: "INSTALLATION_SLA",
    }, { merge: true }));
    writes.push(snapshot.ref.set({ installationSlaAlertedAt: FieldValue.serverTimestamp() }, { merge: true }));
    alerted += 1;
  });
  await Promise.all(writes);
  logger.info("Installation SLA check completed.", { checked: delivered.size, alerted });
  return { checked: delivered.size, alerted, skipped: false };
}

/** Runs automatically once each hour after Firestore is connected. */
exports.installationStartWatch = onSchedule("every 60 minutes", async () => {
  await checkInstallationStartSla();
});

/**
 * Admin-only manual check. Useful after the app moves to Firebase Auth with
 * the `role: ADMIN` custom claim. It has no user-facing call site yet.
 */
exports.runInstallationSlaCheck = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.role !== "ADMIN") {
    throw new HttpsError("permission-denied", "Only Kurchi Admin can run this check.");
  }
  return checkInstallationStartSla();
});
