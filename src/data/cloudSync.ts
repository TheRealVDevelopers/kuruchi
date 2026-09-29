/**
 * Temporary shared workspace transport.
 *
 * The application still keeps a local copy for fast rendering, while this
 * Firestore document makes the working data visible to every browser. When
 * role authentication is switched back on, this single demo document should
 * be replaced by role-protected collection documents.
 */

import { doc, onSnapshot, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { db as firestore } from "@/lib/firebase";

const COLLECTION = "workspaceState";
const DOCUMENT = "default";
let ready = false;
let revision = 0;
let unsubscribe: (() => void) | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function clean(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export function connectSharedWorkspace(
  readLocal: () => Record<string, unknown>,
  applyRemote: (payload: Record<string, unknown>) => void,
  report: (message: string) => void,
) {
  if (!firestore || unsubscribe || typeof window === "undefined") return;
  const reference = doc(firestore, COLLECTION, DOCUMENT);
  unsubscribe = onSnapshot(reference, (snapshot) => {
    if (snapshot.exists()) {
      const payload = snapshot.data().payload;
      revision = Number(snapshot.data().revision ?? 0);
      ready = true;
      if (payload && typeof payload === "object") applyRemote(payload as Record<string, unknown>);
      return;
    }
    ready = true;
    void setDoc(reference, { payload: clean(readLocal()), updatedAt: serverTimestamp(), schemaVersion: 1, revision: 1 })
      .catch(() => report("Shared workspace could not be created. Changes remain on this device."));
  }, () => report("Shared workspace is unavailable. Changes remain on this device."));
}

export function publishSharedWorkspace(data: Record<string, unknown>, report: (message: string) => void) {
  if (!firestore || !ready) return;
  const payload = clean(data);
  const reference = doc(firestore, COLLECTION, DOCUMENT);
  writeQueue = writeQueue.catch(() => undefined).then(async () => {
    const nextRevision = await runTransaction(firestore, async (transaction) => {
      const current = await transaction.get(reference);
      const currentRevision = Number(current.data()?.revision ?? 0);
      transaction.set(reference, { payload, updatedAt: serverTimestamp(), schemaVersion: 1, revision: currentRevision + 1 }, { merge: true });
      return currentRevision + 1;
    });
    revision = nextRevision;
  }).catch(() => {
    report("Shared workspace could not be saved. Changes remain on this device.");
  });
}
