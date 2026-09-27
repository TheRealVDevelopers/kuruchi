import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import { formatINR } from "@/lib/money";

export default function ProductDetailPage() {
  useDb();
  const { slug = "" } = useParams();
  const product = repo.productBySlug(slug);

  if (!product) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Product not found</h1>
        <Link to="/products" className="mt-4 inline-block text-sm hover:underline">
          ← Back to all products
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <Link
        to="/products"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All products
      </Link>

      <div className="grid gap-10 lg:grid-cols-2">
        <div className="grid h-80 place-items-center rounded-lg border bg-muted/60 font-mono text-xs text-muted-foreground lg:h-[26rem]">
          {product.name}
        </div>

        <div>
          <p className="mb-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
            {product.category}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{product.name}</h1>
          <p className="mt-3 text-muted-foreground">{product.description}</p>

          <div className="mt-6 flex items-baseline gap-2">
            <span className="text-sm text-muted-foreground">from</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatINR(product.startingPrice)}
            </span>
            <span className="text-sm text-muted-foreground">per {product.unit}</span>
          </div>

          <dl className="mt-8 divide-y rounded-lg border">
            {Object.entries(product.specs).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 px-4 py-2.5 text-sm">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="text-right font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-6 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">Lead time</dt>
              <dd className="text-right font-medium">{product.leadTimeDays} days</dd>
            </div>
            <div className="flex justify-between gap-6 px-4 py-2.5 text-sm">
              <dt className="text-muted-foreground">HSN</dt>
              <dd className="text-right font-mono text-xs font-medium">{product.hsnCode}</dd>
            </div>
          </dl>

          <Link
            to="/contact"
            className="mt-6 inline-flex rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Enquire about this product
          </Link>
        </div>
      </div>
    </div>
  );
}
