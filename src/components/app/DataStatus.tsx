import { Link } from "react-router-dom";
import { AlertTriangle, Database } from "lucide-react";
import { persistence, useDb } from "@/data/store";
import { sharedWorkspaceStatus } from "@/data/cloudSync";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";

export function DataStatus({ className }: { className?: string }) {
  useDb();
  const { user } = useAuth();
  const connected = sharedWorkspaceStatus.connected;
  return <section className={cn("rounded-2xl border bg-card p-4", className)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-start gap-2.5">
        {connected ? <Database className="mt-1 h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="mt-1 h-4 w-4 text-primary" />}
        <div><p className="text-sm font-bold">{connected ? "Shared workspace connected" : "Shared workspace not connected"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{connected ? "Changes sync between signed-in devices. This browser also keeps a local cache." : "Local changes may not be visible to others until the workspace reconnects."}</p>
          {persistence.reason && <p className="mt-1 text-xs text-amber-700">{persistence.reason}</p>}
        </div>
      </div>
      {user?.role === "ADMIN" && <Link to="/admin/data" className="inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold hover:bg-muted">Manage data</Link>}
    </div>
  </section>;
}
