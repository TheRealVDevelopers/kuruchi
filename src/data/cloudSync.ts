/**
 * Shared workspace transport with queued writes and server cleanup barriers.
 *
 * The application still keeps a local copy for fast rendering, while this
 * Firestore document makes the working data visible to every browser. When
 * Admin cleanup increments a server-only generation so stale tabs cannot
 * resurrect deleted data, even when an older save is still in flight.
 */

import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db as firestore } from "@/lib/firebase";

const COLLECTION = "workspaceState";
const DOCUMENT = "default";
let ready = false;
let revision = 0;
let appliedRevision = 0;
let basePayload: Record<string, unknown> | null = null;
let pendingWrites = 0;
let unsubscribe: (() => void) | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let applyWorkspace: ((payload: Record<string, unknown>) => void) | null = null;
let generation = 0;
let session = 0;
let started = false;
export const sharedWorkspaceStatus = { connected: false };

function clean(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function same(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isIdArray(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value) && value.every((entry) => isPlainObject(entry) && typeof entry.id === "string");
}

/**
 * Three-way merge a local edit onto the newest shared workspace. This keeps an
 * unrelated change made in another browser, while a genuine same-field clash
 * intentionally favours the local user who just saved it.
 */
function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (isIdArray(base) || isIdArray(local) || isIdArray(remote)) {
    const baseRows = isIdArray(base) ? base : [];
    const localRows = isIdArray(local) ? local : [];
    const remoteRows = isIdArray(remote) ? remote : [];
    const byId = (rows: Array<Record<string, unknown>>) => new Map(rows.map((row) => [row.id as string, row]));
    const baseById = byId(baseRows);
    const localById = byId(localRows);
    const remoteById = byId(remoteRows);
    const ids = [...remoteRows.map((row) => row.id as string), ...localRows.map((row) => row.id as string).filter((id) => !remoteById.has(id))];
    return ids.flatMap((id) => {
      const baseRow = baseById.get(id);
      const localRow = localById.get(id);
      const remoteRow = remoteById.get(id);
      // A local removal made after the base snapshot wins; an unchanged local
      // row does not resurrect something another browser removed.
      if (baseRow && !localRow) return [];
      if (baseRow && !remoteRow && same(localRow, baseRow)) return [];
      if (!localRow) return remoteRow ? [remoteRow] : [];
      if (!remoteRow) return [localRow];
      return [mergeValue(baseRow ?? {}, localRow, remoteRow)];
    });
  }
  if (isPlainObject(base) || isPlainObject(local) || isPlainObject(remote)) {
    const baseObject = isPlainObject(base) ? base : {};
    const localObject = isPlainObject(local) ? local : {};
    const remoteObject = isPlainObject(remote) ? remote : {};
    const result: Record<string, unknown> = {};
    const keys = new Set([...Object.keys(baseObject), ...Object.keys(localObject), ...Object.keys(remoteObject)]);
    keys.forEach((key) => {
      const merged = mergeValue(baseObject[key], localObject[key], remoteObject[key]);
      if (merged !== undefined) result[key] = merged;
    });
    return result;
  }
  return local;
}

function mergeWorkspace(base: Record<string, unknown>, local: Record<string, unknown>, remote: Record<string, unknown>) {
  return clean(mergeValue(base, local, remote));
}

