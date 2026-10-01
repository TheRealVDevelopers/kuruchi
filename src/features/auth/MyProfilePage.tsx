import { useEffect, useState, type FormEvent } from "react";
import { EmailAuthProvider, PhoneAuthProvider, RecaptchaVerifier, reauthenticateWithCredential, updatePassword, verifyBeforeUpdateEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { UserRound, Mail, KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { auth, functions } from "@/lib/firebase";
import { useAuth } from "./AuthContext";
import { sendFirstTimePasswordEmail } from "@/lib/firebaseInvites";
import { PageHeader } from "@/components/app/Shell";
import type { AppUser } from "@/types";

const field = "mt-2 min-h-12 w-full rounded-xl border bg-background px-3 text-sm";
const button = "min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40";
function message(error: unknown) {
  const code = (error as { code?: string })?.code;
  const labels: Record<string, string> = {
    "auth/invalid-credential": "Your current password or verification code is incorrect.", "auth/wrong-password": "Your current password is incorrect.",
    "auth/requires-recent-login": "Confirm your current password or request a new mobile OTP, then try again.", "auth/email-already-in-use": "That email is already used by another account.",
    "auth/invalid-email": "Enter a valid email address.", "auth/weak-password": "Choose a stronger password of at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Please wait before trying again.", "auth/network-request-failed": "Unable to connect. Check your internet connection and try again.",
  };
  return labels[code || ""] || (error instanceof Error ? error.message.replace(/^Firebase:\s*/, "") : "Could not save this change.");
}

export default function MyProfilePage() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [mode, setMode] = useState<"password" | "phone">(auth?.currentUser?.providerData.some((p) => p.providerId === "password") ? "password" : "phone");
  const [verificationId, setVerificationId] = useState("");
  const [otp, setOtp] = useState("");
  const [verifier, setVerifier] = useState<RecaptchaVerifier | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => () => verifier?.clear(), [verifier]);
  const savedName = user?.name;
  useEffect(() => { if (savedName) setName(savedName); }, [savedName]);
  if (!user) return null;
  const hasEmail = Boolean(auth?.currentUser?.email);
  const hasPassword = Boolean(auth?.currentUser?.providerData.some((p) => p.providerId === "password"));
  const hasPhone = Boolean(auth?.currentUser?.phoneNumber);
  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key); setError(null); setNotice(null);
    try { await action(); } catch (err) { setError(message(err)); } finally { setBusy(null); }
  };
  const sync = async (patch: { name?: string } = {}) => {
    if (!functions || !auth?.currentUser) throw new Error("Sign in again to update your profile.");
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    await httpsCallable<unknown, AppUser>(functions, "saveMyWorkspaceProfile")(patch);
  };
  const reauthenticate = async () => {
    const current = auth?.currentUser;
    if (!current) throw new Error("Sign in again to continue.");
    if (mode === "password" && current.email && hasPassword) {
      if (!password) throw new Error("Enter your current password in the Confirm your identity section.");
      await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, password));
    } else {
      if (!verificationId || !otp.trim()) throw new Error("Request a mobile OTP and enter it in the Confirm your identity section.");
      await reauthenticateWithCredential(current, PhoneAuthProvider.credential(verificationId, otp.trim()));
      setOtp(""); setVerificationId("");
    }
  };
  const requestOtp = () => run("otp", async () => {
    if (!auth?.currentUser?.phoneNumber) throw new Error("There is no mobile linked to your account. Ask Admin to add your mobile.");
    verifier?.clear();
    const next = new RecaptchaVerifier(auth, "profile-recaptcha", { size: "invisible" }); setVerifier(next);
    setVerificationId(await new PhoneAuthProvider(auth).verifyPhoneNumber(auth.currentUser.phoneNumber, next));
    setNotice("OTP sent to your registered mobile. Enter it below before changing your email or password.");
  });
  return <>
    <PageHeader eyebrow="Your account" title="My profile" description="Manage your own details and sign-in. Your role and showroom access are controlled by Admin." />
    <div className="mb-5 flex items-center gap-3 rounded-2xl border bg-card p-4"><span className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary"><UserRound /></span><div><p className="font-extrabold">{user.name}</p><p className="text-sm text-muted-foreground">{user.role === "CLIENT" ? "Ola" : user.role === "VENDOR" ? "Franchisee owner" : user.role.replace(/_/g, " ")} · {user.email || user.phone || "Mobile sign-in"}</p></div></div>
    {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
    {notice && <p role="status" className="mb-4 rounded-xl bg-primary/10 p-4 text-sm font-bold">{notice}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-2">
      <section className="rounded-3xl border bg-card p-5"><h2 className="flex items-center gap-2 text-lg font-extrabold"><UserRound className="h-5 w-5 text-primary" />Your name</h2><form className="mt-4 space-y-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void run("name", async () => { await sync({ name: name.trim() }); toast.success("Your name was updated"); }); }}><label className="block text-sm font-bold">Full name<input value={name} required maxLength={100} onChange={(event) => setName(event.target.value)} autoComplete="name" className={field} /></label><button disabled={Boolean(busy) || !name.trim() || name.trim() === user.name} className={button}>{busy === "name" ? "Saving…" : "Save name"}</button></form></section>
      <section className="rounded-3xl border bg-card p-5"><h2 className="flex items-center gap-2 text-lg font-extrabold"><ShieldCheck className="h-5 w-5 text-primary" />Confirm your identity</h2><p className="mt-2 text-sm text-muted-foreground">Needed only when changing your email or password.</p>{hasPassword && hasPhone && <div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(busy)} onClick={() => setMode("password")} aria-pressed={mode === "password"} className="min-h-11 rounded-xl border px-3 text-sm font-bold">Current password</button><button type="button" disabled={Boolean(busy)} onClick={() => setMode("phone")} aria-pressed={mode === "phone"} className="min-h-11 rounded-xl border px-3 text-sm font-bold">Mobile OTP</button></div>}{mode === "password" && hasPassword ? <label className="mt-4 block text-sm font-bold">Current password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className={field} /></label> : hasPhone ? <div className="mt-4 space-y-3"><p className="text-sm text-muted-foreground">Registered mobile: {auth?.currentUser?.phoneNumber}</p><button type="button" disabled={Boolean(busy)} onClick={() => void requestOtp()} className="min-h-11 rounded-xl border px-4 text-sm font-bold">{busy === "otp" ? "Sending…" : verificationId ? "Send new OTP" : "Send verification OTP"}</button>{verificationId && <label className="block text-sm font-bold">Mobile OTP<input value={otp} onChange={(event) => setOtp(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className={field} /></label>}</div> : <p className="mt-4 text-sm text-muted-foreground">Use the reset-password email below to set a password, then sign in again.</p>}<div id="profile-recaptcha" /></section>
      <section className="rounded-3xl border bg-card p-5"><h2 className="flex items-center gap-2 text-lg font-extrabold"><Mail className="h-5 w-5 text-primary" />Email address</h2><p className="mt-2 text-sm text-muted-foreground">Current: {user.email || "No email linked yet"}. Verify the new address before it becomes your login. Your existing address stays active until verification.</p><form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void run("email", async () => { await reauthenticate(); await verifyBeforeUpdateEmail(auth!.currentUser!, email.trim(), { url: `${window.location.origin}/profile`, handleCodeInApp: false }); setNotice(`Verification email sent to ${email.trim()}. Open the link, then click Check verified email below. Check spam too.`); setPassword(""); }); }}><label className="block text-sm font-bold">New email<input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" className={field} /></label><button disabled={Boolean(busy) || !email.trim() || email.trim().toLowerCase() === user.email.toLowerCase()} className={button}>{busy === "email" ? "Sending…" : "Verify new email"}</button></form><button type="button" disabled={Boolean(busy)} onClick={() => void run("sync", async () => { await sync(); setNotice("Profile refreshed from Firebase. Only a verified email change is applied."); })} className="mt-3 min-h-11 rounded-xl border px-4 text-sm font-bold">Check verified email</button></section>
      <section className="rounded-3xl border bg-card p-5"><h2 className="flex items-center gap-2 text-lg font-extrabold"><KeyRound className="h-5 w-5 text-primary" />Password</h2><p className="mt-2 text-sm text-muted-foreground">Choose a password you do not use elsewhere. You can also get a secure reset link by email.</p>{hasEmail ? <><form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void run("password", async () => { if (newPassword !== repeatPassword) throw new Error("The new passwords do not match."); await reauthenticate(); await updatePassword(auth!.currentUser!, newPassword); setPassword(""); setNewPassword(""); setRepeatPassword(""); toast.success("Your password was changed"); }); }}><label className="block text-sm font-bold">New password<input type="password" required minLength={6} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" className={field} /></label><label className="block text-sm font-bold">Confirm new password<input type="password" required minLength={6} value={repeatPassword} onChange={(event) => setRepeatPassword(event.target.value)} autoComplete="new-password" className={field} /></label><button disabled={Boolean(busy)} className={button}>{busy === "password" ? "Changing…" : "Change password"}</button></form><button type="button" disabled={Boolean(busy)} onClick={() => void run("reset", async () => { const address = auth!.currentUser!.email!; await sendFirstTimePasswordEmail(address); setNotice(`A password-reset email was sent to ${address}. Open it to set your password. This requires a real mailbox you can access.`); })} className="mt-3 min-h-11 rounded-xl border px-4 text-sm font-bold">{busy === "reset" ? "Sending…" : "Send password-reset email"}</button></> : <p className="mt-4 rounded-xl bg-muted p-3 text-sm">Add and verify your email first. You can continue signing in with mobile OTP.</p>}</section>
    </div>
  </>;
}
