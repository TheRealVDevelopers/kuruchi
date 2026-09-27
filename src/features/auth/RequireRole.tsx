import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import type { Role } from "@/types";
import { HOME_ROUTE, useAuth } from "./AuthContext";

/**
 * Route guard. A signed-in user who lands on someone else's section is sent to
 * their own home rather than shown a 403 — it is almost always a stale bookmark,
 * not an attack.
 */
export function RequireRole({ allow, children }: { allow: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }

  if (!allow.includes(user.role)) {
    return <Navigate to={HOME_ROUTE[user.role]} replace />;
  }

  return <>{children}</>;
}
