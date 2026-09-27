import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, CheckCircle2, Factory, PackagePlus, ShoppingCart } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { formatINR } from "@/lib/money";
import { EmptyState, PageHeader } from "@/components/app/Shell";
import type { PurchaseOrder, ScheduleTaskStatus } from "@/types";

export default function ProcurementPage() {
  useDb();
  const { user } = useAuth();
  const run = useAction();
  const projects = repo.projects(user);
  const vendors = repo.vendors("SUPPLIER");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [vendorId, setVendorId] = useState(vendors[0]?.id ?? "");
  const [expectedAt, setExpectedAt] = useState("");
  const [amount, setAmount] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const project = projects.find((entry) => entry.id === projectId);
  const approvedItems = repo.itemsRaw(projectId).filter((item) => ["APPROVED", "PO_PLACED"].includes(item.status) && (item.qtyOrdered ?? 0) < item.qty);
  const orders = repo.purchaseOrders(projectId);
  const tasks = repo.scheduleTasks(projectId);
  const selectedItems = useMemo(() => approvedItems.filter((item) => (quantities[item.id] ?? 0) > 0), [approvedItems, quantities]);

  if (!user) return null;
  if (!project) return <EmptyState title="Create a project first" hint="Purchase orders and schedules are created inside a showroom project." />;

  const changeProject = (id: string) => {
    setProjectId(id);
    setQuantities({});
    setExpectedAt(projects.find((entry) => entry.id === id)?.targetCompletionDate.slice(0, 10) ?? "");
  };
  const setQuantity = (itemId: string, value: number, available: number) => setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(available, Math.floor(value) || 0)) }));
  const scope = selectedItems.map((item) => `${item.name} ×${quantities[item.id]}`).join(", ");

  return (
    <>
      <PageHeader
        eyebrow="Purchasing"
        title="Purchase orders & schedule"
        description="Choose approved BOQ items, award them to a supplier, set the promised date, then move ready items to dispatch."
        actions={<Link to="/admin/vendors?new=1" className="inline-flex items-center gap-2 rounded-xl bg-primary px-3.5 py-2 text-sm font-bold text-primary-foreground"><Factory className="h-4 w-4" /> Add supplier</Link>}
      />

      <section className="mb-5 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="eyebrow">Step 1</p><h2 className="mt-1 text-lg font-extrabold">Choose the showroom project</h2></div>
          <select value={projectId} onChange={(event) => changeProject(event.target.value)} className="min-h-11 rounded-xl border bg-background px-3 text-sm font-bold">
            {projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.site.city} · {entry.code}</option>)}
          </select>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">Client approval is complete. Only approved BOQ items are shown below.</p>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_25rem]">
        <section className="rounded-2xl border bg-card p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3"><div><p className="eyebrow">Step 2</p><h2 className="mt-1 text-lg font-extrabold">Select items for this supplier</h2></div><span className="rounded-full bg-primary/10 px-3 py-1.5 text-sm font-bold text-primary">{selectedItems.length} selected</span></div>
          {approvedItems.length === 0 ? <EmptyState title="No approved BOQ quantity waiting" hint="All approved quantities have already been awarded to suppliers." /> : <div className="mt-4 grid gap-2 sm:grid-cols-2">{approvedItems.map((item) => {
            const available = item.qty - (item.qtyOrdered ?? 0); const quantity = quantities[item.id] ?? 0;
            return <div key={item.id} className={`rounded-xl border-2 p-3.5 ${quantity ? "border-primary bg-primary/10" : "border-border bg-background"}`}>
              <span className="flex items-start justify-between gap-2"><span className="font-extrabold">{item.name}</span>{quantity > 0 && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.spec || "Standard specification"}</span>
              <span className="mt-3 block text-sm font-bold">{available} of {item.qty} {item.unit} available · {formatINR(item.pricing.basePrice * available)}</span>
              <label className="mt-3 flex items-center justify-between gap-2 text-xs font-bold text-muted-foreground">Qty for this supplier<input min="0" max={available} type="number" value={quantity || ""} onChange={(event) => setQuantity(item.id, Number(event.target.value), available)} className="min-h-9 w-20 rounded-lg border bg-background px-2 text-right text-sm font-bold text-foreground" /></label>
            </div>;
          })}</div>}
        </section>

        <form onSubmit={(event) => {
          event.preventDefault();
          const number = `KP/PO/26-27/${String(repo.purchaseOrders().length + 1).padStart(4, "0")}`;
          const allocations = selectedItems.map((item) => ({ itemId: item.id, qty: quantities[item.id] }));
          const saved = run(() => act.savePurchaseOrder(user, { id: `po-${Date.now()}`, number, projectId, vendorId, itemIds: allocations.map((allocation) => allocation.itemId), allocations, description: scope, amount: Number(amount), orderedAt: new Date().toISOString(), expectedAt: new Date(expectedAt).toISOString(), status: "ISSUED", createdBy: user.name }), "Purchase order issued", "The supplier can now confirm when these BOQ quantities are ready.");
          if (saved) { setQuantities({}); setAmount(""); }
        }} className="h-fit rounded-2xl border-2 border-primary/25 bg-card p-4 sm:p-5">
          <p className="eyebrow">Step 3</p><h2 className="mt-1 text-lg font-extrabold">Issue purchase order</h2>
          <p className="mt-1 text-sm text-muted-foreground">This sends the selected BOQ items to one supplier.</p>
          <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Supplier</label>
          <select required value={vendorId} onChange={(event) => setVendorId(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-semibold"><option value="" disabled>Select supplier</option>{vendors.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name} · {vendor.city}</option>)}</select>
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Promised ready date</label>
          <input required type="date" value={expectedAt} onChange={(event) => setExpectedAt(event.target.value)} className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-semibold" />
          <label className="mt-3 block text-xs font-bold uppercase tracking-wide text-muted-foreground">Order value</label>
          <input required min="1" type="number" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Enter supplier value" className="mt-1.5 min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-semibold" />
          <div className="mt-4 rounded-xl bg-muted/60 p-3"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Selected scope</p><p className="mt-1 text-sm font-semibold">{scope || "Choose one or more BOQ items"}</p></div>
          <button disabled={!selectedItems.length || !vendorId} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-extrabold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"><ShoppingCart className="h-4 w-4" /> Issue purchase order</button>
        </form>
      </div>

      <section className="mt-5 rounded-2xl border bg-card p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Step 4</p><h2 className="mt-1 text-lg font-extrabold">Project schedule</h2><p className="mt-1 text-sm text-muted-foreground">Set responsibility and track the opening-date plan.</p></div>{tasks.length === 0 && <button type="button" onClick={() => run(() => act.createRolloutSchedule(user, projectId), "Project schedule created")} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold hover:bg-muted"><CalendarDays className="h-4 w-4" /> Create schedule</button>}</div>{tasks.length > 0 && <div className="mt-4 grid gap-2">{tasks.map((task) => <div key={task.id} className="grid gap-2 rounded-xl border bg-background p-3 sm:grid-cols-[1fr_12rem_9rem]"><div><p className="font-bold">{task.title}</p><p className="text-xs text-muted-foreground">{task.plannedStart.slice(0, 10)} → {task.plannedEnd.slice(0, 10)}</p></div><input defaultValue={task.owner ?? ""} onBlur={(event) => run(() => act.updateScheduleTask(user, task.id, { owner: event.target.value, status: task.status }), "Schedule owner saved")} placeholder="Owner name" className="min-h-10 rounded-lg border bg-card px-3 text-sm"/><select value={task.status} onChange={(event) => run(() => act.updateScheduleTask(user, task.id, { status: event.target.value as ScheduleTaskStatus, owner: task.owner }), "Schedule status updated")} className="min-h-10 rounded-lg border bg-card px-3 text-sm font-semibold">{["NOT_STARTED", "IN_PROGRESS", "BLOCKED", "DONE"].map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>)}</div>}</section>

      <section className="mt-5"><div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">Supplier follow-up</p><h2 className="mt-1 text-lg font-extrabold">Purchase orders for {project.site.city}</h2></div><Link to="/admin/dispatch" className="inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-bold hover:bg-muted"><PackagePlus className="h-4 w-4" /> Open dispatch</Link></div>{orders.length === 0 ? <EmptyState title="No purchase orders yet" hint="Select approved BOQ items above and issue the first supplier order." /> : <div className="grid gap-3 lg:grid-cols-2">{orders.map((order) => <OrderCard key={order.id} order={order} />)}</div>}</section>
    </>
  );
}

function OrderCard({ order }: { order: PurchaseOrder }) {
  const vendor = repo.vendorById(order.vendorId);
  const items = repo.itemsRaw(order.projectId).filter((item) => order.itemIds?.includes(item.id));
  return <article className="rounded-2xl border bg-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs font-bold text-primary">{order.number}</p><h3 className="mt-1 font-extrabold">{vendor?.name ?? "Supplier"}</h3><p className="mt-1 text-sm text-muted-foreground">Ready by {order.expectedAt.slice(0, 10)}</p></div><span className="rounded-full border bg-muted px-2.5 py-1 text-xs font-bold">{order.status.replaceAll("_", " ")}</span></div><p className="mt-3 text-sm font-semibold">{items.length ? items.map((item) => `${item.name} ×${order.allocations?.find((allocation) => allocation.itemId === item.id)?.qty ?? item.qty}`).join(", ") : order.description}</p><p className="mt-3 text-sm font-extrabold">{formatINR(order.amount)}</p></article>;
}
