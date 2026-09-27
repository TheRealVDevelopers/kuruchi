import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Boxes, Check, X } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { PageHeader, StatCard, EmptyState, StatStrip } from "@/components/app/Shell";
import { ResponsiveTable, type Column } from "@/components/app/ResponsiveTable";
import { AddButton, EditPanel, Field, NumField, SelectField, TextArea } from "@/components/app/Form";
import { DataStatus } from "@/components/app/DataStatus";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";
import { functions } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import type { AppUser, Client, Kit, Product, Programme, Vendor } from "@/types";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Delhi", "Goa", "Gujarat", "Haryana",
  "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Odisha",
  "Punjab", "Rajasthan", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal",
];

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/* ------------------------------------------------------------- catalogue */

export function CataloguePage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [editing, setEditing] = useState<Product | null>(null);
  if (!user) return null;

  const products = repo.products();
  const categories = [...new Set([...repo.categories(), "Storage Units", "Sofas", "Chairs", "Counters", "Tables"])];

  const columns: Column<Product>[] = [
    { key: "name", header: "Product", primary: true, cell: (p) => p.name || "(unnamed)" },
    { key: "spec", header: "Spec", subtitle: true, cell: (p) => <span className="text-xs">{p.shortSpec}</span> },
    { key: "category", header: "Category", cell: (p) => p.category },
    { key: "hsn", header: "HSN", cell: (p) => <span className="font-mono text-xs">{p.hsnCode || "—"}</span> },
    { key: "base", header: "Base", cell: (p) => <span className="tabular-nums">{formatINR(p.defaultBasePrice)}</span> },
    { key: "selling", header: "Selling", cell: (p) => <span className="tabular-nums">{formatINR(p.defaultSellingPrice)}</span> },
    { key: "lead", header: "Lead", cell: (p) => <span className="tabular-nums text-xs">{p.leadTimeDays}d</span> },
    {
      key: "active", header: "Live",
      cell: (p) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            run(() => act.toggleProduct(user, p.id), p.active ? `${p.name} hidden` : `${p.name} published`);
          }}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold",
            p.active
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-slate-200 bg-slate-50 text-slate-600"
          )}
        >
          {p.active ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
          {p.active ? "live" : "hidden"}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Catalogue"
        description="The public product list. HSN lives here, so every challan and invoice inherits it — rule FN-03."
        actions={<AddButton label="Add product" onClick={() => setEditing(act.blankProduct())} />}
      />

      <StatStrip>
        <StatCard label="Products" value={products.length} />
        <StatCard label="Live" value={products.filter((p) => p.active).length} tone="good" />
        <StatCard label="Categories" value={repo.categories().length} />
        <StatCard label="Missing HSN" value={products.filter((p) => !p.hsnCode).length} tone={products.some((p) => !p.hsnCode) ? "bad" : "default"} />
      </StatStrip>

      {editing && (
        <ProductForm
          product={editing}
          categories={categories}
          isNew={!products.some((p) => p.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={(p) => {
            const ok = run(
              () => act.saveProduct(user, { ...p, slug: p.slug || slugify(p.name), startingPrice: p.defaultSellingPrice }),
              `${p.name || "Product"} saved`
            );
            if (ok) setEditing(null);
          }}
        />
      )}

      <ResponsiveTable
        data={products}
        columns={columns}
        keyOf={(p) => p.id}
        onRowClick={(p) => setEditing({ ...p })}
        minWidth="min-w-[880px]"
        empty="No products yet — add your first one."
      />
      <p className="mt-2 text-xs text-muted-foreground">Tap a row to edit it.</p>
    </>
  );
}

function ProductForm({
  product, categories, isNew, onSave, onCancel,
}: {
  product: Product; categories: string[]; isNew: boolean;
  onSave: (p: Product) => void; onCancel: () => void;
}) {
  const [p, setP] = useState(product);

  return (
    <EditPanel
      title={isNew ? "New product" : `Edit ${product.name}`}
      onSubmit={() => onSave(p)}
      onCancel={onCancel}
      submitLabel={isNew ? "Add product" : "Save changes"}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="p-name" label="Name" required value={p.name} onChange={(v) => setP({ ...p, name: v })} placeholder="Storage Unit C" />
        <SelectField id="p-cat" label="Category" value={p.category} onChange={(v) => setP({ ...p, category: v })}
          options={categories.map((c) => ({ value: c, label: c }))} />
        <Field id="p-hsn" label="HSN code" required value={p.hsnCode} onChange={(v) => setP({ ...p, hsnCode: v })}
          hint="Inherited by every challan and invoice" />
        <Field id="p-spec" label="Short spec" value={p.shortSpec} onChange={(v) => setP({ ...p, shortSpec: v })}
          placeholder="1500 × 900 × 450 mm · laminate" />
        <Field id="p-unit" label="Unit" value={p.unit} onChange={(v) => setP({ ...p, unit: v })} placeholder="nos" />
        <NumField id="p-lead" label="Lead time (days)" value={p.leadTimeDays} onChange={(v) => setP({ ...p, leadTimeDays: v })} />
        <NumField id="p-base" label="Base price" required value={p.defaultBasePrice} onChange={(v) => setP({ ...p, defaultBasePrice: v })}
          hint="What it costs Kurchi" />
        <NumField id="p-sell" label="Selling price" required value={p.defaultSellingPrice} onChange={(v) => setP({ ...p, defaultSellingPrice: v })}
          hint="Quoted to the client" />
        <div className="flex items-end">
          <div className="w-full rounded-md border bg-muted/40 px-3 py-2.5">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Margin at quote</p>
            <p className="mt-0.5 text-sm font-bold tabular-nums">
              {p.defaultSellingPrice
                ? `${(((p.defaultSellingPrice - p.defaultBasePrice) / p.defaultSellingPrice) * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <TextArea id="p-desc" label="Description" value={p.description} onChange={(v) => setP({ ...p, description: v })}
            placeholder="Shown on the public product page." />
        </div>
      </div>

      {p.defaultSellingPrice > 0 && p.defaultSellingPrice < p.defaultBasePrice && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Selling price is below base price — negative margin at quote (rule BQ-02).
        </p>
      )}
    </EditPanel>
  );
}

/* ---------------------------------------------------------------- clients */

export function ClientsPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<Client | null>(null);
  const [editingProgramme, setEditingProgramme] = useState<Programme | null>(null);

  useEffect(() => {
    if (searchParams.get("new") !== "1" || editing) return;
    setEditing(act.blankClient());
    setSearchParams({}, { replace: true });
  }, [editing, searchParams, setSearchParams]);

  if (!user) return null;

  const clients = repo.clients();
  const programmes = repo.programmes();
  const projects = repo.projects(user);

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Clients & programmes"
        description="A client runs programmes; a programme holds one project per showroom. GSTIN here drives every bill-to on every invoice."
        actions={
          <div className="flex flex-wrap gap-2">
            <AddButton label="Add client" onClick={() => setEditing(act.blankClient())} />
            {clients.length > 0 && (
              <button
                type="button"
                onClick={() => setEditingProgramme(act.blankProgramme(clients[0].id))}
                className="rounded-md border px-3.5 py-2 text-sm font-semibold hover:bg-muted"
              >
                Add programme
              </button>
            )}
          </div>
        }
      />

      {editing && (
        <ClientForm
          client={editing}
          isNew={!clients.some((c) => c.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={(c) => {
            const ok = run(() => act.saveClient(user, c), `${c.name || "Client"} saved`);
            if (ok) setEditing(null);
          }}
        />
      )}

      {editingProgramme && (
        <ProgrammeForm
          programme={editingProgramme}
          clients={clients}
          isNew={!programmes.some((p) => p.id === editingProgramme.id)}
          onCancel={() => setEditingProgramme(null)}
          onSave={(p) => {
            const ok = run(() => act.saveProgramme(user, p), `${p.name || "Programme"} saved`);
            if (ok) setEditingProgramme(null);
          }}
        />
      )}

      <div className="space-y-4">
        {clients.map((c) => {
          const clientProgrammes = programmes.filter((p) => p.clientId === c.id);
          const clientProjects = projects.filter((p) => p.clientId === c.id);
          return (
            <section key={c.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold">{c.name}</h3>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{c.gstin || "no GSTIN"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{c.billingAddress}</p>
                  <p className="mt-1 text-sm">
                    {c.contactName} · {c.contactPhone} · {c.contactEmail}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing({ ...c })}
                  className="shrink-0 rounded-md border px-3 py-2 text-sm font-semibold hover:bg-muted"
                >
                  Edit
                </button>
              </div>

              <div className="mt-4 space-y-2 border-t pt-3">
                {clientProgrammes.map((pg) => (
                  <div key={pg.id} className="flex flex-wrap items-center justify-between gap-2 rounded border px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{pg.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {projects.filter((p) => p.programmeId === pg.id).length} of {pg.targetProjects} showrooms
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingProgramme({ ...pg })}
                      className="shrink-0 rounded border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                    >
                      Edit
                    </button>
                  </div>
                ))}
                {clientProgrammes.length === 0 && (
                  <p className="text-sm text-muted-foreground">No programmes yet.</p>
                )}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">
                <Link to="/admin/projects" className="font-semibold text-foreground hover:underline">
                  {clientProjects.length} live {clientProjects.length === 1 ? "project" : "projects"}
                </Link>
              </p>
            </section>
          );
        })}
        {clients.length === 0 && <EmptyState title="No clients yet" hint="Add one to start a programme." />}
      </div>
    </>
  );
}

function ClientForm({
  client, isNew, onSave, onCancel,
}: { client: Client; isNew: boolean; onSave: (c: Client) => void; onCancel: () => void }) {
  const [c, setC] = useState(client);
  return (
    <EditPanel
      title={isNew ? "New client" : `Edit ${client.name}`}
      onSubmit={() => onSave(c)}
      onCancel={onCancel}
      submitLabel={isNew ? "Add client" : "Save changes"}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="c-name" label="Company name" required value={c.name} onChange={(v) => setC({ ...c, name: v })}
          placeholder="Ola Electric Mobility Ltd" />
        <Field id="c-gstin" label="GSTIN" value={c.gstin} onChange={(v) => setC({ ...c, gstin: v.toUpperCase() })}
          placeholder="29AAFCO1234M1Z5" hint="Used as bill-to on every invoice" />
        <div className="sm:col-span-2">
          <TextArea id="c-addr" label="Billing address" rows={2} value={c.billingAddress}
            onChange={(v) => setC({ ...c, billingAddress: v })} />
        </div>
        <SelectField id="c-state" label="State" value={c.state} onChange={(v) => setC({ ...c, state: v })}
          options={STATES.map((s) => ({ value: s, label: s }))} />
        <Field id="c-contact" label="Contact name" value={c.contactName} onChange={(v) => setC({ ...c, contactName: v })} />
        <Field id="c-phone" label="Phone" value={c.contactPhone} onChange={(v) => setC({ ...c, contactPhone: v })} />
        <Field id="c-email" label="Email" type="email" value={c.contactEmail} onChange={(v) => setC({ ...c, contactEmail: v })} />
      </div>
    </EditPanel>
  );
}

function ProgrammeForm({
  programme, clients, isNew, onSave, onCancel,
}: {
  programme: Programme; clients: Client[]; isNew: boolean;
  onSave: (p: Programme) => void; onCancel: () => void;
}) {
  const [p, setP] = useState(programme);
  return (
    <EditPanel
      title={isNew ? "New programme" : `Edit ${programme.name}`}
      onSubmit={() => onSave(p)}
      onCancel={onCancel}
      submitLabel={isNew ? "Add programme" : "Save changes"}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField id="pg-client" label="Client" value={p.clientId} onChange={(v) => setP({ ...p, clientId: v })}
          options={clients.map((c) => ({ value: c.id, label: c.name }))} />
        <Field id="pg-name" label="Programme name" required value={p.name} onChange={(v) => setP({ ...p, name: v })}
          placeholder="Ola Showroom Roll-out FY27" />
        <NumField id="pg-target" label="Target showrooms" value={p.targetProjects} onChange={(v) => setP({ ...p, targetProjects: v })} />
      </div>
    </EditPanel>
  );
}

/* ------------------------------------------------------------------- kits */

export function KitsPage() {
  useDb();
  const { user } = useAuth();
  const kits = repo.kits();
  const projects = repo.projects(user);

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="BOQ kits"
        description="Reusable showroom presets. Applying a kit is the difference between two minutes and two hours per project."
      />

      <div className="space-y-4">
        {kits.map((kit: Kit) => {
          const value = kit.lines.reduce((s, l) => {
            const p = repo.productById(l.productId);
            return s + (p?.defaultSellingPrice ?? 0) * l.defaultQty;
          }, 0);
          const appliedTo = projects.filter((p) => p.programmeId === kit.programmeId).length;
          return (
            <section key={kit.id} className="rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="flex items-center gap-2 font-bold">
                    <Boxes className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {kit.name}
                    <span className="rounded border px-1.5 py-0.5 font-mono text-[11px] font-normal text-muted-foreground">
                      v{kit.version}
                    </span>
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{kit.description}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="font-bold tabular-nums">{formatINR(value)}</p>
                    <p className="text-xs text-muted-foreground">{kit.lines.length} lines</p>
                  </div>
                  <Link
                    to={`/admin/projects/new?kit=${kit.id}`}
                    className="rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    Start a project
                  </Link>
                </div>
              </div>

              <ul className="mt-4 divide-y rounded-md border">
                {kit.lines.map((l) => (
                  <li key={l.productId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="font-medium">{l.name}</span>
                    <span className="text-xs text-muted-foreground">{l.zone} · ×{l.defaultQty}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-3 text-sm text-muted-foreground">
                Applied to{" "}
                <Link to="/admin/projects" className="font-semibold text-foreground hover:underline">
                  {appliedTo} live {appliedTo === 1 ? "project" : "projects"}
                </Link>
                . Kits are versioned, so an old project keeps the kit it was built from.
              </p>
            </section>
          );
        })}
        {kits.length === 0 && <EmptyState title="No kits yet" />}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- vendors */

export function VendorsPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [filter, setFilter] = useState<"ALL" | Vendor["type"]>("ALL");

  useEffect(() => {
    if (searchParams.get("new") !== "1" || editing) return;
    setEditing(act.blankVendor());
    setSearchParams({}, { replace: true });
  }, [editing, searchParams, setSearchParams]);

  if (!user) return null;

  const all = repo.vendors();
  const vendors = filter === "ALL" ? all : all.filter((v) => v.type === filter);

  const tabs = [
    { id: "ALL" as const, label: "All", count: all.length },
    { id: "SUPPLIER" as const, label: "Suppliers", count: all.filter((v) => v.type === "SUPPLIER").length },
    { id: "INSTALLATION" as const, label: "Install crews", count: all.filter((v) => v.type === "INSTALLATION").length },
    { id: "TRANSPORTER" as const, label: "Transporters", count: all.filter((v) => v.type === "TRANSPORTER").length },
  ];

  const columns: Column<Vendor>[] = [
    { key: "name", header: "Vendor", primary: true, cell: (v) => v.name || "(unnamed)" },
    {
      key: "loc", header: "Location", subtitle: true,
      cell: (v) => <span className="text-xs">{v.city}, {v.state} · {v.type.toLowerCase()}</span>,
    },
    { key: "contact", header: "Contact", cell: (v) => <span className="text-sm">{v.contactName || "—"}</span> },
    {
      key: "phone", header: "Phone",
      cell: (v) => v.contactPhone
        ? <a href={`tel:${v.contactPhone}`} onClick={(e) => e.stopPropagation()} className="text-sm hover:underline">{v.contactPhone}</a>
        : "—",
    },
    { key: "gstin", header: "GSTIN", cell: (v) => <span className="font-mono text-xs">{v.gstin || "—"}</span> },
    {
      key: "score", header: "On-time",
      cell: (v) => v.scorecard ? (
        <span className={cn(
          "rounded-full border px-2 py-0.5 text-xs font-semibold tabular-nums",
          v.scorecard.onTimePct >= 90 ? "border-red-200 bg-red-50 text-red-700"
            : v.scorecard.onTimePct >= 80 ? "border-amber-300 bg-amber-50 text-amber-800"
            : "border-red-200 bg-red-50 text-red-700"
        )}>{v.scorecard.onTimePct}%</span>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      key: "rework", header: "Rework caused",
      cell: (v) => v.scorecard
        ? <span className="tabular-nums text-sm">{formatINR(v.scorecard.reworkCostCaused)}</span>
        : <span className="text-xs text-muted-foreground">—</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Masters"
        title="Vendors"
        description="Suppliers, installation crews and transporters. The scorecard decides who gets the next city."
        actions={<AddButton label="Add vendor" onClick={() => setEditing(act.blankVendor())} />}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setFilter(t.id)}
            aria-pressed={filter === t.id}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-semibold",
              filter === t.id ? "border-foreground bg-foreground text-background" : "hover:bg-muted"
            )}
          >
            {t.label} <span className="tabular-nums opacity-70">{t.count}</span>
          </button>
        ))}
      </div>

      {editing && (
        <VendorForm
          vendor={editing}
          isNew={!all.some((v) => v.id === editing.id)}
          onCancel={() => setEditing(null)}
          onSave={(v) => {
            const ok = run(() => act.saveVendor(user, v), `${v.name || "Vendor"} saved`);
            if (ok) setEditing(null);
          }}
          onDelete={() => {
            const ok = run(() => act.deleteVendor(user, editing.id), "Vendor removed");
            if (ok) setEditing(null);
          }}
        />
      )}

      <ResponsiveTable
        data={vendors}
        columns={columns}
        keyOf={(v) => v.id}
        onRowClick={(v) => setEditing({ ...v })}
        minWidth="min-w-[820px]"
        empty="No vendors in this group yet."
      />
      <p className="mt-2 text-xs text-muted-foreground">Tap a row to edit it.</p>
    </>
  );
}

function VendorForm({
  vendor, isNew, onSave, onCancel, onDelete,
}: {
  vendor: Vendor; isNew: boolean;
  onSave: (v: Vendor) => void; onCancel: () => void; onDelete: () => void;
}) {
  const [v, setV] = useState(vendor);
  return (
    <EditPanel
      title={isNew ? "New vendor" : `Edit ${vendor.name}`}
      onSubmit={() => onSave(v)}
      onCancel={onCancel}
      onDelete={isNew ? undefined : onDelete}
      submitLabel={isNew ? "Add vendor" : "Save changes"}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="v-name" label="Name" required value={v.name} onChange={(x) => setV({ ...v, name: x })}
          placeholder="Sharma Seating Works" />
        <SelectField id="v-type" label="Type" value={v.type} onChange={(x) => setV({ ...v, type: x as Vendor["type"] })}
          options={[
            { value: "SUPPLIER", label: "Supplier — makes or sells to Kurchi" },
            { value: "INSTALLATION", label: "Installation crew — fits at site" },
            { value: "TRANSPORTER", label: "Transporter — moves consignments" },
          ]} />
        <Field id="v-gstin" label="GSTIN" value={v.gstin ?? ""} onChange={(x) => setV({ ...v, gstin: x.toUpperCase() })} />
        <Field id="v-city" label="City" value={v.city} onChange={(x) => setV({ ...v, city: x })} />
        <SelectField id="v-state" label="State" value={v.state} onChange={(x) => setV({ ...v, state: x })}
          options={STATES.map((s) => ({ value: s, label: s }))} />
        <Field id="v-contact" label="Contact name" value={v.contactName} onChange={(x) => setV({ ...v, contactName: x })} />
        <Field id="v-phone" label="Phone" value={v.contactPhone} onChange={(x) => setV({ ...v, contactPhone: x })} />
      </div>
      {v.type === "INSTALLATION" && (
        <p className="mt-3 rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Install crews can be assigned to a project, and their scorecard builds from real
          deliveries — on-time %, damage on arrival and rework they caused.
        </p>
      )}
    </EditPanel>
  );
}

/* ----------------------------------------------------------------- users */

export function UsersPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const [inviting, setInviting] = useState(false);
  if (!user) return null;

  const users = repo.users();

  const columns: Column<AppUser>[] = [
    { key: "name", header: "Name", primary: true, cell: (u) => u.name },
    { key: "email", header: "Email", subtitle: true, cell: (u) => <span className="font-mono text-xs">{u.email}</span> },
    {
      key: "role", header: "Role",
      cell: (u) => (
        <span className="rounded-full border px-2 py-0.5 text-xs font-semibold">
          {u.role.replace(/_/g, " ").toLowerCase()}
        </span>
      ),
    },
    {
      key: "scope", header: "Scoped to",
      cell: (u) =>
        u.clientId ? repo.clientById(u.clientId)?.name ?? u.clientId
          : u.teamId ? repo.vendorById(u.teamId)?.name ?? u.teamId
          : <span className="text-xs text-muted-foreground">everything</span>,
    },
    {
      key: "active", header: "Status",
      cell: (u) => (
        <button
          type="button"
          onClick={() => run(() => act.setUserActive(user, u.uid, !u.active), u.active ? `${u.name} deactivated` : `${u.name} activated`)}
          className={cn(
            "rounded-full border px-2 py-0.5 text-xs font-semibold",
            u.active ? "border-red-200 bg-red-50 text-red-700" : "border-red-200 bg-red-50 text-red-700"
          )}
        >
          {u.active ? "active" : "inactive"}
        </button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Administration"
        title="Users & roles"
        description="Role decides which app a person sees and which fields reach their browser — rules AC-02 and AC-03."
        actions={<button type="button" onClick={() => setInviting(true)} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground">Invite user</button>}
      />
      {inviting && <InviteUserPanel onClose={() => setInviting(false)} />}
      <ResponsiveTable data={users} columns={columns} keyOf={(u) => u.uid} minWidth="min-w-[760px]" />

      <DataStatus className="mt-4" />

      <p className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">Invites create a Firebase account and its protected role profile. Mobile users sign in with OTP after their mobile number is added.</p>
    </>
  );
}

function InviteUserPanel({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [phoneNumber, setPhoneNumber] = useState(""); const [role, setRole] = useState<AppUser["role"]>("INSTALLATION"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null); const [done, setDone] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(null); if (!functions) { setError("Firebase Functions is not configured in this build."); return; } setBusy(true); try { const invite = httpsCallable(functions, "provisionWorkspaceUser"); const response = await invite({ name, email: email || undefined, phoneNumber: phoneNumber || undefined, role }); const result = response.data as { email?: string | null; phoneNumber?: string | null }; setDone(`Account ready for ${result.phoneNumber || result.email || name}. They can now use the selected login method.`); } catch (err) { setError(err instanceof Error ? err.message : "Could not create the Firebase account."); } finally { setBusy(false); } };
  return <section className="mb-5 rounded-2xl border-2 border-primary/25 bg-card p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Firebase invite</p><h2 className="mt-1 text-xl font-extrabold">Add a workspace user</h2></div><button type="button" onClick={onClose} className="rounded-xl border px-3 py-2 text-sm font-bold">Close</button></div>{done ? <div className="mt-4 rounded-xl bg-primary/10 p-4 text-sm font-bold text-primary">{done}</div> : <form onSubmit={submit} className="mt-5 grid gap-3 sm:grid-cols-2"><input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/><select value={role} onChange={(e) => setRole(e.target.value as AppUser["role"])} className="min-h-11 rounded-xl border bg-background px-3 text-sm font-bold">{["ADMIN", "ACCOUNTS", "INSTALLATION", "CLIENT", "VENDOR", "SUPER_ADMIN"].map((value) => <option key={value}>{value.replaceAll("_", " ")}</option>)}</select><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address (optional for OTP)" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/><input value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="Mobile: +919876543210" className="min-h-11 rounded-xl border bg-background px-3 text-sm"/><p className="sm:col-span-2 text-xs text-muted-foreground">Add at least an email or an E.164 mobile number. Mobile login uses OTP; email accounts need their password set through Firebase Auth.</p>{error && <p className="sm:col-span-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}<button disabled={busy || (!email && !phoneNumber)} className="sm:col-span-2 min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40">{busy ? "Creating account…" : "Create Firebase account"}</button></form>}</section>;
}
