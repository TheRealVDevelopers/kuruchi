import { Link } from "react-router-dom";
import { Camera } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo, NOW } from "@/data/repo";
import { useDb } from "@/data/store";
import { formatDate } from "@/lib/useAction";
import { EmptyState, PageHeader, StatCard } from "@/components/app/Shell";
import { cn } from "@/lib/utils";

const STEPS = ["OPEN", "TRIAGED", "IN_PROGRESS", "RESOLVED"] as const;

export default function MyReportsPage() {
  useDb();
  const { user } = useAuth();
  if (!user) return null;

  const projectIds = new Set(repo.projects(user).map((p) => p.id));
  const mine = repo.tickets().filter((t) => projectIds.has(t.projectId));
  const open = mine.filter((t) => t.status !== "RESOLVED");

  return (
    <>
      <PageHeader
        eyebrow="Installation"
        title="My reports"
        description="Everything you have reported, and what Kurchi did about it."
      />

      <div className="mb-6 grid grid-cols-2 gap-3">
        <StatCard label="Open" value={open.length} tone={open.length ? "warn" : "good"} />
        <StatCard label="Resolved" value={mine.length - open.length} tone="good" />
      </div>

      {mine.length === 0 ? (
        <EmptyState title="You have not reported anything" hint="Damage and shortages you file from a site appear here." />
      ) : (
        <div className="space-y-3">
          {mine.map((t) => {
            const project = repo.projects(user).find((p) => p.id === t.projectId);
            const item = repo.itemById(t.itemId);
            const stepIndex = STEPS.indexOf(t.status as (typeof STEPS)[number]);
            const ageDays = Math.floor((NOW.getTime() - new Date(t.reportedAt).getTime()) / 86_400_000);

            return (
              <article key={t.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold">{item?.name ?? t.itemId}</p>
                    <p className="text-sm text-muted-foreground">
                      <Link to={`/site/${t.projectId}`} className="hover:underline">{project?.site.city}</Link>
                      {" · "}{t.type.toLowerCase()} ×{t.qtyAffected} · {ageDays}d ago
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    <Camera className="h-3.5 w-3.5" />{t.photos.length}
                  </span>
                </div>

                <p className="mt-2 text-sm">{t.note}</p>

                <ol className="mt-4 flex flex-wrap items-center gap-1.5">
                  {STEPS.map((s, i) => (
                    <li key={s} className="flex items-center gap-1.5">
                      <span className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                        i <= stepIndex
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-dashed text-muted-foreground"
                      )}>
                        {s.replace(/_/g, " ").toLowerCase()}
                      </span>
                      {i < STEPS.length - 1 && <span className="text-muted-foreground" aria-hidden>›</span>}
                    </li>
                  ))}
                </ol>

                {t.decision && (
                  <p className="mt-3 border-t pt-3 text-sm text-muted-foreground">
                    Kurchi decided <strong className="text-foreground">{t.decision.toLowerCase()}</strong>
                    {t.replacementItemId && " — a replacement is back in production"}.
                    {" "}Reported {formatDate(t.reportedAt)}.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
