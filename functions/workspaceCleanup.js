/** Pure cleanup planning: no network calls and no changes to the input. */
const WORK_COLLECTIONS = [
  "products", "kits", "clients", "programmes", "vendors", "projects", "items",
  "crates", "consignments", "tickets", "snags", "progressLogs", "comments",
  "invoices", "challans", "payments", "creditNotes", "changeOrders", "inventory",
  "vendorBills", "costEntries", "purchaseOrders", "scheduleTasks", "documents",
  "notifications", "enquiries", "audit",
];

function rows(payload, key) { return Array.isArray(payload[key]) ? payload[key] : []; }

function numberFloors(payload) {
  const floors = { INV: Number(payload.documentNumberFloor?.INV || 121), DC: Number(payload.documentNumberFloor?.DC || 141) };
  for (const [kind, key] of [["INV", "invoices"], ["DC", "challans"]]) {
    for (const row of rows(payload, key)) {
      const number = Number(String(row.number || "").split("/").pop());
      if (Number.isFinite(number)) floors[kind] = Math.max(floors[kind], number);
    }
  }
  let recordIdFloor = Number(payload.recordIdFloor || 1000);
  for (const key of WORK_COLLECTIONS) {
    for (const row of rows(payload, key)) {
      const number = Number(String(row.id || "").split("-").pop());
      if (Number.isFinite(number)) recordIdFloor = Math.max(recordIdFloor, number);
    }
  }
  return { documentNumberFloor: floors, recordIdFloor };
}

function buildDeletionPlan(input, scope, projectIds = []) {
  if (!["PROJECTS", "CLEAR_WORKSPACE"].includes(scope)) throw new Error("Choose projects or clear workspace.");
  const payload = JSON.parse(JSON.stringify(input || {}));
  const ids = new Set(projectIds);
  const projects = rows(payload, "projects").filter((row) => ids.has(row.id));
  if (scope === "PROJECTS" && (!ids.size || projects.length !== ids.size)) throw new Error("One or more selected projects no longer exist. Refresh and select again.");
  const removedIds = new Set(projectIds);
  const removedEntities = new Set(projectIds.map((id) => `projects/${id}`));
  const invoiceIds = new Set(projectIds.map((id) => `advance-${id}`));
  for (const key of WORK_COLLECTIONS) {
    for (const row of rows(payload, key)) {
      if (ids.has(row.projectId)) {
        removedIds.add(row.id);
        removedEntities.add(`${key}/${row.id}`);
        if (key === "scheduleTasks") removedEntities.add(`schedule/${row.id}`);
        if (key === "invoices") invoiceIds.add(row.id);
      }
    }
  }
  const counts = {};
  const next = { ...payload, ...numberFloors(payload) };
  for (const key of WORK_COLLECTIONS) {
    const before = rows(payload, key);
    next[key] = scope === "CLEAR_WORKSPACE" ? [] : before.filter((row) => {
      if (key === "projects") return !ids.has(row.id);
      if (ids.has(row.projectId)) return false;
      if (key === "payments" && invoiceIds.has(row.invoiceId)) return false;
      if (key === "audit" && removedEntities.has(row.entity)) return false;
      if (key === "notifications") {
        // Exact path/query segments only: pr-1 must not match pr-10.
        const segments = String(row.link || "").split(/[/?#&=]/).map((part) => { try { return decodeURIComponent(part); } catch { return part; } });
        if (segments.some((part) => removedIds.has(part))) return false;
      }
      return true;
    });
    counts[key] = before.length - next[key].length;
  }
  next.handoverSigned = scope === "CLEAR_WORKSPACE" ? {} : Object.fromEntries(
    Object.entries(payload.handoverSigned || {}).filter(([id]) => !ids.has(id)),
  );
  return {
    payload: next, counts, total: Object.values(counts).reduce((sum, count) => sum + count, 0),
    projects: projects.map(({ id, code, name }) => ({ id, code, name })),
    confirmation: scope === "CLEAR_WORKSPACE" ? "CLEAR WORKSPACE" : "DELETE PROJECTS",
  };
}

function assertUserDeletion(profiles, uids, actorUid) {
  if (!Array.isArray(uids) || !uids.length || uids.length > 100 || uids.some((uid) => typeof uid !== "string" || !uid || uid.includes("/"))) throw new Error("Select between 1 and 100 workspace users.");
  const selected = new Set(uids);
  if (selected.size !== uids.length) throw new Error("Select each user only once.");
  if (selected.has(actorUid)) throw new Error("You cannot delete the Admin account you are using.");
  if (profiles.filter((profile) => selected.has(profile.uid)).length !== selected.size) throw new Error("A selected user no longer exists in this workspace. Refresh the list.");
  if (!profiles.some((profile) => profile.role === "ADMIN" && profile.active !== false && !selected.has(profile.uid))) throw new Error("Keep at least one active Admin account.");
}

module.exports = { WORK_COLLECTIONS, buildDeletionPlan, assertUserDeletion };
