import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AlertCircle, ArrowRight } from "lucide-react";
import { HOME_ROUTE, useAuth } from "./AuthContext";
import { repo } from "@/data/repo";
import { cn } from "@/lib/utils";

const ROLE_BLURB: Record<string, string> = {
  SUPER_ADMIN: "Everything, read-only",
  ADMIN: "Runs operations",
  INSTALLATION: "Site crew, phone-first",
  ACCOUNTS: "GST & billing",
  CLIENT: "Ola rollout team",
  VENDOR: "Franchisee owner",
};

const ACCESS_LABEL: Record<string, string> = {
  CLIENT: "Ola login",
  VENDOR: "Franchisee login",
  ADMIN: "Kurchi login · Admin",
  ACCOUNTS: "Kurchi login · Accounts",
  INSTALLATION: "Kurchi login · Installation",
  SUPER_ADMIN: "Kurchi login · Management",
};

const DEMO_GROUPS = [
  { title: "Ola", roles: ["CLIENT"] },
  { title: "Franchisee", roles: ["VENDOR"] },
  { title: "Kurchi team", roles: ["ADMIN", "INSTALLATION", "ACCOUNTS", "SUPER_ADMIN"] },
];

export default function LoginPage() {
  const { user, signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={HOME_ROUTE[user.role]} replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
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

          <form onSubmit={onSubmit} className="mt-7 space-y-4">
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

            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4" /></>}
            </button>
          </form>

          <Link to="/" className="mt-6 block text-center text-sm text-muted-foreground hover:text-foreground">
            ← Back to the site
          </Link>
        </div>
      </div>

      {/* --------------------------------------------- demo role picker */}
      <div className="flex items-center justify-center bg-rail px-5 py-12 text-rail-foreground sm:px-10">
        <div className="w-full max-w-lg">
          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-rail-muted">
            Demo access — choose a login
          </p>
          <h2 className="mt-2 text-3xl text-rail-foreground">Choose your workspace</h2>
          <p className="mt-2 text-sm leading-relaxed text-rail-muted">
            Ola manages franchisees. Franchisees choose and approve BOQs. Kurchi teams manage production, delivery, installation and accounts.
          </p>

          <div className="mt-7 space-y-5">
            {DEMO_GROUPS.map((group) => <section key={group.title}>
              <p className="mb-2 text-xs font-bold uppercase tracking-[.14em] text-rail-muted">{group.title}</p>
              <ul className="space-y-2">
              {repo.users().filter((u) => group.roles.includes(u.role)).map((u) => (
              <li key={u.uid}>
                <button
                  type="button"
                  onClick={() => { setEmail(u.email); setPassword("demo"); }}
                  className={cn(
                    "flex min-h-14 w-full items-center justify-between gap-3 rounded-2xl border border-rail-border bg-rail-hover px-4 py-3 text-left transition-colors",
                    "hover:border-primary/60",
                    email === u.email && "border-primary ring-1 ring-primary"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-rail-foreground">
                      {u.name}
                    </span>
                    <span className="block truncate text-xs text-rail-muted">
                      {ACCESS_LABEL[u.role]} · {ROLE_BLURB[u.role]}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-rail-muted">{u.email.split("@")[0]}</span>
                </button>
              </li>
              ))}
              </ul>
            </section>)}
          </div>

          <p className="mt-5 text-xs leading-relaxed text-rail-muted">
            This is a safe preview with sample roles and local sample data. Any password works.
          </p>
        </div>
      </div>
    </div>
  );
}
