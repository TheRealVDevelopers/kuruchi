import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { PageHeader, StatCard } from "@/components/app/Shell";
import { MarginPill } from "@/components/app/MoneyField";
import { ResponsiveTable, type Column } from "@/components/app/ResponsiveTable";
import { formatCompactINR, formatINR, rollUp } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Project, Vendor } from "@/types";

/* -------------------------------------------------------------------- P&L */

export function HqFinancePage() {
  useDb();
  const { user } = useAuth();
  const projects = repo.projects(user);
  const all = rollUp(repo.allItems());

  const rows = projects.map((p) => ({ project: p, money: rollUp(repo.itemsRaw(p.id)) }));
  const erosionData = rows
    .map((r) => ({ name: r.project.site.city, erosion: r.money.erosion }))
    .sort((a, b) => b.erosion - a.erosion);

  const columns: Column<(typeof rows)[number]>[] = [
    { key: "city", header: "Showroom", primary: true, cell: (r) => r.project.site.city },
    { key: "code", header: "Code", subtitle: true, cell: (r) => <span className="font-mono text-xs">{r.project.code}</span> },
    { key: "revenue", header: "Revenue", cell: (r) => <span className="tabular-nums">{formatINR(r.money.revenue)}</span> },
    { key: "base", header: "Base cost", cell: (r) => <span className="tabular-nums text-muted-foreground">{formatINR(r.money.baseCost)}</span> },
    { key: "freight", header: "Freight + install", cell: (r) => <span className="tabular-nums text-muted-foreground">{formatINR(r.money.transport + r.money.install)}</span> },
    { key: "rework", header: "Rework", cell: (r) => <span className={cn("tabular-nums", r.money.rework > 0 && "font-semibold text-primary")}>{r.money.rework ? formatINR(r.money.rework) : "—"}</span> },
    { key: "landed", header: "Landed cost", cell: (r) => <span className="tabular-nums font-semibold">{formatINR(r.money.landedCost)}</span> },
    { key: "quoted", header: "Quoted margin", cell: (r) => <span className="tabular-nums text-muted-foreground">{formatINR(r.money.quotedMargin)}</span> },
    { key: "real", header: "Real margin", cell: (r) => <span className="tabular-nums font-semibold">{formatINR(r.money.realMargin)}</span> },
    { key: "pct", header: "%", cell: (r) => <MarginPill pct={r.money.marginPct} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Programme"
        title="P&L"
        description="What we expected to make, what we actually made, and the gap — the only number that explains a bad quarter."
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatCompactINR(all.revenue)} />
        <StatCard label="Landed cost" value={formatCompactINR(all.landedCost)} sub="the actual price" />
        <StatCard label="Real margin" value={formatCompactINR(all.realMargin)} sub={`${all.marginPct.toFixed(1)}%`} tone="good" />
        <StatCard
          label="Erosion"
          value={formatCompactINR(all.erosion)}
          sub={all.quotedMargin ? `${((all.erosion / all.quotedMargin) * 100).toFixed(0)}% of expected margin` : "—"}
          tone={all.erosion > 0 ? "bad" : "default"}
        />
      </div>

      <section className="visual-card mb-6 p-5">
        <h2 className="font-bold">Margin erosion by showroom</h2>
        <p className="mb-2 text-xs text-muted-foreground">
          quoted margin minus real margin — discount given away, freight under-estimated, rework absorbed
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={erosionData} layout="vertical" margin={{ top: 8, right: 16, bottom: 8, left: 6 }}>
            <defs><linearGradient id="erosionGlow" x1="0" x2="1"><stop offset="0%" stopColor="#fb7185"/><stop offset="100%" stopColor="#f97355"/></linearGradient></defs>
            <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactINR(v)} stroke="hsl(var(--muted-foreground))" />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={72} stroke="hsl(var(--muted-foreground))" />
            <Tooltip formatter={(v: number) => formatINR(v)} cursor={{ fill: "hsl(var(--muted) / .35)" }} contentStyle={{ borderRadius: 14, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
            <Bar dataKey="erosion" radius={[0, 4, 4, 0]}>
              {erosionData.map((d) => (
                <Cell key={d.name} fill={d.erosion > 20000 ? "#ef4444" : d.erosion > 0 ? "url(#erosionGlow)" : "#34d399"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      <ResponsiveTable data={rows} columns={columns} keyOf={(r) => r.project.id} minWidth="min-w-[1100px]" />
    </>
  );
}

/* ------------------------------------------------------------- scorecards */

export function HqPeoplePage() {
  useDb();
  const { user } = useAuth();
  const projects = repo.projects(user);
  const crews = repo.vendors("INSTALLATION");

  const columns: Column<Vendor>[] = [
    { key: "name", header: "Crew", primary: true, cell: (v) => v.name },
    { key: "loc", header: "Base", subtitle: true, cell: (v) => <span className="text-xs">{v.city}, {v.state}</span> },
    {
      key: "sites", header: "Sites",
      cell: (v) => <span className="tabular-nums">{projects.filter((p) => p.installationTeamId === v.id).length}</span>,
    },
    {
      key: "ontime", header: "On-time",
      cell: (v) => v.scorecard ? (
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
          v.scorecard.onTimePct >= 90 ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : v.scorecard.onTimePct >= 80 ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-red-200 bg-red-50 text-red-700"
        )}>{v.scorecard.onTimePct}%</span>
      ) : "—",
    },
    { key: "damage", header: "Damage on arrival", cell: (v) => v.scorecard ? `${v.scorecard.damagePct}%` : "—" },
    { key: "snags", header: "Snags", cell: (v) => v.scorecard ? <span className="tabular-nums">{v.scorecard.snagCount}</span> : "—" },
    {
      key: "rework", header: "Rework caused",
      cell: (v) => v.scorecard
        ? <span className={cn("tabular-nums", v.scorecard.reworkCostCaused > 40000 && "font-semibold text-primary")}>
            {formatINR(v.scorecard.reworkCostCaused)}
          </span>
        : "—",
    },
  ];

  const worst = [...crews].sort((a, b) => (b.scorecard?.reworkCostCaused ?? 0) - (a.scorecard?.reworkCostCaused ?? 0))[0];

  return (
    <>
      <PageHeader
        eyebrow="Performance"
        title="Teams & vendors"
        description="On-time, damage and rework cost per crew. This is the table that decides who gets the next city."
      />

      {worst?.scorecard && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">{worst.name} is your most expensive crew</p>
          <p className="mt-1 text-sm text-amber-800">
            {formatINR(worst.scorecard.reworkCostCaused)} of rework caused, {worst.scorecard.onTimePct}% on-time,
            {" "}{worst.scorecard.snagCount} snags. That is a real number against a real margin — worth a conversation
            before the next allocation.
          </p>
        </div>
      )}

      <ResponsiveTable data={crews} columns={columns} keyOf={(v) => v.id} minWidth="min-w-[860px]" />

      <h2 className="mb-3 mt-8 text-lg font-bold tracking-tight">Client responsiveness</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p: Project) => (
          <div key={p.id} className="rounded-lg border bg-card p-4">
            <p className="font-semibold">{p.site.city}</p>
            <dl className="mt-2 space-y-1 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Site readiness</dt>
                <dd className="font-semibold">
                  {Object.values(p.siteReadiness).filter(Boolean).length}/6
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Snags raised by client</dt>
                <dd className="font-semibold tabular-nums">
                  {repo.snags(p.id).filter((s) => s.raisedBy.includes("Ola")).length}
                </dd>
              </div>
            </dl>
          </div>
        ))}
      </div>
    </>
  );
}
