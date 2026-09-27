import { RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult } from "firebase/auth";
import { auth } from "@/lib/firebase";

let confirmation: ConfirmationResult | null = null;
let verifier: RecaptchaVerifier | null = null;

function phone(value: string) {
  const cleaned = value.replace(/[\s()-]/g, "");
  return cleaned.startsWith("+") ? cleaned : `+91${cleaned.replace(/^0/, "")}`;
}

export async function sendPhoneOtp(rawPhone: string, containerId: string) {
  if (!auth) throw new Error("Firebase authentication is not configured.");
  verifier?.clear();
  verifier = new RecaptchaVerifier(auth, containerId, { size: "invisible" });
  confirmation = await signInWithPhoneNumber(auth, phone(rawPhone), verifier);
}

export async function confirmPhoneOtp(code: string) {
  if (!confirmation) throw new Error("Request a new OTP first.");
  return confirmation.confirm(code.trim());
}

export function clearPhoneOtp() {
  confirmation = null;
  verifier?.clear();
  verifier = null;
}
