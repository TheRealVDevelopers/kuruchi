import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Boxes, Minus, Plus } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo, NOW } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { PageHeader } from "@/components/app/Shell";
import { RuleTag } from "@/components/app/RuleGate";
import { formatINR } from "@/lib/money";
import { cn } from "@/lib/utils";

const STATES = [
  "Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Odisha", "Punjab", "Rajasthan", "Tamil Nadu",
  "Telangana", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

function inDays(n: number) {
  const d = new Date(NOW);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function NewProjectPage() {
  useDb();
  const { user } = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const [params] = useSearchParams();

  const clients = repo.clients();
  const programmes = repo.programmes();
  const kits = repo.kits();
  const crews = repo.vendors("INSTALLATION");

  const [clientId, setClientId] = useState(clients[0]?.id ?? "");
  const programmesForClient = programmes.filter((p) => p.clientId === clientId);
  const [programmeId, setProgrammeId] = useState(programmesForClient[0]?.id ?? "");
  const [kitId, setKitId] = useState(params.get("kit") ?? kits[0]?.id ?? "");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Karnataka");
  const [pincode, setPincode] = useState("");
  const [address, setAddress] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [targetDate, setTargetDate] = useState(inDays(45));
  const [teamId, setTeamId] = useState("");
  const [retentionPct, setRetentionPct] = useState(5);
  const [dlpMonths, setDlpMonths] = useState(12);

  const kit = repo.kitById(kitId);

  // Quantities start at the kit defaults and are edited before saving — BQ-01.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const lines = useMemo(() => {
    if (!kit) return [];
    return kit.lines.map((l) => {
      const product = repo.productById(l.productId);
      const qty = quantities[l.productId] ?? l.defaultQty;
      return {
        ...l,
        qty,
        basePrice: product?.defaultBasePrice ?? 0,
        sellingPrice: product?.defaultSellingPrice ?? 0,
        lineValue: (product?.defaultSellingPrice ?? 0) * qty,
        hsn: product?.hsnCode ?? "",
      };
    });
  }, [kit, quantities]);

  const total = lines.reduce((s, l) => s + l.lineValue, 0);
  const activeLines = lines.filter((l) => l.qty > 0).length;

  if (!user) return null;

  function submit() {
    const project = act.createProjectFromKit(user!, {
      clientId, programmeId, city, state, pincode, address,
      contactName, contactPhone,
      targetCompletionDate: targetDate,
      installationTeamId: teamId || undefined,
      retentionPct, dlpMonths, kitId,
      quantities: Object.fromEntries(lines.map((l) => [l.productId, l.qty])),
    });
    navigate(`/admin/projects/${project.id}?tab=boq`);
  }

  return (
    <>
      <Link
        to="/admin/projects"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>

      <PageHeader
        eyebrow="New project"
        title="Create from a kit"
        description="Pick the kit, set the site, adjust quantities. The BOQ lands in draft — nothing reaches the client until you send it."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* ------------------------------------------------- site details */}
        <div className="space-y-5 lg:col-span-2">
          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-4 font-bold">Client & programme</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                id="np-client" label="Client" value={clientId}
                onChange={(v) => {
                  setClientId(v);
                  const first = programmes.find((p) => p.clientId === v);
                  setProgrammeId(first?.id ?? "");
                }}
                options={clients.map((c) => ({ value: c.id, label: c.name }))}
              />
              <Select
                id="np-programme" label="Programme" value={programmeId}
                onChange={setProgrammeId}
                options={programmesForClient.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-4 font-bold">Site</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field id="np-city" label="City" value={city} onChange={setCity} placeholder="Coimbatore" required />
              <Select
                id="np-state" label="State" value={state} onChange={setState}
                options={STATES.map((s) => ({ value: s, label: s }))}
              />
              <Field id="np-pin" label="PIN code" value={pincode} onChange={(v) => setPincode(v.replace(/\D/g, "").slice(0, 6))} placeholder="641012" />
              <div className="sm:col-span-2">
                <Field id="np-address" label="Address" value={address} onChange={setAddress} placeholder="Unit 6, Brookefields Mall, Brookebond Road" />
              </div>
              <Field id="np-contact" label="Site contact name" value={contactName} onChange={setContactName} placeholder="Ramesh Kumar" />
              <Field id="np-phone" label="Site contact phone" value={contactPhone} onChange={setContactPhone} placeholder="+91 98400 12345" required />
            </div>
            <p className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <RuleTag id="DS-05" /> A new site starts with every readiness check red. Confirm them before dispatch.
            </p>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <h2 className="mb-4 font-bold">Schedule & terms</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor="np-target" className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Target completion
                </label>
                <input
                  id="np-target" type="date" value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-md border bg-background px-3 py-2.5 text-sm"
                />
              </div>
              <Field id="np-ret" label="Retention %" value={String(retentionPct)} onChange={(v) => setRetentionPct(Number(v.replace(/\D/g, "")) || 0)} />
              <Field id="np-dlp" label="DLP months" value={String(dlpMonths)} onChange={(v) => setDlpMonths(Number(v.replace(/\D/g, "")) || 0)} />
              <div className="sm:col-span-3">
                <Select
                  id="np-crew" label="Installation crew" value={teamId} onChange={setTeamId}
                  options={[
                    { value: "", label: "Assign later" },
                    ...crews.map((c) => ({
                      value: c.id,
                      label: `${c.name} — ${c.city}${c.scorecard ? ` · ${c.scorecard.onTimePct}% on-time` : ""}`,
                    })),
                  ]}
                />
              </div>
            </div>
          </section>

          {/* ------------------------------------------------------- kit */}
          <section className="rounded-lg border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold">
                <Boxes className="h-4 w-4 text-muted-foreground" /> Kit
              </h2>
              <select
                id="np-kit"
                aria-label="Kit"
                value={kitId}
                onChange={(e) => { setKitId(e.target.value); setQuantities({}); }}
                className="rounded-md border bg-background px-2.5 py-2 text-sm font-medium"
              >
                {kits.map((k) => (
                  <option key={k.id} value={k.id}>{k.name} v{k.version}</option>
                ))}
                <option value="">Start empty</option>
              </select>
            </div>

            {kit ? (
              <ul className="divide-y rounded-md border">
                {lines.map((l) => (
                  <li
                    key={l.productId}
                    className={cn(
                      "flex flex-wrap items-center justify-between gap-3 px-3 py-2.5",
                      l.qty === 0 && "opacity-45"
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.zone} · {formatINR(l.sellingPrice)} each
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Stepper
                        label={`Decrease ${l.name}`}
                        icon={<Minus className="h-3.5 w-3.5" />}
                        onClick={() => setQuantities({ ...quantities, [l.productId]: Math.max(0, l.qty - 1) })}
                      />
                      <input
                        aria-label={`Quantity for ${l.name}`}
                        type="number"
                        min={0}
                        value={l.qty}
                        onChange={(e) =>
                          setQuantities({ ...quantities, [l.productId]: Math.max(0, Number(e.target.value) || 0) })
                        }
                        className="w-14 rounded-md border bg-background px-2 py-1.5 text-center text-sm tabular-nums"
                      />
                      <Stepper
                        label={`Increase ${l.name}`}
                        icon={<Plus className="h-3.5 w-3.5" />}
                        onClick={() => setQuantities({ ...quantities, [l.productId]: l.qty + 1 })}
                      />
                      <span className="ml-2 w-24 text-right text-sm font-semibold tabular-nums">
                        {formatINR(l.lineValue)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Starting empty — you'll add BOQ lines by hand on the project.
              </p>
            )}
          </section>
        </div>

        {/* ---------------------------------------------------- summary */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border bg-card p-4">
            <h2 className="mb-3 font-bold">Summary</h2>
            <dl className="space-y-2 text-sm">
              <Row k="Project code" v={<span className="font-mono text-xs">assigned on save</span>} />
              <Row k="Site" v={city ? `${city}, ${state}` : <span className="text-muted-foreground">—</span>} />
              <Row k="Kit" v={kit ? `${kit.name} v${kit.version}` : "none"} />
              <Row k="Lines" v={String(activeLines)} />
              <Row k="Crew" v={repo.vendorById(teamId)?.name ?? "assign later"} />
              <Row k="Retention" v={`${retentionPct}%`} />
            </dl>

            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                BOQ value
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{formatINR(total)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">at default selling prices</p>
            </div>

            <button
              type="button"
              disabled={!city.trim() || !contactPhone.trim()}
              onClick={() =>
                run(
                  submit,
                  "Project created",
                  kit ? `${activeLines} lines copied from ${kit.name}.` : undefined
                )
              }
              className="mt-4 w-full rounded-md bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Create project
            </button>

            {(!city.trim() || !contactPhone.trim()) && (
              <p className="mt-2 text-xs text-muted-foreground">
                City and a site contact number are required.
              </p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- inputs */

function Field({
  id, label, value, onChange, placeholder, required, hidden,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; hidden?: boolean;
}) {
  if (hidden) return null;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

function Select({
  id, label, value, onChange, options,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function Stepper({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="rounded-md border p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {icon}
    </button>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-semibold">{v}</dd>
    </div>
  );
}
