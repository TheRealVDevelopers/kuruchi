import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "@/lib/firebase";

/** Uploads a proof before a showroom is created. The signed-in user owns this folder. */
export async function uploadPaymentProof(file: File, uid: string): Promise<{ name: string; url: string }> {
  if (!storage) throw new Error("Firebase Storage is not available for this project yet.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const object = ref(storage, `pending-payment-proofs/${uid}/${Date.now()}-${safeName}`);
  await uploadBytes(object, file, { contentType: file.type || "application/octet-stream" });
  return { name: file.name, url: await getDownloadURL(object) };
}
