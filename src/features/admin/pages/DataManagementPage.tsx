import { useState } from "react";
import { Link } from "react-router-dom";
import { Database, Download, Trash2, Users } from "lucide-react";
import { db, useDb } from "@/data/store";
import { useAuth } from "@/features/auth/AuthContext";
import { PageHeader } from "@/components/app/Shell";
import { sharedWorkspaceStatus } from "@/data/cloudSync";
import { formatINR } from "@/lib/money";
import DeleteDataDialog from "../components/DeleteDataDialog";

export default function DataManagementPage() {
  useDb();
  const { user } = useAuth();
  const [selected, setSelected] = useState<string[]>([]);
  const [scope, setScope] = useState<"PROJECTS" | "CLEAR_WORKSPACE" | null>(null);
  if (user?.role !== "ADMIN") return null;
  const selectedIds = selected.filter((id) => db.projects.some((project) => project.id === id));
  const projects = db.projects;
  const backup = () => {
    const file = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), workspace: db }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `kurchi-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <PageHeader eyebrow="Admin only" title="Manage data" description="Remove test records, keep real work, and control who can sign in." actions={<button type="button" onClick={backup} disabled={!sharedWorkspaceStatus.connected} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm font-bold disabled:opacity-40"><Download className="h-4 w-4" /> Download backup</button>} />
    <div className="mb-6 grid gap-4 md:grid-cols-2">
      <section className="rounded-3xl border bg-card p-5"><Database className="h-6 w-6 text-primary" /><h2 className="mt-3 text-xl font-extrabold">Clear all work data</h2><p className="mt-2 text-sm text-muted-foreground">Remove all projects, amounts, payments, shipments, reports, catalogue products, kits, client accounts and partner records. No demo records will be added back.</p><p className="mt-3 text-xs text-muted-foreground">Real login accounts and company legal details are kept. Review the exact deletion counts before confirming.</p><button type="button" onClick={() => setScope("CLEAR_WORKSPACE")} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/30 px-4 text-sm font-bold text-primary"><Trash2 className="h-4 w-4" /> Review & clear data</button></section>
      <section className="rounded-3xl border bg-card p-5"><Users className="h-6 w-6 text-primary" /><h2 className="mt-3 text-xl font-extrabold">Delete unwanted users</h2><p className="mt-2 text-sm text-muted-foreground">Open the real team directory and delete individual users or select several at once. Deletion removes their login, not just a row on this screen.</p><p className="mt-3 text-xs text-muted-foreground">The Admin account you are using cannot be deleted.</p><Link to="/admin/users" className="mt-4 inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-bold">Manage users →</Link></section>
    </div>
    <section className="rounded-3xl border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-extrabold">Delete only selected projects</h2><p className="mt-1 text-sm text-muted-foreground">Linked BOQ lines, invoices, advances, expenses and site records are removed together.</p></div><button type="button" disabled={!selectedIds.length} onClick={() => setScope("PROJECTS")} className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">Delete selected ({selectedIds.length})</button></div>
      {projects.length > 0 ? <><label className="my-4 inline-flex min-h-11 items-center gap-2 text-sm font-bold"><input type="checkbox" checked={selectedIds.length === Math.min(projects.length, 100)} onChange={(event) => setSelected(event.target.checked ? projects.slice(0, 100).map((p) => p.id) : [])} className="h-5 w-5 accent-primary" />Select all{projects.length > 100 && " (first 100)"}</label><div className="space-y-2">{projects.map((project) => <label key={project.id} className="flex min-h-16 items-center gap-3 rounded-2xl border p-3"><input type="checkbox" checked={selectedIds.includes(project.id)} disabled={!selectedIds.includes(project.id) && selectedIds.length >= 100} onChange={(event) => setSelected(event.target.checked ? [...selectedIds, project.id] : selectedIds.filter((id) => id !== project.id))} className="h-5 w-5 shrink-0 accent-primary" /><span className="min-w-0 flex-1"><span className="block font-bold">{project.name}</span><span className="text-xs text-muted-foreground">{project.code} · {project.site.city}</span></span><span className="text-sm font-bold">{formatINR(project.totals.value)}</span></label>)}</div></> : <p className="mt-4 rounded-xl bg-muted p-4 text-sm text-muted-foreground">No projects saved. Add real showrooms when ready.</p>}
    </section>
    {scope && <DeleteDataDialog scope={scope} projectIds={selectedIds} onClose={() => setScope(null)} onDeleted={() => setSelected([])} />}
  </>;
}
