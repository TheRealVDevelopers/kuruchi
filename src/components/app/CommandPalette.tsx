import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  group: string;
  to: string;
  hint?: string;
}

/** `g` then a letter — the navigation shortcuts an expert user expects. */
const GOTO: Record<string, Record<string, string>> = {
  ADMIN: {
    d: "/admin", p: "/admin/projects", n: "/admin/projects/new",
    b: "/admin/dispatch", t: "/admin/tickets", c: "/admin/catalogue",
    k: "/admin/kits", v: "/admin/vendors", l: "/admin/clients", u: "/admin/users",
  },
  SUPER_ADMIN: { d: "/hq", p: "/hq/projects", f: "/hq/finance", t: "/hq/people", r: "/hq/rules" },
  ACCOUNTS: {
    d: "/accounts", c: "/accounts/challans", e: "/accounts/eway",
    i: "/accounts/invoices", p: "/accounts/payments", r: "/accounts/retention",
  },
  INSTALLATION: { d: "/site", t: "/site/tickets" },
  CLIENT: { d: "/portal", a: "/portal/approvals" },
};

/**
 * Cmd/Ctrl-K to jump anywhere, `g` + letter for the screens you hit all day.
 *
 * On a dense tool the mouse is the slow path — someone moving twenty items
 * through QC should never have to go back to the sidebar.
 */
export function CommandPalette() {
  useDb();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const awaitingGoto = useRef(false);

  const commands = useMemo<Command[]>(() => {
    if (!user) return [];
    const nav = Object.entries(GOTO[user.role] ?? {}).map(([key, to]) => ({
      id: `nav-${to}`,
      label: to.split("/").filter(Boolean).slice(-1)[0]?.replace(/-/g, " ") || "dashboard",
      group: "Go to",
      to,
      hint: `g ${key}`,
    }));

    const projects = repo.projects(user).map((p) => ({
      id: `prj-${p.id}`,
      label: `${p.site.city} — ${p.code}`,
      group: "Projects",
      to:
        user.role === "SUPER_ADMIN" ? `/hq/projects/${p.id}`
        : user.role === "CLIENT" ? `/portal/projects/${p.id}`
        : user.role === "INSTALLATION" ? `/site/${p.id}`
        : `/admin/projects/${p.id}`,
    }));

    return [...nav, ...projects];
  }, [user]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.slice(0, 12);
    return commands
      .filter((c) => `${c.label} ${c.group}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [commands, query]);

  useEffect(() => { setActive(0); }, [query]);

  useEffect(() => {
    function typingInAField(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return (
        el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
        el.tagName === "SELECT" || el.isContentEditable
      );
    }

    function onKey(e: KeyboardEvent) {
      // Open / close
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && open) { setOpen(false); return; }

      if (open) {
        if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
        if (e.key === "ArrowUp")   { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        if (e.key === "Enter" && results[active]) {
          e.preventDefault();
          navigate(results[active].to);
          setOpen(false);
          setQuery("");
        }
        return;
      }

      if (typingInAField(e.target)) return;

      // `g` then a letter
      if (awaitingGoto.current) {
        awaitingGoto.current = false;
        const to = GOTO[user?.role ?? "ADMIN"]?.[e.key.toLowerCase()];
        if (to) { e.preventDefault(); navigate(to); }
        return;
      }
      if (e.key.toLowerCase() === "g") {
        awaitingGoto.current = true;
        setTimeout(() => { awaitingGoto.current = false; }, 1200);
        return;
      }
      if (e.key === "/") { e.preventDefault(); setOpen(true); }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, results, active, navigate, user]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  if (!open || !user) return null;

  let lastGroup = "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl overflow-hidden rounded border bg-card shadow-2xl"
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a screen or a showroom…"
            aria-label="Search"
            className="h-11 w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="kbd shrink-0">esc</kbd>
        </div>

        <ul className="max-h-[22rem] overflow-y-auto py-1">
          {results.map((c, i) => {
            const showGroup = c.group !== lastGroup;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {showGroup && <p className="eyebrow px-3 pb-1 pt-2">{c.group}</p>}
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => { navigate(c.to); setOpen(false); setQuery(""); }}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] capitalize",
                    i === active ? "bg-primary text-primary-foreground" : "hover:bg-sunken"
                  )}
                >
                  <span className="truncate font-semibold">{c.label}</span>
                  {c.hint && (
                    <span className={cn("shrink-0 text-[10px] font-bold", i === active ? "opacity-80" : "text-muted-foreground")}>
                      {c.hint}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-[13px] text-muted-foreground">
              Nothing matches “{query}”.
            </li>
          )}
        </ul>

        <div className="flex items-center gap-3 border-t px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> move</span>
          <span className="flex items-center gap-1"><CornerDownLeft className="h-3 w-3" /> open</span>
          <span className="ml-auto flex items-center gap-1"><kbd className="kbd">g</kbd> then a letter to jump</span>
        </div>
      </div>
    </div>
  );
}
