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
const { randomBytes } = require("node:crypto");
const { normaliseInvite, provisionIdentity, invitationError } = require("./workspaceUserProvisioning");
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

const ROLES = new Set(["SUPER_ADMIN", "ADMIN", "ACCOUNTS", "INSTALLATION", "CLIENT", "VENDOR"]);

function requireAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.role !== "ADMIN") throw new HttpsError("permission-denied", "Only Kurchi Admin can invite users.");
}

function requireClient(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.role !== "CLIENT" || !request.auth.token.clientId) {
    throw new HttpsError("permission-denied", "Only an authorised Ola user can invite a franchisee owner.");
  }
  return String(request.auth.token.clientId);
}

function temporaryPassword() {
  // A temporary value is required by Firebase to create an email/password
  // account. It is never shown or sent; the user sets their own password from
  // Firebase's password-reset email.
  return `Kp!${randomBytes(18).toString("base64url")}`;
}

/**
 * Creates or updates a real Firebase user, assigns their workspace role, and
 * stores the safe profile used by the web app. The initial Admin needs to be
 * granted the ADMIN custom claim once from a trusted server-side setup.
 */
exports.provisionWorkspaceUser = onCall(async (request) => {
  requireAdmin(request);
  try {
    if (!ROLES.has(request.data?.role)) throw new HttpsError("invalid-argument", "Choose a valid workspace role.");
    const data = normaliseInvite(request.data || {});
    const admin = getAuth();
    const user = await provisionIdentity(admin, data, request.auth.uid);
    const claims = {
      ...user.customClaims,
      role: data.role,
      active: !user.disabled,
      clientId: data.clientId || null,
      teamId: data.teamId || null,
      vendorId: data.vendorId || null,
    };
    await admin.setCustomUserClaims(user.uid, claims);
    const profile = {
      uid: user.uid,
      name: data.name,
      email: user.email || "",
      role: data.role,
      active: !user.disabled,
      clientId: data.clientId || null,
      teamId: data.teamId || null,
      vendorId: data.vendorId || null,
      ...(user.phoneNumber ? { phoneNumber: user.phoneNumber, phone: user.phoneNumber } : {}),
      provisionedAt: FieldValue.serverTimestamp(),
      provisionedBy: request.auth.uid,
      passwordSetupRequired: Boolean(user.email && !data.initialPassword),
    };
    await getFirestore().collection("workspaceProfiles").doc(user.uid).set(profile, { merge: true });
    return { uid: user.uid, email: user.email || null, phoneNumber: user.phoneNumber || null, role: data.role, active: profile.active, passwordSetupRequired: profile.passwordSetupRequired };
  } catch (error) {
    if (!(error instanceof HttpsError)) logger.error("Workspace invitation failed", { code: error.code || "unknown", message: error.message });
    throw invitationError(error);
  }
});

/** Admin's member list comes from the same protected profiles used at login. */
exports.listWorkspaceUsers = onCall(async (request) => {
  requireAdmin(request);
  const profiles = await getFirestore().collection("workspaceProfiles").get();
  return { users: profiles.docs.map((snapshot) => {
    const profile = snapshot.data();
    return {
      uid: snapshot.id, name: profile.name || "Kurchi user", email: profile.email || "",
      role: profile.role, active: profile.active !== false,
      phone: profile.phoneNumber || profile.phone || null,
      clientId: profile.clientId || null, teamId: profile.teamId || null, vendorId: profile.vendorId || null,
    };
  }) };
});

exports.setWorkspaceUserActive = onCall(async (request) => {
  requireAdmin(request);
  const { uid, active } = request.data || {};
  if (typeof uid !== "string" || typeof active !== "boolean") throw new HttpsError("invalid-argument", "Choose a user and access status.");
  if (!active && uid === request.auth.uid) throw new HttpsError("failed-precondition", "You cannot deactivate your own account.");
  const firestore = getFirestore();
  const reference = firestore.collection("workspaceProfiles").doc(uid);
  const previous = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists) throw new HttpsError("not-found", "This workspace user was not found.");
    const profile = snapshot.data();
    if (!active && profile.role === "ADMIN") {
      const admins = await transaction.get(firestore.collection("workspaceProfiles").where("role", "==", "ADMIN"));
      if (admins.docs.filter((entry) => entry.data().active !== false).length <= 1) throw new HttpsError("failed-precondition", "Keep at least one active Admin account.");
    }
    transaction.update(reference, { active });
    return profile.active !== false;
  });
  try {
    const auth = getAuth();
    const user = await auth.updateUser(uid, { disabled: !active });
    await auth.setCustomUserClaims(uid, { ...user.customClaims, active });
    if (!active) await auth.revokeRefreshTokens(uid);
  } catch (error) {
    await reference.update({ active: previous });
    throw invitationError(error);
  }
  return { uid, active };
});