export function connectSharedWorkspace(
  readLocal: () => Record<string, unknown>,
  applyRemote: (payload: Record<string, unknown>) => void,
  report: (message: string) => void,
) {
  if (!firestore || !auth || started || typeof window === "undefined") return;
  started = true;
  applyWorkspace = applyRemote;
  const reference = doc(firestore, COLLECTION, DOCUMENT);
  onAuthStateChanged(auth, (user) => {
    session += 1;
    const connectedSession = session;
    unsubscribe?.();
    unsubscribe = null;
    ready = false;
    sharedWorkspaceStatus.connected = false;
    appliedRevision = 0;
    revision = 0;
    basePayload = null;
    if (!user) return;
    unsubscribe = onSnapshot(reference, (snapshot) => {
    if (connectedSession !== session) return;
    if (snapshot.exists()) {
      const payload = snapshot.data().payload;
      const remoteRevision = Number(snapshot.data().revision ?? 0);
      const remoteGeneration = Number(snapshot.data().generation ?? 0);
      if (!payload || typeof payload !== "object" || remoteRevision <= appliedRevision) return;

      // A cleanup is authoritative even while older edits are waiting. Apply it
      // immediately; all queued saves captured the old generation and will stop.
      if (!ready || remoteGeneration !== generation) {
        generation = remoteGeneration;
        ready = true;
        sharedWorkspaceStatus.connected = true;
        revision = remoteRevision;
        appliedRevision = remoteRevision;
        basePayload = clean(payload);
        applyRemote(basePayload);
        return;
      }

      revision = Math.max(revision, remoteRevision);
      // While this browser has edits waiting, an older server snapshot must not
      // repaint its screen. The queued transaction will merge those edits with
      // the newest server document before it writes.
      if (pendingWrites > 0 || snapshot.metadata.hasPendingWrites) return;

      const remote = clean(payload);
      basePayload = remote;
      appliedRevision = remoteRevision;
      applyRemote(remote);
      return;
    }
    const initial = clean(readLocal());
    basePayload = initial;
    pendingWrites += 1;
    void setDoc(reference, { payload: initial, updatedAt: serverTimestamp(), schemaVersion: 1, revision: 1, generation: 0 })
      .then(() => { if (session === connectedSession) revision = Math.max(revision, 1); })
      .catch(() => report("Shared workspace could not be created. Changes remain on this device."))
      .finally(() => { pendingWrites -= 1; });
    }, () => { ready = false; sharedWorkspaceStatus.connected = false; report("Shared workspace is unavailable. Changes remain on this device."); });
  });
}

export function publishSharedWorkspace(readLocal: () => Record<string, unknown>, report: (message: string) => void) {
  if (!firestore || !ready) return;
  const reference = doc(firestore, COLLECTION, DOCUMENT);
  const expectedGeneration = generation;
  const expectedSession = session;
  pendingWrites += 1;
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    if (!ready || expectedSession !== session || expectedGeneration !== generation) return;
    // Read only when this queued write begins. A bulk click or rapid toggles
    // therefore save one current workspace, not a chain of stale snapshots.
    const local = clean(readLocal());
    const base = clean(basePayload ?? local);
    const result = await runTransaction(firestore, async (transaction) => {
      const current = await transaction.get(reference);
      const currentRevision = Number(current.data()?.revision ?? 0);
      const currentGeneration = Number(current.data()?.generation ?? 0);
      const remote = current.data()?.payload && typeof current.data()?.payload === "object"
        ? clean(current.data()?.payload)
        : base;
      if (expectedSession !== session || expectedGeneration !== currentGeneration) {
        return { nextRevision: currentRevision, payload: remote, generation: currentGeneration, discarded: true };
      }
      const payload = mergeWorkspace(base, local, remote);
      payload.workspaceGeneration = currentGeneration;
      const nextRevision = currentRevision + 1;
      transaction.set(reference, { payload, updatedAt: serverTimestamp(), schemaVersion: 1, revision: nextRevision, generation: currentGeneration }, { merge: true });
      return { nextRevision, payload, generation: currentGeneration, discarded: false };
    });
    if (expectedSession !== session || result.nextRevision < appliedRevision) return;
    if (result.discarded || result.generation !== expectedGeneration) {
      generation = result.generation;
      revision = result.nextRevision;
      appliedRevision = result.nextRevision;
      basePayload = result.payload;
      applyWorkspace?.(result.payload);
      report("Admin deleted workspace data. Unsaved edits from before that cleanup were discarded. Please review before editing again.");
      return;
    }
    revision = Math.max(revision, result.nextRevision);
    appliedRevision = Math.max(appliedRevision, result.nextRevision);
    // The transaction may have retained an edit from another browser. Bring it
    // into this tab immediately, but layer any click made while the network
    // request was running back on top before rendering.
    const localAfterWriteStarted = clean(readLocal());
    const reconciledLocal = mergeWorkspace(local, localAfterWriteStarted, result.payload);
    basePayload = result.payload;
    if (!same(localAfterWriteStarted, reconciledLocal)) applyWorkspace?.(reconciledLocal);
  }).catch(() => {
    report("Shared workspace could not be saved. Changes remain on this device.");
  }).finally(() => { pendingWrites -= 1; });
}
