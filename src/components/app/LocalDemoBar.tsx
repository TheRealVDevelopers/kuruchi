import { useNavigate } from "react-router-dom";
import { HOME_ROUTE, useAuth } from "@/features/auth/AuthContext";
import { db } from "@/data/store";
import type { Role } from "@/types";

const ROLES: [Role, string, string][] = [
  ["CLIENT", "1. Ola", "Create the showroom, choose the BOQ and submit the advance reference."],
  ["ACCOUNTS", "2. Accounts", "Verify payment, issue shipment invoices and record e-way details."],
  ["ADMIN", "3. Admin", "Accept the showroom, assign the crew, make, pack and dispatch the items."],
  ["INSTALLATION", "4. Installation", "Receive delivered items and mark them installed. Report any damage or shortage."],
  ["VENDOR", "5. Franchisee", "Track each item, view documents and sign off the completed installation."],
  ["SUPER_ADMIN", "6. Overview", "Review the final showroom status and project costs."],
];

export function LocalDemoBar() {
  const { user, switchDemoRole } = useAuth();
  const navigate = useNavigate();
  return <aside className="border-b border-amber-500/40 bg-amber-500/10 p-3" aria-label="Local demonstration controls">
    <div className="mx-auto flex max-w-[84rem] flex-wrap items-center gap-3">
      <div className="mr-auto"><p className="text-xs font-extrabold text-amber-600">LOCAL DEMO · NO LIVE RECORDS OR MESSAGES</p><p className="mt-1 text-xs">{ROLES.find(([role]) => role === user?.role)?.[2]}</p></div>
      <label className="text-xs font-bold">View as <select aria-label="Demo role" value={user?.role} onChange={(event) => {
        const role = event.target.value as Role;
        const ownerId = db.projects[0]?.franchiseeId;
        switchDemoRole?.(role, ownerId);
        navigate(HOME_ROUTE[role]);
      }} className="ml-2 rounded-lg border bg-background p-2">{ROLES.map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
    </div>
  </aside>;
}
