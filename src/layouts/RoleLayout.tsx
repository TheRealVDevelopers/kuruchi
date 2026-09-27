import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3, Bell, Boxes, Building2, ClipboardList, FileText, HardHat, Home,
  IndianRupee, LayoutGrid, LogOut, Menu, Package, Receipt, ScrollText,
  CircleHelp, Factory, ShieldCheck, SlidersHorizontal, Truck, Users, Wrench,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Role } from "@/types";
import { ROLES } from "@/types";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CommandPalette } from "@/components/app/CommandPalette";
import { useDb } from "@/data/store";
import { repo } from "@/data/repo";
import * as act from "@/data/actions";
import { ThemeToggle } from "@/components/app/ThemeToggle";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

const NAV: Record<Role, NavItem[]> = {
  SUPER_ADMIN: [
    { to: "/hq", label: "Command centre", icon: BarChart3, end: true },
    { to: "/hq/projects", label: "All projects", icon: LayoutGrid },
    { to: "/hq/finance", label: "P&L", icon: IndianRupee },
    { to: "/hq/people", label: "Teams", icon: Users },
    { to: "/hq/rules", label: "Rule book", icon: ScrollText },
    { to: "/hq/how-to-use", label: "How to use", icon: CircleHelp },
  ],
  ADMIN: [
    { to: "/admin", label: "Dashboard", icon: Home, end: true },
    { to: "/admin/projects", label: "Projects", icon: LayoutGrid },
    { to: "/admin/dispatch", label: "Delivery board", icon: Truck },
    { to: "/admin/tickets", label: "Damage & shortage", icon: Wrench },
    { to: "/admin/clients", label: "Ola account", icon: Building2 },
    { to: "/admin/catalogue", label: "Catalogue", icon: Package },
    { to: "/admin/kits", label: "BOQ kits", icon: Boxes },
    { to: "/admin/franchisees", label: "Franchisee owners", icon: Factory },
    { to: "/admin/cost-centres", label: "Project costs", icon: IndianRupee },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/how-to-use", label: "How to use", icon: CircleHelp },
  ],
  INSTALLATION: [
    { to: "/site", label: "My sites", icon: HardHat, end: true },
    { to: "/site/tickets", label: "My reports", icon: Wrench },
    { to: "/site/how-to-use", label: "How to use", icon: CircleHelp },
  ],
  ACCOUNTS: [
    { to: "/accounts", label: "Dashboard", icon: Home, end: true },
    { to: "/accounts/challans", label: "Delivery challans", icon: FileText },
    { to: "/accounts/eway", label: "E-way bills", icon: Truck },
    { to: "/accounts/invoices", label: "Tax invoices", icon: Receipt },
    { to: "/accounts/payments", label: "Payments", icon: IndianRupee },
    { to: "/accounts/retention", label: "Retention & DLP", icon: ShieldCheck },
    { to: "/accounts/cost-centres", label: "Cost centres", icon: SlidersHorizontal },
    { to: "/accounts/controls", label: "Credits & bills", icon: SlidersHorizontal },
    { to: "/accounts/how-to-use", label: "How to use", icon: CircleHelp },
  ],
  CLIENT: [
    { to: "/portal", label: "My showrooms", icon: LayoutGrid, end: true },
    { to: "/portal/showrooms/new", label: "Add showroom", icon: Building2 },
    { to: "/portal/approvals", label: "Project updates", icon: ClipboardList },
    { to: "/portal/how-to-use", label: "How to use", icon: CircleHelp },
  ],
  VENDOR: [
    { to: "/franchisee", label: "My BOQ", icon: Factory, end: true },
    { to: "/franchisee/how-to-use", label: "How to use", icon: CircleHelp },
  ],
};

const ROLE_META: Record<Role, { label: string; accent: string; note: string }> = {
  SUPER_ADMIN: { label: "Super Admin", accent: "bg-indigo-600", note: "View and comment only" },
  ADMIN: { label: "Admin", accent: "bg-primary", note: "Operations" },
  INSTALLATION: { label: "Installation", accent: "bg-red-700", note: "Site team" },
  ACCOUNTS: { label: "Accounts", accent: "bg-amber-700", note: "GST & billing" },
  CLIENT: { label: "Ola", accent: "bg-teal-700", note: "Franchisee rollout" },
  VENDOR: { label: "Franchisee", accent: "bg-violet-700", note: "Showroom partner" },
};

export const ROLE_HOME: Record<Role, string> = {
  SUPER_ADMIN: "/hq", ADMIN: "/admin", INSTALLATION: "/site",
  ACCOUNTS: "/accounts", CLIENT: "/portal",
  VENDOR: "/franchisee",
};

const ROLE_HELP: Record<Role, string> = {
  SUPER_ADMIN: "/hq/how-to-use",
  ADMIN: "/admin/how-to-use",
  INSTALLATION: "/site/how-to-use",
  ACCOUNTS: "/accounts/how-to-use",
  CLIENT: "/portal/how-to-use",
  VENDOR: "/franchisee/how-to-use",
};

