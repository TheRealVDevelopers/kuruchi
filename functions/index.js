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
const { getAuth } = require("firebase-admin/auth");
const { setGlobalOptions } = require("firebase-functions/v2");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { logger } = require("firebase-functions");

initializeApp();
setGlobalOptions({ region: "asia-south1", maxInstances: 5 });

const SLA_MS = 48 * 60 * 60 * 1000;
const googleMapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

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

const ROLES = new Set(["SUPER_ADMIN", "ADMIN", "ACCOUNTS", "INSTALLATION", "CLIENT", "VENDOR"]);

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.role !== "ADMIN") throw new HttpsError("permission-denied", "Only Kurchi Admin can invite users.");
}

/**
 * Creates or updates a real Firebase user, assigns their workspace role, and
 * stores the safe profile used by the web app. The initial Admin needs to be
 * granted the ADMIN custom claim once from a trusted server-side setup.
 */
exports.provisionWorkspaceUser = onCall(async (request) => {
  requireAdmin(request);
  const data = request.data || {};
  if (!ROLES.has(data.role)) throw new HttpsError("invalid-argument", "Choose a valid workspace role.");
  if (!data.email && !data.phoneNumber) throw new HttpsError("invalid-argument", "Provide an email address or mobile number.");
  if (data.phoneNumber && !/^\+[1-9]\d{7,14}$/.test(data.phoneNumber)) {
    throw new HttpsError("invalid-argument", "Use an E.164 mobile number, for example +919876543210.");
  }

  const admin = getAuth();
  let user;
  try {
    user = data.email ? await admin.getUserByEmail(data.email.trim().toLowerCase()) : await admin.getUserByPhoneNumber(data.phoneNumber);
    user = await admin.updateUser(user.uid, { displayName: data.name?.trim() || user.displayName, phoneNumber: data.phoneNumber || user.phoneNumber });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await admin.createUser({ email: data.email?.trim().toLowerCase(), phoneNumber: data.phoneNumber, displayName: data.name?.trim(), disabled: false });
  }

  const claims = {
    role: data.role,
    active: true,
    clientId: data.clientId || null,
    teamId: data.teamId || null,
    vendorId: data.vendorId || null,
  };
  await admin.setCustomUserClaims(user.uid, claims);
  const profile = {
    uid: user.uid,
    name: data.name?.trim() || user.displayName || "Kurchi user",
    email: data.email?.trim().toLowerCase() || user.email || "",
    role: data.role,
    active: true,
    clientId: data.clientId || undefined,
    teamId: data.teamId || undefined,
    vendorId: data.vendorId || undefined,
    phoneNumber: data.phoneNumber || user.phoneNumber || undefined,
    provisionedAt: FieldValue.serverTimestamp(),
    provisionedBy: request.auth.uid,
  };
  await getFirestore().collection("workspaceProfiles").doc(user.uid).set(profile, { merge: true });
  return { uid: user.uid, email: user.email || null, phoneNumber: user.phoneNumber || null, role: data.role };
});

/**
 * One-time initialisation for the explicitly requested training workspace.
 * It deliberately accepts no supplied roles, names or passwords: the fixed
 * accounts below are the only records it can create. Once any workspace
 * profile exists, this endpoint closes itself permanently.
 */
