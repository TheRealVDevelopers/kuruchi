import { useState } from "react";
import { Plus } from "lucide-react";
import type { AppUser } from "@/types";
import { repo } from "@/data/repo";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { formatINR } from "@/lib/money";

const ZONES = ["Front", "Display", "Waiting", "Consultation", "Sales desk", "Back office"];

/** Add a single line to a draft BOQ, pulling defaults straight from the catalogue. */
export function AddBoqLine({ projectId, user }: { projectId: string; user: AppUser }) {
  const run = useAction();
  const [open, setOpen] = useState(false);
  const products = repo.products({ activeOnly: true });
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [zone, setZone] = useState(ZONES[0]);

  const product = repo.productById(productId);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed py-3.5 text-sm font-semibold text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        Add a line
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const ok = run(
          () => act.addBoqLine(user, projectId, productId, qty, zone),
          `${product?.name ?? "Line"} ×${qty} added`
        );
        if (ok) { setQty(1); setOpen(false); }
      }}
      className="rounded-lg border-2 border-primary/30 bg-card p-4"
    >
      <h3 className="mb-3 font-bold">Add a line</h3>

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="sm:col-span-2">
          <label htmlFor="abl-product" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Product
          </label>
          <select
            id="abl-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatINR(p.defaultSellingPrice)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="abl-qty" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Quantity
          </label>
          <input
            id="abl-qty"
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-sm tabular-nums"
          />
        </div>

        <div>
          <label htmlFor="abl-zone" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Zone
          </label>
          <select
            id="abl-zone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
          >
            {ZONES.map((z) => <option key={z}>{z}</option>)}
          </select>
        </div>
      </div>

      {product && (
        <p className="mt-3 text-sm text-muted-foreground">
          Line value{" "}
          <strong className="text-foreground tabular-nums">
            {formatINR(product.defaultSellingPrice * qty)}
          </strong>{" "}
          · HSN {product.hsnCode} · {product.leadTimeDays}-day lead
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
          Add to BOQ
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border px-4 py-2.5 text-sm font-semibold hover:bg-muted">
          Cancel
        </button>
      </div>
    </form>
  );
}
