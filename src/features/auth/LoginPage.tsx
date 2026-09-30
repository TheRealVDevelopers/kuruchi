import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight, KeyRound, Smartphone } from "lucide-react";
import { HOME_ROUTE, useAuth } from "./AuthContext";
import { sendFirstTimePasswordEmail } from "@/lib/firebaseInvites";

export default function LoginPage() {
  const { user, signIn, sendOtp, confirmOtp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loginMode, setLoginMode] = useState<"email" | "phone">("email");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  if (user) return <Navigate to={HOME_ROUTE[user.role]} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const signed = await signIn(email, password);
      navigate(HOME_ROUTE[signed.role], { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError(null);
    setNotice(null);
    if (!email.trim()) { setError("Enter your email address first, then select Set or reset password."); return; }
    setBusy(true);
    try {
      await sendFirstTimePasswordEmail(email);
      setNotice("Password setup email sent. Open it, choose your password, then return here to sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the password setup email.");
    } finally {
      setBusy(false);
    }
  }

  async function requestOtp() { setError(null); setBusy(true); try { await sendOtp(phone, "otp-recaptcha"); setOtpSent(true); } catch (err) { setError(err instanceof Error ? err.message : "Could not send OTP."); } finally { setBusy(false); } }
  async function verifyOtp(e: FormEvent) { e.preventDefault(); setError(null); setBusy(true); try { const signed = await confirmOtp(otp); navigate(HOME_ROUTE[signed.role], { replace: true }); } catch (err) { setError(err instanceof Error ? err.message : "OTP could not be verified."); } finally { setBusy(false); } }

  return (
    <div className="grid min-h-[calc(100vh-4.5rem)] lg:grid-cols-[.9fr_1.1fr]">
      {/* ------------------------------------------------------ the form */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
          <p className="eyebrow text-primary">Welcome back</p>
          <h1 className="mt-2 text-3xl">Sign in</h1>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            Enter your details to see only the work meant for you.
          </p>

          <div className="mt-7 grid grid-cols-2 rounded-xl bg-muted p-1"><button type="button" onClick={() => setLoginMode("email")} className={`rounded-lg px-3 py-2 text-sm font-bold ${loginMode === "email" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Email</button><button type="button" onClick={() => setLoginMode("phone")} className={`rounded-lg px-3 py-2 text-sm font-bold ${loginMode === "phone" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Mobile OTP</button></div>
          {loginMode === "email" ? <form onSubmit={onSubmit} className="mt-5 space-y-4">
            <div>
              <label htmlFor="email" className="eyebrow mb-1.5 block">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="min-h-12 w-full rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div>
              <label htmlFor="password" className="eyebrow mb-1.5 block">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-12 w-full rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {error && (
              <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {error}
              </p>
            )}
            {notice && <p className="rounded-md border border-primary/25 bg-primary/10 p-3 text-sm font-medium text-foreground">{notice}</p>}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}
            </button>
            <button type="button" disabled={busy} onClick={() => void resetPassword()} className="w-full text-sm font-bold text-primary hover:underline disabled:opacity-50">Set or reset password</button>
          </form> : <form onSubmit={otpSent ? verifyOtp : (event) => { event.preventDefault(); void requestOtp(); }} className="mt-5 space-y-4"><div><label htmlFor="phone" className="eyebrow mb-1.5 block">Mobile number</label><input id="phone" type="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+91 98765 43210" className="min-h-12 w-full rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>{otpSent && <div><label htmlFor="otp" className="eyebrow mb-1.5 block">One-time password</label><input id="otp" inputMode="numeric" autoComplete="one-time-code" required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit OTP" className="min-h-12 w-full rounded-xl border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" /></div>}<div id="otp-recaptcha" />{error && <p className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}<button type="submit" disabled={busy} className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50">{busy ? "Please wait…" : otpSent ? <>Verify OTP <KeyRound className="h-4 w-4" /></> : <>Send OTP <Smartphone className="h-4 w-4" /></>}</button>{otpSent && <button type="button" onClick={() => { setOtpSent(false); setOtp(""); void requestOtp(); }} className="w-full text-sm font-bold text-primary">Send a new OTP</button>}</form>}

          <Link to="/" className="mt-6 block text-center text-sm text-muted-foreground hover:text-foreground">
            ← Back to the site
          </Link>
        </div>
      </div>

      {/* ---------------------------------------------- access explainer */}
      <div className="flex items-center justify-center bg-rail px-5 py-12 text-rail-foreground sm:px-10">
        <div className="w-full max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rail-muted">Secure workspace access</p>
          <h2 className="mt-2 text-3xl text-rail-foreground">One login. One role.</h2>
          <p className="mt-2 text-sm leading-relaxed text-rail-muted">
            Your account opens only the workspace assigned by Kurchi. There is no role switcher or sample-account access.
          </p>
          <div className="mt-7 space-y-3">
            <section className="rounded-2xl border border-rail-border bg-rail-hover p-4"><p className="font-bold text-rail-foreground">Ola &amp; Franchisee</p><p className="mt-1 text-sm text-rail-muted">See only your showrooms, selected BOQ, delivery documents and handover.</p></section>
            <section className="rounded-2xl border border-rail-border bg-rail-hover p-4"><p className="font-bold text-rail-foreground">Kurchi teams</p><p className="mt-1 text-sm text-rail-muted">Admin, Accounts and Installation each receive their own operational workspace.</p></section>
          </div>
          <p className="mt-5 text-xs leading-relaxed text-rail-muted">Need access? Ask a Kurchi Admin to create your account from Admin → Users. Mobile users can sign in using OTP after their number is added.</p>
        </div>
      </div>
    </div>
  );
}
