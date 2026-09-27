import { Link } from "react-router-dom";
import { ArrowRight, Factory, MapPin, PackageCheck } from "lucide-react";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";

const CATEGORY_BLURB: Record<string, string> = {
  "Storage Units": "Closed and open storage for back-of-house and display walls.",
  Sofas: "Customer waiting seating built for retail footfall.",
  Chairs: "Visitor, consultation and sales-desk seating.",
};

export default function Index() {
  useDb();
  const categories = ["Storage Units", "Sofas", "Chairs"];
  const products = repo.products({ activeOnly: true });

  return (
    <>
      {/* hero */}
      <section className="relative isolate overflow-hidden border-b">
        <img src="/images/showroom-hero-v1.png" alt="Contemporary showroom interior being fitted out" className="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-55" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-background via-background/90 to-background/25" />
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            Manufacture · Supply · Install
          </p>
          <h1 className="max-w-3xl text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
            Showroom furniture, made in Bengaluru and installed across India.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">
            We build the storage, seating and counters that retail roll-outs run on — then
            crate them, track them to site and install them, city by city.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/products"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90"
            >
              See the range <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/contact"
              className="inline-flex items-center rounded-xl border border-white/15 bg-background/40 px-5 py-3 text-sm font-bold backdrop-blur hover:bg-muted"
            >
              Talk to us about a roll-out
            </Link>
          </div>

          <dl className="mt-14 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Factory, k: "Own manufacturing", v: "Bengaluru facility, plus a vetted supplier panel" },
              { icon: PackageCheck, k: "Crate-level tracking", v: "Every consignment photographed and scanned" },
              { icon: MapPin, k: "Pan-India installation", v: "Local fit-out crews in every region we ship to" },
            ].map((f) => (
              <div key={f.k} className="glass-panel flex gap-3 rounded-2xl p-4">
                <f.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                <div>
                  <dt className="text-sm font-semibold">{f.k}</dt>
                  <dd className="mt-0.5 text-sm text-muted-foreground">{f.v}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* categories */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">What we make</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Standard lines, customised to your spec and finish.
            </p>
          </div>
          <Link to="/products" className="shrink-0 text-sm font-medium hover:underline">
            All products →
          </Link>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {categories.map((c) => {
            const count = products.filter((p) => p.category === c).length;
            return (
              <Link
                key={c}
                to={`/products?category=${encodeURIComponent(c)}`}
                className="visual-card group p-4"
              >
                <div className="relative mb-5 h-36 overflow-hidden rounded-xl bg-muted">
                  <img src="/images/showroom-hero-v1.png" alt="" className="h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105" style={{ objectPosition: c === "Chairs" ? "82% center" : c === "Sofas" ? "75% bottom" : "56% center" }} />
                  <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
                  <span className="absolute bottom-3 left-3 text-sm font-bold text-white">{c}</span>
                </div>
                <h3 className="font-semibold">{c}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{CATEGORY_BLURB[c]}</p>
                <p className="mt-3 font-mono text-xs text-muted-foreground">
                  {count} {count === 1 ? "line" : "lines"} →
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* roll-out pitch */}
      <section className="border-t bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
            Opening fifty showrooms is a logistics problem, not a furniture problem.
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Our clients see every item from production to installed — consignment numbers,
            ETAs, receipt photos and sign-off — in one place, so nobody has to ring a site
            to find out where something is.
          </p>
          <Link
            to="/contact"
            className="mt-6 inline-flex items-center gap-2 text-sm font-medium hover:underline"
          >
            Ask for a walkthrough <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
