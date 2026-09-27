export default function About() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-16">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        About
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Kurchi</h1>

      <div className="mt-6 space-y-5 text-muted-foreground">
        <p>
          We manufacture and supply furniture for retail environments — storage, seating,
          counters and tables — from our facility in Bengaluru, supported by a panel of
          vetted suppliers for specialist lines.
        </p>
        <p>
          Most of our work is roll-outs: a brand opening the same showroom format in twenty
          or fifty cities, where every site needs the same kit, on a date that does not
          move. That is a manufacturing job for about a third of the effort and a logistics
          and installation job for the rest.
        </p>
        <p>
          So we run it as one process. Items are made or bought against a project, packed
          into numbered crates and photographed, moved on documented consignments, received
          and checked at site by a local crew, installed zone by zone, snagged, and handed
          over against a signed certificate. Our clients watch the same records we do.
        </p>
      </div>

      <dl className="mt-10 grid gap-6 sm:grid-cols-3">
        {[
          { k: "Based in", v: "Bengaluru, Karnataka" },
          { k: "Installing across", v: "Kerala, Delhi, Maharashtra, MP and more" },
          { k: "Typical roll-out", v: "20–50 sites per programme" },
        ].map((f) => (
          <div key={f.k}>
            <dt className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              {f.k}
            </dt>
            <dd className="mt-1 text-sm font-medium">{f.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
