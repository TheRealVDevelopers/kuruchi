import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, ChevronLeft, CreditCard, Store, UserRound } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import * as act from "@/data/actions";
import { useAction } from "@/lib/useAction";
import { formatINR } from "@/lib/money";
import { uploadPaymentProof } from "@/lib/firebaseFiles";
import { useDb } from "@/data/store";
import { toast } from "sonner";

const STATES = ["Andhra Pradesh", "Assam", "Bihar", "Chhattisgarh", "Delhi", "Goa", "Gujarat", "Haryana", "Karnataka", "Kerala", "Maharashtra", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal"];
const STEPS = ["Showroom", "Choose BOQ", "Payment"];

export default function NewShowroomRequestPage() {
  // The catalogue and BOQ kits can change in another browser while Ola is
  // filling this form. Subscribe here so the chooser always uses live data.
  useDb();
  const { user } = useAuth();
  const navigate = useNavigate();
  const run = useAction();
  const client = repo.clients().find((row) => row.id === user?.clientId) ?? repo.clients()[0];
  const programme = repo.programmes().find((row) => row.clientId === client?.id);
  const products = repo.products().filter((product) => product.active);
  const standardKit = repo.kits().find((kit) => kit.active && kit.mode !== "MODULAR");

  const [step, setStep] = useState(0);
  const [showroomName, setShowroomName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("Karnataka");
  const [pincode, setPincode] = useState("");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [owner, setOwner] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [openingDate, setOpeningDate] = useState("");
  const [mode, setMode] = useState<"STANDARD" | "MODULAR">("STANDARD");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const lines = useMemo(() => {
    const source = mode === "STANDARD"
      ? standardKit?.lines ?? []
      : products.map((product) => ({ productId: product.id, name: product.name, spec: product.shortSpec, defaultQty: 0, zone: "Showroom" }));
    return source.map((line) => {
      const product = repo.productById(line.productId);
      const qty = mode === "MODULAR" ? quantities[line.productId] ?? 0 : line.defaultQty;
      const price = product?.defaultSellingPrice ?? 0;
      return { ...line, qty, price, total: qty * price };
    });
  }, [mode, products, quantities, standardKit]);

  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const paid = Number(amount) || 0;
  const percentage = total > 0 ? Math.round((paid / total) * 10000) / 100 : 0;
  const hasBoq = lines.some((line) => line.qty > 0);
  const hasUnpricedLine = lines.some((line) => line.qty > 0 && line.price <= 0);
  if (!user || !client) return null;

  const showroomReady = showroomName.trim() && city.trim() && address.trim() && pincode.length === 6 && owner.trim() && phone.trim() && openingDate;
  const paymentReady = paid > 0 && Boolean(reference.trim());
  const setQuantity = (productId: string, value: string) => {
    const parsed = Number(value);
    const qty = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
    setQuantities((current) => ({ ...current, [productId]: qty }));
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      let proof: { name: string; url: string } | undefined;
      let proofPendingUpload = false;
      if (proofFile) {
        try {
          proof = await uploadPaymentProof(proofFile, user.uid);
        } catch {
          // Demo access deliberately has no Firebase identity. The payment
          // request must still reach Accounts when an optional file cannot
          // be uploaded; its filename remains visible for follow-up.
          proofPendingUpload = true;
        }
      }
      const saved = run(() => {
        const project = act.createProjectFromKit(user, {
          clientId: client.id, programmeId: programme?.id ?? "", showroomName, showroomGstin: gstin,
          city, state, pincode, address, contactName: owner, contactPhone: phone,
          targetCompletionDate: openingDate, retentionPct: 5, dlpMonths: 12,
          kitId: mode === "STANDARD" ? standardKit?.id : undefined,
          boqMode: mode,
          quantities: Object.fromEntries(lines.map((line) => [line.productId, line.qty])),
          franchisee: { name: owner, phone, email, gstin },
          payment: { amount: paid, reference, proofName: proof?.name ?? proofFile?.name, proofUrl: proof?.url },
        });
        navigate(`/portal/projects/${project.id}`);
      }, "Payment sent to Accounts", "Accounts will verify the amount and reference. Kurchi Admin receives the project only after verification.");
      if (!saved) setSubmitting(false);
      else if (proofPendingUpload) toast.info("Payment sent without the screenshot", { description: "The UTR was saved for Accounts. Attach the file again after sign-in is enabled." });
    } catch (error) {
      setSubmitting(false);
      run(() => { throw error; }, "Payment proof could not be uploaded");
    }
  };

  return <div className="mx-auto max-w-4xl">
    <Link to="/portal" className="mb-5 inline-flex items-center gap-1.5 text-sm font-bold text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back to showrooms</Link>
    <section className="rounded-[2rem] bg-rail p-6 text-rail-foreground sm:p-8"><p className="text-xs font-bold uppercase tracking-[.16em] text-rail-muted">Ola rollout</p><h1 className="mt-3 text-3xl font-extrabold">Open a new showroom</h1><p className="mt-2 max-w-xl text-sm leading-relaxed text-rail-muted">Add the location, choose the Kurchi BOQ, then share the payment reference. Accounts checks payment before Kurchi starts work.</p><div className="mt-7 grid grid-cols-3 gap-2">{STEPS.map((label, index) => <div key={label} className={`rounded-xl px-3 py-2 text-center text-xs font-bold ${index === step ? "bg-primary text-primary-foreground" : index < step ? "bg-white/15 text-white" : "bg-white/5 text-rail-muted"}`}>{index + 1}. {label}</div>)}</div></section>

    {step === 0 && <section className="mt-5 space-y-5"><FormCard icon={<Store className="h-5 w-5" />} title="Showroom details" hint="Where Kurchi will build the showroom."><div className="grid gap-3 sm:grid-cols-2"><Field label="Showroom name" value={showroomName} onChange={setShowroomName} placeholder="Ola Electric — Indiranagar" required /><Field label="City" value={city} onChange={setCity} placeholder="Bengaluru" required /><Select label="State" value={state} onChange={setState} options={STATES} /><Field label="PIN code" value={pincode} onChange={(value) => setPincode(value.replace(/\D/g, "").slice(0, 6))} placeholder="560038" required /><div className="sm:col-span-2"><Field label="Full showroom address" value={address} onChange={setAddress} placeholder="Building, road, area and landmark" required /></div><Field label="Showroom GSTIN" value={gstin} onChange={(value) => setGstin(value.toUpperCase())} placeholder="Optional, if available" /><Field label="Expected opening date" type="date" value={openingDate} onChange={setOpeningDate} required /></div></FormCard><FormCard icon={<UserRound className="h-5 w-5" />} title="Franchisee owner" hint="They will receive the BOQ and their welcome invite after onboarding is connected."><div className="grid gap-3 sm:grid-cols-2"><Field label="Owner name" value={owner} onChange={setOwner} placeholder="Full name" required /><Field label="Mobile number" value={phone} onChange={setPhone} placeholder="+91 98XXX XXXXX" required /><div className="sm:col-span-2"><Field label="Email address" type="email" value={email} onChange={setEmail} placeholder="For welcome invite" /></div></div></FormCard><button disabled={!showroomReady} onClick={() => setStep(1)} className="inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-40">Next: choose BOQ <ArrowRight className="h-4 w-4" /></button></section>}

    {step === 1 && <section className="mt-5 space-y-5"><div className="grid gap-3 sm:grid-cols-2"><Choice active={mode === "STANDARD"} title="Standard BOQ" text="One fixed Kurchi BOQ. Its products and quantities cannot be changed." onClick={() => setMode("STANDARD")} /><Choice active={mode === "MODULAR"} title="Modular BOQ" text="Use the Kurchi catalogue and enter only the quantity needed for each product." onClick={() => setMode("MODULAR")} /></div><FormCard icon={<CheckCircle2 className="h-5 w-5" />} title={mode === "STANDARD" ? "Standard BOQ" : "Set quantities"} hint={mode === "STANDARD" ? "This is the single approved standard product set." : "Every catalogue product is available. Set 0 for products not needed."}>{mode === "STANDARD" && !standardKit ? <p className="rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Kurchi Admin needs to create the one Standard BOQ before Ola can continue.</p> : <><div className="mt-1 divide-y rounded-2xl border">{lines.map((line) => <div key={line.productId} className="flex items-center justify-between gap-3 px-4 py-3"><div><p className="font-bold">{line.name}</p><p className="mt-1 text-xs text-muted-foreground">{line.zone} · {formatINR(line.price)} each</p></div>{mode === "MODULAR" ? <label className="flex shrink-0 items-center gap-2 text-sm font-bold">Qty <input type="number" min={0} step={1} inputMode="numeric" value={line.qty} onChange={(event) => setQuantity(line.productId, event.target.value)} className="h-10 w-20 rounded-xl border bg-background px-2 text-right" /></label> : <span className="min-w-24 text-right text-sm font-extrabold">{line.qty} · {formatINR(line.total)}</span>}</div>)}</div>{mode === "MODULAR" && products.length === 0 && <p className="mt-4 rounded-2xl bg-muted p-4 text-sm text-muted-foreground">Kurchi Admin needs to add catalogue products before a Modular BOQ can be made.</p>}{hasUnpricedLine && <p className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground">One or more selected products does not have a selling price. Kurchi Admin needs to add the price in the catalogue before payment can be collected.</p>}<div className="mt-5 flex items-end justify-between rounded-2xl bg-muted/60 p-4"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">BOQ total</p><p className="mt-1 text-2xl font-extrabold">{formatINR(total)}</p></div><p className="max-w-48 text-right text-xs text-muted-foreground">{mode === "MODULAR" ? "Only quantities can be edited." : "Fixed product list and quantities."}</p></div></>}</FormCard><div className="flex gap-2"><button onClick={() => setStep(0)} className="inline-flex min-h-12 items-center gap-1 rounded-xl border px-4 text-sm font-bold"><ChevronLeft className="h-4 w-4" /> Back</button><button disabled={!hasBoq || hasUnpricedLine} onClick={() => setStep(2)} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-40">Next: payment <ArrowRight className="h-4 w-4" /></button></div></section>}

    {step === 2 && <section className="mt-5 space-y-5"><FormCard icon={<CreditCard className="h-5 w-5" />} title="Share payment details" hint="Accounts will verify this before the project reaches Kurchi Admin."><div className="rounded-2xl bg-muted/60 p-4"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Approved BOQ total</p><p className="mt-1 text-3xl font-extrabold">{formatINR(total)}</p></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><Field label="Amount paid" type="number" value={amount} onChange={setAmount} placeholder="Enter amount" required /><div className="rounded-xl border bg-muted/50 px-3 py-2"><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Amount paid</p><p className="mt-1 text-xl font-extrabold">{percentage}%</p><p className="text-xs text-muted-foreground">of the selected BOQ</p></div><div className="sm:col-span-2"><Field label="UTR / transaction reference" value={reference} onChange={setReference} placeholder="Example: HDFC123456789" required /></div><label className="sm:col-span-2 block text-sm font-bold">Payment screenshot <span className="font-normal text-muted-foreground">(optional)</span><input type="file" accept="image/*,.pdf" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full rounded-xl border bg-background p-2 text-sm" /><span className="mt-1 block text-xs font-normal text-muted-foreground">{proofFile ? `${proofFile.name} will upload securely with this payment.` : "You can add this later; the UTR is enough for Accounts to verify now."}</span></label></div></FormCard><div className="flex gap-2"><button onClick={() => setStep(1)} disabled={submitting} className="inline-flex min-h-12 items-center gap-1 rounded-xl border px-4 text-sm font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Back</button><button disabled={!paymentReady || submitting} onClick={submit} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-40">{submitting ? "Saving payment…" : <>Send payment to Accounts <ArrowRight className="h-4 w-4" /></>}</button></div></section>}
  </div>;
}

function Choice({ active, title, text, onClick }: { active: boolean; title: string; text: string; onClick: () => void }) { return <button onClick={onClick} className={`rounded-3xl border p-5 text-left ${active ? "border-primary bg-primary/10" : "bg-card hover:border-primary/35"}`}><p className="font-extrabold">{title}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p></button>; }
function FormCard({ icon, title, hint, children }: { icon: React.ReactNode; title: string; hint: string; children: React.ReactNode }) { return <article className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary">{icon}</span><div><h2 className="font-extrabold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{hint}</p></div></div><div className="mt-5">{children}</div></article>; }
function Field({ label, value, onChange, placeholder, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string }) { return <label className="block text-sm font-bold">{label}{required && <span className="ml-1 text-primary">*</span>}<input type={type} min={type === "number" ? 0 : undefined} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 min-h-12 w-full rounded-xl border bg-background px-3 text-sm font-medium placeholder:font-normal placeholder:text-muted-foreground" /></label>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="block text-sm font-bold">{label}<select value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5 min-h-12 w-full rounded-xl border bg-background px-3 text-sm font-medium">{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
