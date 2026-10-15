import { useCallback, useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/features/auth/AuthContext";
import { isSharedCategory, LIBRARY_COLLECTION, type SharedFranchiseeDocument } from "./model";

export function useSharedDocuments() {
  const { user } = useAuth();
  const allowed = Boolean(user?.active && ["ADMIN", "VENDOR"].includes(user.role));
  const [documents, setDocuments] = useState<SharedFranchiseeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    setDocuments([]);
    setError("");
    if (!allowed || !db) {
      setLoading(false);
      if (allowed && !db) setError("The shared document library is unavailable.");
      return;
    }
    setLoading(true);
    return onSnapshot(query(collection(db, LIBRARY_COLLECTION), orderBy("uploadedAt", "desc")), (snapshot) => {
      const rows = snapshot.docs.flatMap((entry) => {
        const data = entry.data();
        if (!isSharedCategory(data.category)) return [];
        return [{ ...data, id: entry.id, uploadedAt: data.uploadedAt?.toDate?.().toISOString() ?? "" } as SharedFranchiseeDocument];
      });
      setDocuments(rows);
      setLoading(false);
    }, () => {
      setDocuments([]);
      setLoading(false);
      setError("Shared documents could not be loaded. Please refresh or ask Kurchi Admin for help.");
    });
  }, [allowed, user?.uid, attempt]);

  return { documents: allowed ? documents : [], loading: allowed && loading, error, retry };
}
