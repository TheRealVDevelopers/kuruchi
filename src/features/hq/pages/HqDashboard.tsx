import { Link } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, Cell, Label, RadialBar, RadialBarChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Clock, ShieldAlert, TrendingDown } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { openSnags, openTickets, receivablesAgeing, repo, staleItems, NOW } from "@/data/repo";
import { useDb } from "@/data/store";
import { PageHeader, SectionHead, EmptyState } from "@/components/app/Shell";
import { MarginFlow } from "@/components/app/MarginFlow";
import { PipelineBoard, StageRail } from "@/components/app/StageRail";
import { MarginPill } from "@/components/app/MoneyField";
import { ProjectStatusBadge } from "@/components/app/StatusBadge";
import { formatCompactINR, formatINR, rollUp } from "@/lib/money";
import { ITEM_STATUS_META, type Stage } from "@/lib/statuses";
import { cn } from "@/lib/utils";

export default function HqDashboard() {
  useDb();
  const { user } = useAuth();
  const projects = repo.projects(user);
  const projectIds = new Set(projects.map((p) => p.id));
  const allItems = repo.allItems().filter((i) => projectIds.has(i.projectId));
  const money = rollUp(allItems);

  const stale = staleItems(user);
  const tickets = openTickets(user);
  const snags = openSnags(user);
  const ageing = receivablesAgeing(user);
  const outstanding = Object.values(ageing).reduce((a, b) => a + b, 0);

  const staleByStage = stale.reduce<Partial<Record<Stage, number>>>((acc, i) => {
    const s = ITEM_STATUS_META[i.status].stage;
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});

  const marginByProject = projects
    .map((p) => ({ name: p.site.city, margin: Number(p.totals.marginPct.toFixed(1)) }))
    .sort((a, b) => a.margin - b.margin);

  const reworkByCause = Object.entries(
    repo.tickets().reduce<Record<string, number>>((acc, t) => {
      acc[t.cause] = (acc[t.cause] ?? 0) + t.costImpact;
      return acc;
    }, {})
  )
    .filter(([, v]) => v > 0)
    .map(([cause, value]) => ({ name: cause.replace(/_/g, " ").toLowerCase(), value, cause }));

  const ageingData = Object.entries(ageing).map(([bucket, amount]) => ({ bucket, amount }));
  const totalRework = reworkByCause.reduce((sum, item) => sum + item.value, 0);

  // Risks, worst first — one list rather than three scattered tiles.
  const risks = [
    ...projects.filter((p) => p.flags.overdue).map((p) => ({
      id: `od-${p.id}`, tone: "bad" as const,
      title: `${p.site.city} is past its target date`,
      detail: `Due ${new Date(p.targetCompletionDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`,
      to: `/hq/projects/${p.id}`,
    })),
    ...snags.filter((s) => s.severity === "CRITICAL").map((s) => ({
      id: `sn-${s.id}`, tone: "bad" as const,
      title: `Critical snag — ${projects.find((p) => p.id === s.projectId)?.site.city}`,
      detail: s.description,
      to: `/hq/projects/${s.projectId}?tab=installation`,
    })),
    ...tickets.filter((t) => !t.decision).map((t) => ({
      id: `tk-${t.id}`, tone: "warn" as const,
      title: `${t.type === "DAMAGE" ? "Damage" : "Shortage"} awaiting triage — ${projects.find((p) => p.id === t.projectId)?.site.city}`,
      detail: `Reported by ${t.reportedBy}, still undecided`,
      to: `/hq/projects/${t.projectId}?tab=site`,
    })),
    ...projects.filter((p) => p.flags.stale).map((p) => ({
      id: `st-${p.id}`, tone: "warn" as const,
      title: `${p.site.city} has items past their SLA`,
      detail: `${stale.filter((i) => i.projectId === p.id).length} items not moving`,
      to: `/hq/projects/${p.id}?tab=boq`,
    })),
  ];

  return (
    <>
      <PageHeader
        eyebrow="Ola Showroom Roll-out FY26"
        title="Command centre"
        description="Are we making money, and is anything stuck? You can read everything here and change nothing — rule AC-01."
      />

      <section className="relative mb-7 overflow-hidden rounded-[1.5rem] border border-white/10 bg-card p-5 sm:p-7">
        <img src="/images/showroom-hero-v1.png" alt="Kurchi showroom rollout" className="absolute inset-0 h-full w-full object-cover object-center opacity-25" />
        <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/25" />
        <div className="relative max-w-xl"><p className="eyebrow text-primary">Roll-out at a glance</p><h2 className="mt-2 text-2xl font-bold sm:text-3xl">Every showroom, one live operating picture.</h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">See commercial health, movement and site risk without stepping into a spreadsheet.</p><div className="mt-5 grid grid-cols-3 gap-2"><div className="glass-panel rounded-xl p-3"><p className="eyebrow">Showrooms</p><p className="figure mt-1">{projects.length}</p></div><div className="glass-panel rounded-xl p-3"><p className="eyebrow">At risk</p><p className="figure mt-1">{risks.length}</p></div><div className="glass-panel rounded-xl p-3"><p className="eyebrow">Outstanding</p><p className="mt-1 text-base font-extrabold">{formatCompactINR(outstanding)}</p></div></div></div>
      </section>

      {/* ------------------------------------------------ the money story */}
      <MarginFlow money={money} className="mb-7" />

      {/* ------------------------------------------------- the whole line */}
      <section className="mb-7">
        <SectionHead
          title="The line"
          hint={`${allItems.length} items across ${projects.length} showrooms`}
        />
        <PipelineBoard statuses={allItems.map((i) => i.status)} staleByStage={staleByStage} />
      </section>

      {/* ------------------------------------------------------- risks */}
      <section className="mb-7">
        <SectionHead
          title="What is at risk"
          count={risks.length}
          icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
        />
        {risks.length === 0 ? (
          <EmptyState title="Nothing at risk" hint="No overdue projects, no critical snags, nothing untriaged." />
        ) : (
          <ul className="divide-y overflow-hidden rounded-lg border bg-card">
            {risks.map((r) => (
              <li key={r.id}>
                <Link to={r.to} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/40">
                  <span className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    r.tone === "bad" ? "bg-primary" : "bg-amber-500"
                  )} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{r.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{r.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ------------------------------------------------------- charts */}
      <section className="mb-7 grid gap-3 lg:grid-cols-3">
        <ChartCard
          title="Real margin by showroom"
          subtitle="worst first"
          className="lg:col-span-2"
        >
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={marginByProject} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
              <defs><linearGradient id="marginGlow" x1="0" x2="1"><stop offset="0%" stopColor="#f97355"/><stop offset="100%" stopColor="#fbbf72"/></linearGradient></defs>
              <XAxis type="number" tick={{ fontSize: 11 }} unit="%" stroke="hsl(var(--muted-foreground))" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fontWeight: 600 }} width={76} stroke="hsl(var(--muted-foreground))" />
              <Tooltip cursor={{ fill: "hsl(var(--muted) / .35)" }} contentStyle={{ borderRadius: 14, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Bar dataKey="margin" radius={[0, 5, 5, 0]} barSize={22}>
                {marginByProject.map((d) => (
                  <Cell key={d.name} fill={d.margin < 15 ? "#ef4444" : d.margin < 25 ? "#f59e0b" : "url(#marginGlow)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Rework exposure" subtitle="where the margin goes">
          {reworkByCause.length ? (
            <ResponsiveContainer width="100%" height={210}>
              <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={16} data={[{ name: "Rework", value: totalRework, fill: "#f97355" }]} startAngle={90} endAngle={-270}>
                <RadialBar background={{ fill: "hsl(var(--muted))" }} dataKey="value" cornerRadius={12} />
                <Label position="center" content={({ viewBox }) => { const box = viewBox as { cx?: number; cy?: number }; return <text x={box.cx} y={box.cy} textAnchor="middle" dominantBaseline="middle" fill="currentColor"><tspan x={box.cx} dy="-0.3em" fontSize="18" fontWeight="800">{formatCompactINR(totalRework)}</tspan><tspan x={box.cx} dy="1.5em" fontSize="10" fill="hsl(var(--muted-foreground))">TOTAL REWORK</tspan></text>; }} />
                <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ borderRadius: 14, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              </RadialBarChart>
            </ResponsiveContainer>
          ) : (
            <p className="grid h-[210px] place-items-center text-center text-sm text-muted-foreground">
              No rework booked yet.
            </p>
          )}
        </ChartCard>
      </section>

      {/* --------------------------------------------------- receivables */}
      <section className="mb-7">
        <SectionHead
          title="Receivables"
          hint={`${formatCompactINR(outstanding)} outstanding`}
          icon={<Clock className="h-4 w-4 text-muted-foreground" />}
        />
        <div className="visual-card p-4">
          <ResponsiveContainer width="100%" height={170}>
            <AreaChart data={ageingData} margin={{ top: 8, right: 8, bottom: 4, left: -6 }}>
              <defs><linearGradient id="ageingGlow" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#f97355" stopOpacity={0.65}/><stop offset="100%" stopColor="#f97355" stopOpacity={0}/></linearGradient></defs>
              <XAxis dataKey="bucket" tick={{ fontSize: 12, fontWeight: 600 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => formatCompactINR(v)} width={54} stroke="hsl(var(--muted-foreground))" />
              <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ borderRadius: 14, border: "1px solid hsl(var(--border))", background: "hsl(var(--card))" }} />
              <Area type="monotone" dataKey="amount" stroke="#f97355" strokeWidth={3} fill="url(#ageingGlow)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* ------------------------------------------------------ projects */}
      <section>
        <SectionHead
          title="Every showroom"
          action={
            <Link to="/hq/projects" className="text-sm font-semibold hover:underline">
              Full table →
            </Link>
          }
        />
        <div className="grid gap-2.5 sm:grid-cols-2">
          {projects.map((p) => {
            const statuses = repo.itemsRaw(p.id).map((i) => i.status);
            const m = rollUp(repo.itemsRaw(p.id));
            return (
              <Link
                key={p.id}
                to={`/hq/projects/${p.id}`}
            className="visual-card p-4"
          >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[15px] font-bold">{p.site.city}</h3>
                    <p className="text-xs text-muted-foreground">{p.code}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <ProjectStatusBadge status={p.status} />
                    <MarginPill pct={p.totals.marginPct} />
                  </div>
                </div>

                <StageRail statuses={statuses} showLegend className="mt-3" />

                <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-2.5 text-xs">
                  <div className="flex gap-1.5">
                    <dt className="text-muted-foreground">Value</dt>
                    <dd className="font-bold tabular-nums">{formatCompactINR(p.totals.value)}</dd>
                  </div>
                  {m.erosion > 0 && (
                    <div className="flex items-center gap-1.5">
                      <TrendingDown className="h-3 w-3 text-primary" />
                      <dt className="text-muted-foreground">Erosion</dt>
                      <dd className="font-bold tabular-nums text-primary">{formatCompactINR(m.erosion)}</dd>
                    </div>
                  )}
                  {p.flags.overdue && (
                    <div className="font-bold text-primary">
                      {Math.abs(Math.round((new Date(p.targetCompletionDate).getTime() - NOW.getTime()) / 86_400_000))}d late
                    </div>
                  )}
                </dl>
              </Link>
            );
          })}
        </div>
      </section>

      <p className="mt-6 flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldAlert className="h-3.5 w-3.5" />
        Read-only. Every write is rejected except comments — rule AC-01.
      </p>
    </>
  );
}

function ChartCard({
  title, subtitle, children, className,
}: { title: string; subtitle?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("visual-card p-4", className)}>
      <h3 className="text-[15px] font-bold">{title}</h3>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}