exports.bootstrapDemoUsers = onCall(async (request) => {
  const firestore = getFirestore();
  if (request.data?.action === "rename-demo-domains") {
    requireAdmin(request);
    const changes = [
      ["admin@kuruchi.com", "admin@kurchi.com"],
      ["superadmin@kuruchi.com", "superadmin@kurchi.com"],
      ["installation@kuruchi.com", "installation@kurchi.com"],
      ["accounts@kuruchi.com", "accounts@kurchi.com"],
      ["ola@kuruchi.com", "ola@kurchi.com"],
      ["franchisee@kuruchi.com", "franchisee@kurchi.com"],
    ];
    const auth = getAuth();
    const updated = [];
    for (const [oldEmail, newEmail] of changes) {
      let user;
      try {
        user = await auth.getUserByEmail(oldEmail);
      } catch (error) {
        if (error.code === "auth/user-not-found") continue;
        throw error;
      }
      await auth.updateUser(user.uid, { email: newEmail, emailVerified: false });
      await firestore.collection("workspaceProfiles").doc(user.uid).set({ email: newEmail }, { merge: true });
      updated.push(newEmail);
    }
    return { updated };
  }
  const existing = await firestore.collection("workspaceProfiles").limit(1).get();
  if (!existing.empty) {
    throw new HttpsError("failed-precondition", "The workspace has already been initialised.");
  }

  const accounts = [
    { email: "admin@kurchi.com", name: "Kurchi Admin", role: "ADMIN" },
    { email: "superadmin@kurchi.com", name: "Kurchi Super Admin", role: "SUPER_ADMIN" },
    { email: "installation@kurchi.com", name: "Installation Team", role: "INSTALLATION", teamId: "demo-installation-team" },
    { email: "accounts@kurchi.com", name: "Accounts Team", role: "ACCOUNTS" },
    { email: "ola@kurchi.com", name: "Ola Team", role: "CLIENT", clientId: "demo-ola" },
    { email: "franchisee@kurchi.com", name: "Franchisee Owner", role: "VENDOR", vendorId: "demo-franchisee" },
  ];

  const auth = getAuth();
  const created = [];
  for (const account of accounts) {
    let user;
    try {
      user = await auth.getUserByEmail(account.email);
      user = await auth.updateUser(user.uid, { displayName: account.name, password: "123456", disabled: false });
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      user = await auth.createUser({ email: account.email, password: "123456", displayName: account.name, disabled: false });
    }

    const claims = { role: account.role, active: true, clientId: account.clientId || null, teamId: account.teamId || null };
    await auth.setCustomUserClaims(user.uid, claims);
    await firestore.collection("workspaceProfiles").doc(user.uid).create({
      uid: user.uid,
      name: account.name,
      email: account.email,
      role: account.role,
      active: true,
      ...(account.clientId ? { clientId: account.clientId } : {}),
      ...(account.teamId ? { teamId: account.teamId } : {}),
      bootstrappedAt: FieldValue.serverTimestamp(),
    });
    created.push({ email: account.email, role: account.role });
  }
  logger.info("Training workspace demo accounts initialised.", { count: created.length });
  return { created };
});

/** Corrects the initial training-address typo without recreating any accounts. */
exports.renameDemoAccountDomains = onCall(async (request) => {
  requireAdmin(request);
  const changes = [
    ["admin@kuruchi.com", "admin@kurchi.com"],
    ["superadmin@kuruchi.com", "superadmin@kurchi.com"],
    ["installation@kuruchi.com", "installation@kurchi.com"],
    ["accounts@kuruchi.com", "accounts@kurchi.com"],
    ["ola@kuruchi.com", "ola@kurchi.com"],
    ["franchisee@kuruchi.com", "franchisee@kurchi.com"],
  ];
  const auth = getAuth();
  const updated = [];
  for (const [oldEmail, newEmail] of changes) {
    let user;
    try {
      user = await auth.getUserByEmail(oldEmail);
    } catch (error) {
      if (error.code === "auth/user-not-found") continue;
      throw error;
    }
    await auth.updateUser(user.uid, { email: newEmail, emailVerified: false });
    await getFirestore().collection("workspaceProfiles").doc(user.uid).set({ email: newEmail }, { merge: true });
    updated.push(newEmail);
  }
  return { updated };
});

/** Returns the signed-in user's safe workspace profile after email or OTP login. */
exports.getMyWorkspaceProfile = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const profile = await getFirestore().collection("workspaceProfiles").doc(request.auth.uid).get();
  if (!profile.exists) throw new HttpsError("not-found", "This account has not been invited to Kurchi Projects.");
  return profile.data();
});

/**
 * Optional live ETA provider. Set GOOGLE_MAPS_API_KEY in the Functions
 * runtime to use Google Routes; without it the UI keeps its safe fallback ETA.
 */
exports.estimateDelivery = onCall({ secrets: [googleMapsApiKey] }, async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const { origin, destination, method } = request.data || {};
  if (!origin || !destination) throw new HttpsError("invalid-argument", "Origin and destination are required.");
  const fallbackDays = method === "DIRECT_TRUCK" ? 2 : 4;
  const fallback = () => {
    const eta = new Date(); eta.setDate(eta.getDate() + fallbackDays);
    return { source: "fallback", eta: eta.toISOString(), durationHours: fallbackDays * 24 };
  };
  const key = googleMapsApiKey.value();
  if (!key) return fallback();
  try {
    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.duration,routes.distanceMeters" },
      body: JSON.stringify({ origin: { address: origin }, destination: { address: destination }, travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" }),
    });
    if (!response.ok) throw new Error(`Routes API ${response.status}`);
    const payload = await response.json();
    const seconds = Number(String(payload.routes?.[0]?.duration || "0s").replace("s", ""));
    if (!seconds) throw new Error("Routes API returned no duration");
    const eta = new Date(Date.now() + seconds * 1000 + 24 * 60 * 60 * 1000);
    return { source: "google-routes", eta: eta.toISOString(), durationHours: Math.ceil(seconds / 3600), distanceMeters: payload.routes[0].distanceMeters };
  } catch (error) {
    logger.warn("Route estimate fallback used", error);
    return fallback();
  }
});
