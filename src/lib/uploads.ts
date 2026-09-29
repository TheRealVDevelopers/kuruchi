import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";

function safeSegment(value: string) {
  return value.replace(/[^a-z0-9._-]/gi, "-").replace(/-+/g, "-").slice(0, 90) || "file";
}

/** Store binary outside Firestore. The fallback supports local development without Firebase. */
export async function uploadWorkspaceFile(file: File, folder: string) {
  if (storage) {
    const key = `demo-workspace/${safeSegment(folder)}/${Date.now()}-${crypto.randomUUID()}-${safeSegment(file.name)}`;
    const target = ref(storage, key);
    await uploadBytes(target, file, { contentType: file.type || "application/octet-stream" });
    return getDownloadURL(target);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("File could not be read."));
    reader.onerror = () => reject(new Error("File could not be read."));
    reader.readAsDataURL(file);
  });
}