/**
 * One-time recovery for the deliberately shared demonstration administrator.
 * It closes itself in Firestore immediately after the credential is restored,
 * so it cannot become a permanent public password-reset endpoint.
 */
exports.repairDemoAdminAccess = onCall(async (request) => {
  if (request.data?.activation !== "kurchi-demo-admin-restore-2026") {
    throw new HttpsError("permission-denied", "Invalid recovery request.");
  }
  const firestore = getFirestore();
  const lock = firestore.collection("workspaceSettings").doc("demoAdminRecovery");
  await firestore.runTransaction(async (transaction) => {
    const existing = await transaction.get(lock);
    if (existing.exists) throw new HttpsError("failed-precondition", "The demo Admin recovery has already been completed.");
    transaction.create(lock, { completedAt: FieldValue.serverTimestamp() });
  });

  const auth = getAuth();
  let user;
  try {
    user = await auth.getUserByEmail("admin@kurchi.com");
    user = await auth.updateUser(user.uid, { displayName: "Kurchi Admin", password: "123456", disabled: false });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email: "admin@kurchi.com", displayName: "Kurchi Admin", password: "123456", disabled: false });
  }
  await auth.setCustomUserClaims(user.uid, { role: "ADMIN", active: true });
  await firestore.collection("workspaceProfiles").doc(user.uid).set({
    uid: user.uid, name: "Kurchi Admin", email: "admin@kurchi.com", role: "ADMIN", active: true,
    restoredAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { email: "admin@kurchi.com", role: "ADMIN" };
});

/**
 * Ola creates the showroom and supplies the owner details. This privileged
 * server call creates the franchisee-only account; the browser then asks
 * Firebase Auth to send its standard first-time password email.
 */
exports.inviteFranchiseeOwner = onCall(async (request) => {
  const clientId = requireClient(request);
  const data = request.data || {};
  const email = String(data.email || "").trim().toLowerCase();
  const name = String(data.name || "").trim();
  const vendorId = String(data.vendorId || "").trim();
  if (!name || !email || !vendorId) throw new HttpsError("invalid-argument", "Franchisee name, email and showroom assignment are required.");
  if (data.clientId && data.clientId !== clientId) throw new HttpsError("permission-denied", "This showroom belongs to another Ola account.");

  const admin = getAuth();
  let user;
  try {
    user = await admin.getUserByEmail(email);
    user = await admin.updateUser(user.uid, { displayName: name, disabled: false });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    user = await admin.createUser({ email, password: temporaryPassword(), displayName: name, disabled: false });
  }
  await admin.setCustomUserClaims(user.uid, { role: "VENDOR", active: true, clientId, vendorId });
  await getFirestore().collection("workspaceProfiles").doc(user.uid).set({
    uid: user.uid, name, email, role: "VENDOR", active: true, clientId, vendorId,
    invitedAt: FieldValue.serverTimestamp(), invitedBy: request.auth.uid,
    passwordSetupRequired: true,
  }, { merge: true });
  return { uid: user.uid, email, role: "VENDOR", passwordSetupRequired: true };
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
    { email: "admin@kurchi.com", name: "Kurchi Admin", role: "ADMIN", password: "123456" },
    { email: "superadmin@kurchi.com", name: "Kurchi Super Admin", role: "SUPER_ADMIN", password: "123457" },
    { email: "installation@kurchi.com", name: "Installation Team", role: "INSTALLATION", teamId: "demo-installation-team", password: "123458" },
    { email: "accounts@kurchi.com", name: "Accounts Team", role: "ACCOUNTS", password: "123459" },
    { email: "ola@kurchi.com", name: "Ola Team", role: "CLIENT", clientId: "demo-ola", password: "123460" },
    { email: "franchisee@kurchi.com", name: "Franchisee Owner", role: "VENDOR", vendorId: "demo-franchisee", password: "123461" },
  ];

  const auth = getAuth();
  const created = [];
  for (const account of accounts) {
    let user;
    try {
      user = await auth.getUserByEmail(account.email);
      user = await auth.updateUser(user.uid, { displayName: account.name, password: account.password, disabled: false });
    } catch (error) {
      if (error.code !== "auth/user-not-found") throw error;
      user = await auth.createUser({ email: account.email, password: account.password, displayName: account.name, disabled: false });
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
 * Optional live ETA provider. Until Kurchi configures a Google Routes key in
 * the protected runtime, this deliberately returns the safe fallback ETA.
 */
exports.estimateDelivery = onCall(async (request) => {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  const { origin, destination, method } = request.data || {};
  if (!origin || !destination) throw new HttpsError("invalid-argument", "Origin and destination are required.");
  const fallbackDays = method === "DIRECT_TRUCK" ? 2 : 4;
  const fallback = () => {
    const eta = new Date(); eta.setDate(eta.getDate() + fallbackDays);
    return { source: "fallback", eta: eta.toISOString(), durationHours: fallbackDays * 24 };
  };
  const key = process.env.GOOGLE_MAPS_API_KEY;
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
