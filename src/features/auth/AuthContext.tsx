import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AppUser, Role } from "@/types";
import { auth, db, isFirebaseConfigured } from "@/lib/firebase";
import { clearPhoneOtp, confirmPhoneOtp, sendPhoneOtp } from "@/lib/firebaseAuth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";

interface AuthState {
  user: AppUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<AppUser>;
  sendOtp: (phone: string, recaptchaContainerId: string) => Promise<void>;
  confirmOtp: (code: string) => Promise<AppUser>;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const STORAGE_KEY = "kurchi.session";

/** Real Firebase authentication is mandatory for every workspace route. */
export const AUTH_BYPASS_ENABLED = false;

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
    if (auth && isFirebaseConfigured) {
      const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
        try {
          if (!firebaseUser) {
            persist(null);
            return;
          }
          const profile = await firebaseProfile(firebaseUser.uid);
          if (!profile || !profile.active) {
            await firebaseSignOut(auth);
            persist(null);
            return;
          }
          persist(profile);
        } catch {
          persist(null);
        } finally {
          setLoading(false);
        }
      });
      return unsubscribe;
    }
    setLoading(false);
  }, []);

  // Removing or disabling a login also signs out any browser already using it.
  useEffect(() => {
    if (!db || !auth || !user?.uid) return;
    return onSnapshot(doc(db, "workspaceProfiles", user.uid), (snapshot) => {
      if (!snapshot.exists() || snapshot.data().active === false) {
        setUser(null);
        void firebaseSignOut(auth!);
      } else {
        setUser(snapshot.data() as AppUser);
      }
    });
  }, [user?.uid]);

  async function firebaseProfile(uid: string): Promise<AppUser | null> {
    if (functions) {
      const response = await httpsCallable<unknown, AppUser>(functions, "saveMyWorkspaceProfile")({});
      return response.data;
    }
    if (db) {
      const snapshot = await getDoc(doc(db, "workspaceProfiles", uid));
      if (snapshot.exists()) return snapshot.data() as AppUser;
    }
    return null;
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
        if (!auth || !isFirebaseConfigured) throw new Error("Firebase Authentication is not configured for this deployment.");
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const profile = await firebaseProfile(credential.user.uid);
        if (!profile || !profile.active) {
          await firebaseSignOut(auth);
          throw new Error("This Firebase account has not been given an active Kurchi workspace role yet.");
        }
        persist(profile);
        return profile;
      },
      async sendOtp(phone, recaptchaContainerId) {
        await sendPhoneOtp(phone, recaptchaContainerId);
      },
      async confirmOtp(code) {
        const credential = await confirmPhoneOtp(code);
        const profile = await firebaseProfile(credential.user.uid);
        if (!profile || !profile.active) {
          await firebaseSignOut(auth!);
          throw new Error("This phone number has not been invited to a Kurchi workspace yet.");
        }
        persist(profile);
        return profile;
      },
      signOut() {
        clearPhoneOtp();
        if (auth) void firebaseSignOut(auth);
        persist(null);
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