export default function RoleLayout() {
  useDb();
  const { user, signOut, switchRole } = useAuth();
  const navigate = useNavigate();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  if (!user) return null;

  const meta = ROLE_META[user.role];
  const items = NAV[user.role];
  const notifications = repo.notifications(user);
  const unread = notifications.filter((notification) => !notification.readBy.includes(user.uid));

  const primaryItems = items.slice(0, Math.min(3, items.length));
  const secondaryItems = items.slice(primaryItems.length);

  const nav = (onNavigate?: () => void, compact = false) => (
    <nav className={cn("flex-1 space-y-1 overflow-y-auto", compact ? "p-3" : "p-2")}>
      <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-rail-muted">Your workspace</p>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-colors",
              isActive
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-rail-muted hover:bg-rail-hover hover:text-rail-foreground"
            )
          }
        >
          <item.icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );

  const brand = (
    <div className="flex h-[4.75rem] shrink-0 items-center gap-2.5 border-b border-rail-border px-5">
      <img src="/images/kurchi-logo.png" alt="Kurchi" className="h-9 w-auto max-w-[6.5rem] shrink-0 rounded-lg object-contain" />
      <div className="min-w-0">
          <p className="truncate text-sm font-extrabold leading-tight text-rail-foreground">Kurchi</p>
          <p className="truncate text-[11px] font-medium text-rail-muted">{meta.label} workspace</p>
      </div>
    </div>
  );

  const account = (
    <div className="shrink-0 border-t border-rail-border p-3">
      <div className="flex items-center gap-2 rounded-xl px-2 py-2">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white", meta.accent)}>
          {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight text-rail-foreground">{user.name}</p>
          <p className="truncate text-[11px] text-rail-muted">{meta.note}</p>
        </div>
        <button
          type="button"
          onClick={() => { signOut(); navigate("/"); }}
          title="Sign out"
          aria-label="Sign out"
          className="rounded p-2 text-rail-muted hover:bg-rail-hover hover:text-rail-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.5rem] max-w-[84rem] items-center gap-2 px-3 sm:px-6">
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open workspace menu"
                className="-ml-1 grid h-10 w-10 place-items-center rounded-xl hover:bg-muted"
              >
                <Menu className="h-5 w-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="flex w-[18.5rem] flex-col border-rail-border bg-rail p-0">
              {brand}
              {nav(() => setDrawerOpen(false), true)}
              {user.role === "SUPER_ADMIN" && <p className="mx-3 mb-3 rounded-xl bg-rail-hover p-3 text-xs leading-relaxed text-rail-muted"><b className="text-rail-foreground">View only.</b> You can review and comment, but cannot change records.</p>}
              {account}
            </SheetContent>
          </Sheet>

          <Link to={ROLE_HOME[user.role]} className="flex min-w-0 items-center gap-2">
            <img src="/images/kurchi-logo.png" alt="Kurchi" className="h-8 w-auto max-w-[5.5rem] shrink-0 rounded-md object-contain" />
            <span className="truncate text-sm font-extrabold"><span className="hidden text-muted-foreground sm:inline">{meta.label} workspace</span></span>
          </Link>

          <nav className="ml-5 hidden items-center gap-1 lg:flex">
            {primaryItems.map((item) => <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn("rounded-xl px-3 py-2 text-sm font-bold transition-colors", isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{item.label}</NavLink>)}
            {secondaryItems.length > 0 && <button onClick={() => setDrawerOpen(true)} className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground">More <ChevronRight className="h-3.5 w-3.5" /></button>}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <div className="relative">
              <button type="button" aria-label="Open notifications" onClick={() => { setNotificationsOpen((open) => !open); act.markNotificationsRead(user); }} className="relative rounded-md border p-2 hover:bg-muted">
                <Bell className="h-4 w-4" />
                {unread.length > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">{unread.length}</span>}
              </button>
              {notificationsOpen && <div className="absolute right-0 top-11 z-50 w-80 rounded-lg border bg-card p-2 shadow-xl"><p className="px-2 pb-2 text-sm font-bold">Notifications</p>{notifications.length === 0 ? <p className="px-2 py-4 text-sm text-muted-foreground">You are up to date.</p> : <div className="max-h-80 space-y-1 overflow-y-auto">{notifications.slice(0, 12).map((notification) => <Link key={notification.id} to={notification.link ?? ROLE_HOME[user.role]} onClick={() => setNotificationsOpen(false)} className="block rounded-md px-2 py-2 hover:bg-muted"><p className="text-sm font-semibold">{notification.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{notification.detail}</p></Link>)}</div>}</div>}
            </div>
            {/* Demo role switcher stays available but no longer competes with daily work. */}
            <select
              id="role-switcher"
              value={user.role}
              onChange={(e) => {
                const role = e.target.value as Role;
                switchRole(role);
                navigate(ROLE_HOME[role]);
              }}
              aria-label="Switch demo role"
              className="hidden max-w-[9.5rem] rounded-xl border bg-background px-2 py-2 text-sm font-medium xl:block"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{ROLE_META[r].label}</option>
              ))}
            </select>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[84rem] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:pb-10">
        <Outlet />
      </main>

      <CommandPalette />

      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-2xl border bg-card/95 p-1.5 shadow-xl shadow-black/10 backdrop-blur-xl lg:hidden">
          {primaryItems.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn("flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-bold", isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground") }>
              <item.icon className="h-4 w-4" />
              <span className="max-w-16 truncate">{item.label.split(" ")[0]}</span>
            </NavLink>
          ))}
          <button onClick={() => setDrawerOpen(true)} className="flex min-h-14 min-w-14 flex-col items-center justify-center gap-1 rounded-xl px-2 text-[10px] font-bold text-muted-foreground"><Menu className="h-4 w-4" /><span>More</span></button>
      </nav>
    </div>
  );
}
