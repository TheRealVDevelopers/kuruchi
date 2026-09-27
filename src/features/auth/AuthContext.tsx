import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppUser, Role } from "@/types";
import { repo } from "@/data/repo";
import { isFirebaseConfigured } from "@/lib/firebase";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AppUser>;
  signOut: () => void;
  /** demo convenience — jump between roles without five sets of credentials */
  switchRole: (role: Role) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "kurchi.session";

/** Where each role lands after signing in. */
export const HOME_ROUTE: Record<Role, string> = {
  SUPER_ADMIN: "/hq",
  ADMIN: "/admin",
  INSTALLATION: "/site",
  ACCOUNTS: "/accounts",
  CLIENT: "/portal",
  VENDOR: "/franchisee",
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { email: string };
        setUser(repo.userByEmail(saved.email));
      }
    } catch {
      // private window, blocked storage — start signed out
    }
    setLoading(false);
  }, []);

  function persist(next: AppUser | null) {
    setUser(next);
    try {
      if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify({ email: next.email }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // non-fatal — the session just won't survive a reload
    }
  }

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      async signIn(email: string, password: string) {
        if (isFirebaseConfigured) {
          // TODO: signInWithEmailAndPassword + read the role custom claim.
          // Until then the demo directory below is the source of truth.
        }
        const found = repo.userByEmail(email);
        if (!found) throw new Error("No account for that email address.");
        if (!found.active) throw new Error("This account has been deactivated.");
        if (!password) throw new Error("Enter your password.");
        persist(found);
        return found;
      },
      signOut() {
        persist(null);
      },
      switchRole(role: Role) {
        const next = repo.users().find((u) => u.role === role);
        if (next) persist(next);
      },
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
