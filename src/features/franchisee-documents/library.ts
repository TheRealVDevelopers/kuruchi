import { collection, deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import type { AppUser } from "@/types";
import {
  documentName, isSharedCategory, LIBRARY_COLLECTION, LIBRARY_STORAGE_ROOT,
  requireLibraryAdmin, validateLibraryFile,
  type SharedDocumentCategory, type SharedFranchiseeDocument,
} from "./model";

function services(actor: AppUser) {
  requireLibraryAdmin(actor);
  if (!db || !storage) throw new Error("Document uploads are unavailable. Please try again shortly.");
  if (auth?.currentUser?.uid !== actor.uid) throw new Error("Sign in again before managing documents.");
  return { database: db, bucket: storage };
}

export async function uploadSharedDocument(actor: AppUser, category: SharedDocumentCategory, name: string, file: File) {
  const { database, bucket } = services(actor);
  if (!isSharedCategory(category)) throw new Error("Choose Kurchi KYC Documents or Instruction Manuals.");
  const title = documentName(name);
  const contentType = validateLibraryFile(file);
  const record = doc(collection(database, LIBRARY_COLLECTION));
  const fileName = file.name.replace(/[^a-z0-9._-]/gi, "-").slice(0, 100) || "document";
  const storagePath = `${LIBRARY_STORAGE_ROOT}/${category}/${record.id}/${fileName}`;
  const object = ref(bucket, storagePath);
  await uploadBytes(object, file, { contentType });
  try {
    const fileUrl = await getDownloadURL(object);
    await setDoc(record, {
      category, name: title, originalName: file.name, fileUrl, storagePath, contentType,
      size: file.size, uploadedBy: actor.name, uploadedByUid: actor.uid,
      uploadedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return record.id;
  } catch (error) {
    // A lost acknowledgement must not remove an already-published file.
    const saved = await getDoc(record).catch(() => null);
    if (saved?.exists()) return record.id;
    if (saved) await deleteObject(object).catch(() => undefined);
    throw error;
  }
}

export async function renameSharedDocument(actor: AppUser, document: SharedFranchiseeDocument, name: string) {
  const { database } = services(actor);
  await updateDoc(doc(database, LIBRARY_COLLECTION, document.id), { name: documentName(name), updatedAt: serverTimestamp() });
}

export async function removeSharedDocument(actor: AppUser, document: SharedFranchiseeDocument) {
  const { database, bucket } = services(actor);
  const expected = `${LIBRARY_STORAGE_ROOT}/${document.category}/${document.id}/`;
  if (!document.storagePath.startsWith(expected)) throw new Error("This document's file location is invalid.");
  try {
    await deleteObject(ref(bucket, document.storagePath));
  } catch (error) {
    if ((error as { code?: string }).code !== "storage/object-not-found") throw error;
  }
  // Retain the record on failure so Admin can retry removing it.
  await deleteDoc(doc(database, LIBRARY_COLLECTION, document.id));
}
