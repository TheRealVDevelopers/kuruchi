import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppUser, Role } from "@/types";
import { repo } from "@/data/repo";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { clearPhoneOtp, confirmPhoneOtp, sendPhoneOtp } from "@/lib/firebaseAuth";
import { doc, getDoc } from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AppUser>;
  sendOtp: (phone: string, recaptchaContainerId: string) => Promise<void>;
  confirmOtp: (code: string) => Promise<AppUser>;
  signOut: () => void;
  /** demo convenience — jump between roles without five sets of credentials */
  switchRole: (role: Role) => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "kurchi.session";

/**
 * Temporary presentation mode. The app opens as Kurchi Admin without asking
 * for credentials; role switching in the top bar remains available for demos.
 * Set this to false before inviting real users or enabling production access.
 */
export const AUTH_BYPASS_ENABLED = true;

function demoUserForRole(role: Role): AppUser {
  const template = repo.users().find((candidate) => candidate.role === role);
  if (!template) throw new Error(`The temporary ${role} demo user is missing.`);
  // Presentation mode has one role-switching identity per workspace. Map it
  // to the first real record so the complete flow can be demonstrated without
  // creating Firebase accounts. Real sign-in uses the scoped profile instead.
  if (role === "VENDOR") {
    const franchisee = repo.vendors("FRANCHISEE")[0];
    return franchisee ? { ...template, vendorId: franchisee.id } : template;
  }
  if (role === "INSTALLATION") {
    const team = repo.vendors("INSTALLATION")[0];
    return team ? { ...template, teamId: team.id } : template;
  }
  return template;
}

function defaultDemoUser(): AppUser {
  const path = window.location.pathname;
  const role: Role = path.startsWith("/portal")
    ? "CLIENT"
    : path.startsWith("/franchisee")
      ? "VENDOR"
      : path.startsWith("/site")
        ? "INSTALLATION"
        : path.startsWith("/accounts")
          ? "ACCOUNTS"
          : path.startsWith("/hq")
            ? "SUPER_ADMIN"
            : "ADMIN";
  return demoUserForRole(role);
}

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
    if (AUTH_BYPASS_ENABLED) {
      persist(defaultDemoUser());
      setLoading(false);
      return;
    }
    if (auth) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        if (!firebaseUser) return;
        const profile = await firebaseProfile(firebaseUser.uid, firebaseUser.email ?? undefined);
        if (profile) persist(profile);
      });
      return unsubscribe;
    }
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

  async function firebaseProfile(uid: string, email?: string): Promise<AppUser | null> {
    if (db) {
      const snapshot = await getDoc(doc(db, "workspaceProfiles", uid));
      if (snapshot.exists()) return snapshot.data() as AppUser;
    }
    return email ? repo.userByEmail(email) ?? null : null;
  }

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
        if (AUTH_BYPASS_ENABLED) {
          const requested = repo.userByEmail(email);
          const preview = requested ? demoUserForRole(requested.role) : defaultDemoUser();
          persist(preview);
          return preview;
        }
        if (auth && isFirebaseConfigured) {
          try {
            const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
            const profile = await firebaseProfile(credential.user.uid, credential.user.email ?? undefined);
            if (!profile) {
              await firebaseSignOut(auth);
              throw new Error("This Firebase account has not been given a Kurchi workspace role yet.");
            }
            persist(profile);
            return profile;
          } catch (error) {
            const preview = repo.userByEmail(email);
            if (!preview || !password) throw error;
            // Keep the public prototype usable while real accounts are invited.
            persist(preview);
            return preview;
          }
        }
        const found = repo.userByEmail(email);
        if (!found) throw new Error("No account for that email address.");
        if (!found.active) throw new Error("This account has been deactivated.");
        if (!password) throw new Error("Enter your password.");
        persist(found);
        return found;
      },
      async sendOtp(phone, recaptchaContainerId) {
        if (AUTH_BYPASS_ENABLED) throw new Error("Sign-in is temporarily disabled for this demo.");
        await sendPhoneOtp(phone, recaptchaContainerId);
      },
      async confirmOtp(code) {
        if (AUTH_BYPASS_ENABLED) throw new Error("Sign-in is temporarily disabled for this demo.");
        const credential = await confirmPhoneOtp(code);
        const profile = await firebaseProfile(credential.user.uid, credential.user.email ?? undefined);
        if (!profile) {
          await firebaseSignOut(auth!);
          throw new Error("This phone number has not been invited to a Kurchi workspace yet.");
        }
        persist(profile);
        return profile;
      },
      signOut() {
        if (AUTH_BYPASS_ENABLED) {
          persist(defaultDemoUser());
          return;
        }
        clearPhoneOtp();
        if (auth) void firebaseSignOut(auth);
        persist(null);
      },
      switchRole(role: Role) {
        persist(demoUserForRole(role));
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
