import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Firebase sends this from its configured Password reset email template. The
 * link is deliberately used as a first-time password setup link: Kurchi never
 * needs to know or show a franchisee's password.
 */
export async function sendFirstTimePasswordEmail(email: string) {
  if (!auth) throw new Error("Firebase Authentication is not configured for this deployment.");
  await sendPasswordResetEmail(auth, email.trim().toLowerCase(), {
    url: `${window.location.origin}/login`,
    handleCodeInApp: false,
  });
}
