import { Link, useSearchParams } from "react-router-dom";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/money";

export default function ProductsPage() {
  useDb();
  const [params, setParams] = useSearchParams();
  const active = params.get("category") ?? "All";
  const categories = ["All", ...repo.categories()];
  const products = repo.products({ category: active, activeOnly: true });

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <header className="mb-8">
        <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Catalogue
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Products</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Standard lines we manufacture and supply. Finishes, fabrics and dimensions are
          customised per project — prices shown are starting prices.
        </p>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => (c === "All" ? setParams({}) : setParams({ category: c }))}
            aria-pressed={active === c}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              active === c
                ? "border-foreground bg-foreground text-background"
                : "hover:bg-muted"
            )}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((p) => (
          <Link
            key={p.id}
            to={`/products/${p.slug}`}
            className="group flex flex-col rounded-lg border bg-card p-4 transition-colors hover:border-foreground/30"
          >
            <div className="mb-4 grid h-40 place-items-center rounded bg-muted/60 font-mono text-xs text-muted-foreground">
              {p.category}
            </div>
            <h2 className="font-semibold leading-tight">{p.name}</h2>
            <p className="mt-1 flex-1 text-sm text-muted-foreground">{p.shortSpec}</p>
            <div className="mt-4 flex items-end justify-between">
              <p className="text-sm">
                <span className="text-muted-foreground">from </span>
                <span className="font-semibold tabular-nums">{formatINR(p.startingPrice)}</span>
              </p>
              <span className="font-mono text-[11px] text-muted-foreground">
                {p.leadTimeDays}d lead
              </span>
            </div>
          </Link>
        ))}
      </div>

      {products.length === 0 && (
        <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          Nothing in this category yet.
        </p>
      )}
    </div>
  );
}
