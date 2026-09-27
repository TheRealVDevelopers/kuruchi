import { useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Camera, Check, CheckCircle2, CircleAlert, PackageCheck, PackageX, Phone, QrCode, Truck, Wrench } from "lucide-react";
import { useAuth } from "@/features/auth/AuthContext";
import { repo } from "@/data/repo";
import { useDb } from "@/data/store";
import * as act from "@/data/actions";
import { useAction, formatDate } from "@/lib/useAction";
import { EmptyState } from "@/components/app/Shell";
import { RuleGate } from "@/components/app/RuleGate";
import {
  BigButton, OfflineBanner, PhotoCapture, ReceiveChoice,
} from "@/components/app/SiteKit";
import { canMarkInstalled, canRaiseHandover, canSubmitTicket, defaultCause } from "@/lib/rules";
import { projectProgress } from "@/lib/statuses";
import { cn } from "@/lib/utils";
import type { SiteWorkStatus, SnagSeverity, TicketCause } from "@/types";

const TABS = ["receive", "install", "snags", "incoming"] as const;
type Tab = (typeof TABS)[number];

const TAB_META: Record<Tab, { label: string; hint: string; Icon: typeof PackageCheck }> = {
  receive: { label: "Receive", hint: "Check crates", Icon: PackageCheck },
  install: { label: "Install", hint: "Fit items", Icon: Wrench },
  snags: { label: "Issues", hint: "Report a problem", Icon: CircleAlert },
  incoming: { label: "Delivery", hint: "See what is coming", Icon: Truck },
};

export default function SiteProjectPage() {
  useDb();
  const { projectId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const run = useAction();
  const [tab, setTab] = useState<Tab>("receive");
  const [scanCode, setScanCode] = useState("");
  const [selectedCrateId, setSelectedCrateId] = useState<string | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  useEffect(() => {
    const requested = searchParams.get("tab");
    if (requested && TABS.includes(requested as Tab)) setTab(requested as Tab);
  }, [searchParams]);

  const project = repo.projectById(user, projectId);
  if (!project || !user) {
    return <EmptyState title="Site not found" hint="This project is assigned to another crew." />;
  }

  // AC-03 — the site app never receives pricing at all.
  const items = repo.items(project.id, user.role);
  const rawItems = repo.itemsRaw(project.id);
  const consignments = repo.consignments(project.id);
  const crates = repo.crates(project.id);
  const tickets = repo.tickets(project.id);
  const snags = repo.snags(project.id);

  const unreceived = crates.filter((c) => !c.receivedAt);
  const toInstall = items.filter((i) => i.status === "RECEIVED_OK" || i.status === "INSTALL_ASSIGNED");
  const inProgress = items.filter((i) => i.status === "INSTALL_IN_PROGRESS");
  const openSnags = snags.filter((s) => s.status === "OPEN");
  const blocked = items.filter((i) => i.status === "RECEIVED_DAMAGED" || i.status === "SHORT_SUPPLIED");
  const completedItems = items.filter((i) => i.status === "INSTALLED" || i.status === "HANDED_OVER");
  const itemsToWork = items.filter((i) => !["INSTALLED", "HANDED_OVER"].includes(i.status));

  // One instruction, chosen by what is actually most urgent right now.
  const nextUp = (() => {
    if (unreceived.length) return {
      eyebrow: "Do this first",
      title: `Check in ${unreceived.length} crate${unreceived.length === 1 ? "" : "s"}`,
      detail: "Scan or tap each crate and confirm what arrived. Anything short raises a ticket automatically.",
      go: "receive" as Tab,
      cta: "Start receiving",
    };
    if (blocked.length) return {
      eyebrow: "Waiting on Kurchi",
      title: `${blocked.length} item${blocked.length === 1 ? "" : "s"} blocked`,
      detail: "Admin is deciding on a replacement. You cannot install these yet — rule ST-03.",
      go: "install" as Tab,
      cta: "See which",
    };
    if (inProgress.length) return {
      eyebrow: "In progress",
      title: `Finish ${inProgress.length} item${inProgress.length === 1 ? "" : "s"}`,
      detail: "Mark each one installed as you go.",
      go: "install" as Tab,
      cta: "Open the checklist",
    };
    if (toInstall.length) return {
      eyebrow: "Ready to fit",
      title: `${toInstall.length} item${toInstall.length === 1 ? "" : "s"} ready to install`,
      detail: "Everything received and clear to fit.",
      go: "install" as Tab,
      cta: "Start installing",
    };
    if (openSnags.length) return {
      eyebrow: "Nearly there",
      title: `Close ${openSnags.length} snag${openSnags.length === 1 ? "" : "s"}`,
      detail: "Handover is blocked until the major ones are cleared.",
      go: "snags" as Tab,
      cta: "Open snags",
    };
    return {
      eyebrow: "All clear",
      title: "Everything on this site is done",
      detail: "Request handover when you are ready for the client to sign.",
      go: "snags" as Tab,
      cta: "Request handover",
    };
  })();

  return (
    <>
      <Link to="/site" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> My sites
      </Link>

      <OfflineBanner />

      {/* A compact field header — the work should be the first thing the crew sees. */}
      <header className="mb-3">
        <p className="eyebrow">{project.code}</p>
        <h1 className="mt-1 text-2xl">{project.site.city}</h1>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{project.site.address}</p>
      </header>

      <a
        href={`tel:${project.site.contactPhone}`}
        className="mb-3 flex min-h-[2.75rem] items-center gap-2.5 rounded-xl border bg-card px-3 font-bold"
      >
        <Phone className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0">
          <span className="block truncate text-sm">{project.site.contactName}</span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {project.site.contactPhone}
          </span>
        </span>
      </a>

      <div className="mb-4 flex items-center justify-between rounded-2xl border bg-card px-4 py-3">
        <div><p className="eyebrow">Today</p><p className="mt-1 text-sm font-bold">{itemsToWork.length} item{itemsToWork.length === 1 ? "" : "s"} need attention</p></div>
        <div className="text-right"><p className="text-2xl font-extrabold text-primary">{projectProgress(rawItems.map((i) => i.status))}%</p><p className="text-xs text-muted-foreground">complete</p></div>
      </div>

      <SiteStatusCheckIn
        value={project.siteWorkStatus ?? "NOT_STARTED"}
        onChange={(status) => run(
          () => act.updateSiteWorkStatus(user, project.id, status),
          "Site update saved",
          "Your Admin can now see the latest site situation."
        )}
      />

      {/* Big, plain-language work choices — designed for a phone, not a spreadsheet. */}
      <nav className="mb-5 grid grid-cols-2 gap-2.5">
        {TABS.map((t) => {
          const badge =
            t === "receive" ? unreceived.length
            : t === "install" ? toInstall.length + inProgress.length
            : t === "snags" ? openSnags.length
            : consignments.filter((c) => !c.deliveredAt).length;
          const { Icon, label, hint } = TAB_META[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={cn(
                "relative flex min-h-[6.5rem] flex-col items-start justify-end rounded-2xl border-2 p-3.5 text-left transition-colors",
                tab === t ? "border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <Icon className="mb-auto h-6 w-6" />
              <span className="text-base font-extrabold">{label}</span>
              <span className={cn("mt-0.5 text-xs font-medium", tab === t ? "text-primary-foreground/80" : "text-muted-foreground")}>{hint}</span>
              {badge > 0 && (
                <span className={cn(
                  "absolute right-3 top-3 grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-xs tabular-nums",
                  tab === t ? "bg-white/25" : "bg-primary/10 text-primary"
                )}>
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* ------------------------------------------------------- receive */}
      {tab === "receive" && (
        <div className="space-y-4">
          <form onSubmit={(event) => { event.preventDefault(); let code = scanCode.trim(); try { const parsed = JSON.parse(code) as { crateId?: string; code?: string }; code = parsed.crateId ?? parsed.code ?? code; } catch { /* Barcode scanners may submit plain text. */ } const crate = crates.find((entry) => entry.id === code || entry.crateCode.toLowerCase() === code.toLowerCase()); if (crate) { setSelectedCrateId(crate.id); setScanCode(""); } }} className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4"><div className="flex items-center gap-2"><QrCode className="h-5 w-5 text-primary"/><div><p className="font-bold">Scan a crate label</p><p className="text-xs text-muted-foreground">Use a phone or handheld scanner, or paste the QR value.</p></div></div><div className="mt-3 flex gap-2"><input value={scanCode} onChange={(event) => setScanCode(event.target.value)} placeholder="Scan or enter crate code" className="min-h-[3rem] min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm font-semibold"/><button className="rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">Open</button></div></form>
          <CameraQrScanner onCode={(code) => { let value = code; try { const parsed = JSON.parse(code) as { crateId?: string; code?: string }; value = parsed.crateId ?? parsed.code ?? code; } catch { /* Raw crate code is valid. */ } const crate = crates.find((entry) => entry.id === value || entry.crateCode.toLowerCase() === value.toLowerCase()); if (crate) setSelectedCrateId(crate.id); }} />
          {selectedCrateId && <button type="button" onClick={() => setSelectedCrateId(null)} className="text-sm font-bold text-primary">← Show every crate</button>}
          {crates.filter((cr) => !selectedCrateId || cr.id === selectedCrateId).map((cr) => (
            <CrateCard
              key={cr.id}
              code={cr.crateCode}
              receivedAt={cr.receivedAt}
              rows={cr.itemIds
                .map((id) => items.find((i) => i.id === id))
                .filter(Boolean)
                .map((i) => ({
                  id: i!.id,
                  name: i!.name,
                  expected: i!.qtyDispatched || i!.qty,
                  status: i!.status,
                }))}
              onConfirm={(received) =>
                run(
                  () => act.receiveCrate(user, cr.id, received),
                  `${cr.crateCode} checked in`,
                  "Anything short raised a ticket automatically."
                )
              }
            />
          ))}
          {crates.length === 0 && <EmptyState title="No crates at this site yet" />}

          <ReportDamage
            items={items.map((i) => ({ id: i.id, name: i.name }))}
            onSubmit={(v) =>
              run(
                () => act.fileTicket(user, {
                  projectId: project.id, itemId: v.itemId, type: "DAMAGE",
                  qtyAffected: v.qty, cause: v.cause, photos: v.photos, note: v.note,
                }),
                "Report sent",
                "Kurchi has been notified."
              )
            }
          />
        </div>
      )}

      {/* ------------------------------------------------------- install */}
      {tab === "install" && (
        <div className="grid gap-3 sm:grid-cols-2">
          {itemsToWork.map((item) => {
            const raw = rawItems.find((r) => r.id === item.id)!;
            const verdict = canMarkInstalled(raw, tickets);
            const done = item.status === "INSTALLED" || item.status === "HANDED_OVER";
            const isBlocked = item.status === "RECEIVED_DAMAGED" || item.status === "SHORT_SUPPLIED";

            return (
              <article
                key={item.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border-2 bg-card p-4",
                  done && "border-emerald-200 bg-emerald-50/40",
                  isBlocked && "border-primary/30 bg-primary/5"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-lg font-extrabold", done ? "bg-emerald-600 text-white" : isBlocked ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary")}>
                    {done ? <Check className="h-6 w-6" /> : item.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold leading-snug">{item.name}</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {item.zone ?? "unzoned"} · {item.qtyInstalled} of {item.qty} fitted
                    </p>
                  </div>
                </div>

                {isBlocked && (
                  <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-primary">
                    <PackageX className="mt-0.5 h-4 w-4 shrink-0" />
                    Waiting for replacement or Admin confirmation.
                  </p>
                )}

                {!done && !isBlocked && (
                  <div className="mt-3.5">
                    {item.status === "RECEIVED_OK" && (
                      <BigButton onClick={() => run(() => act.setItemStatus(user, item.id, "INSTALL_ASSIGNED"), "Item ready for fitting")}>
                        Ready to fit ✓
                      </BigButton>
                    )}
                    {item.status === "INSTALL_ASSIGNED" && (
                      <BigButton onClick={() => run(() => act.setItemStatus(user, item.id, "INSTALL_IN_PROGRESS"), "Started")}>
                        Start fitting
                      </BigButton>
                    )}
                    {item.status === "INSTALL_IN_PROGRESS" && (
                      <RuleGate verdict={verdict}>
                        <BigButton
                          tone="good"
                          icon={<Check className="h-5 w-5" />}
                          onClick={() => run(() => act.setItemStatus(user, item.id, "INSTALLED"), `${item.name} done`)}
                        >
                          Fitting complete ✓
                        </BigButton>
                      </RuleGate>
                    )}
                  </div>
                )}
              </article>
            );
          })}

          {itemsToWork.length === 0 && <div className="col-span-full rounded-2xl border border-emerald-300 bg-emerald-50 p-5 text-center text-emerald-900"><CheckCircle2 className="mx-auto h-8 w-8"/><p className="mt-2 font-extrabold">All items are fitted</p><p className="mt-1 text-sm">You are ready to check issues and request handover.</p></div>}

          {completedItems.length > 0 && <section className="col-span-full rounded-2xl border bg-card p-3"><button type="button" onClick={() => setShowCompleted((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left"><span className="inline-flex items-center gap-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5"/>{completedItems.length} item{completedItems.length === 1 ? "" : "s"} already fitted</span><span className="text-xs font-bold text-muted-foreground">{showCompleted ? "Hide" : "View"}</span></button>{showCompleted && <div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2">{completedItems.map((item) => <div key={item.id} className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900"><Check className="h-4 w-4 shrink-0"/><span className="truncate font-semibold">{item.name}</span></div>)}</div>}</section>}

          <div className="col-span-full"><DailyProgress onSubmit={(note, photos) => run(() => act.addProgressLog(user, project.id, note, photos), "Update posted")} /></div>
        </div>
      )}

      {/* --------------------------------------------------------- snags */}
      {tab === "snags" && (
        <div className="space-y-4">
          <RaiseSnag
            onSubmit={(v) =>
              run(
                () => act.raiseSnag(user, { projectId: project.id, ...v }),
                "Snag raised",
                v.severity !== "MINOR" ? "This now blocks handover." : undefined
              )
            }
          />

          {snags.map((s) => (
            <article key={s.id} className="rounded-xl border bg-card p-4">
              <p className="text-sm leading-snug">{s.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <span className={cn(
                  "rounded-full border px-2 py-0.5 font-bold",
                  s.severity === "CRITICAL" && "border-primary bg-primary/10 text-primary",
                  s.severity === "MAJOR" && "border-amber-400 bg-amber-50 text-amber-900",
                  s.severity === "MINOR" && "border-border bg-muted text-muted-foreground"
                )}>
                  {s.severity.toLowerCase()}
                </span>
                <span className="text-muted-foreground">{s.raisedBy} · {formatDate(s.raisedAt)}</span>
              </div>
              {s.status === "OPEN" ? (
                <div className="mt-3.5">
                  <BigButton tone="good" icon={<Check className="h-5 w-5" />}
                    onClick={() => run(() => act.closeSnag(user, s.id), "Snag closed")}>
                    Fixed
                  </BigButton>
                </div>
              ) : (
                <p className="mt-2 text-xs font-bold text-emerald-700">
                  Closed {formatDate(s.closedAt)}
                </p>
              )}
            </article>
          ))}

          <section className="rounded-xl border bg-card p-4">
            <h3 className="font-bold">Hand over to the client</h3>
            <p className="mb-3.5 mt-1 text-sm text-muted-foreground">
              Everything fitted and snag-free? Send it to Ola to sign.
            </p>
            <RuleGate verdict={canRaiseHandover(rawItems, snags)}>
              <BigButton tone="primary"
                onClick={() => run(() => act.requestHandover(user, project.id), "Sent to the client")}>
                Request handover
              </BigButton>
            </RuleGate>
          </section>
        </div>
      )}

      {/* ------------------------------------------------------ incoming */}
      {tab === "incoming" && (
        <div className="space-y-3">
          {consignments.map((c) => (
            <article key={c.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{c.lrNumber || "LR pending"}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {c.crateIds.length} crate{c.crateIds.length === 1 ? "" : "s"} ·{" "}
                    {c.transporterName || "transporter TBC"}
                    {c.vehicleNo ? ` · ${c.vehicleNo}` : ""}
                  </p>
                  <p className="mt-1.5 text-sm font-bold">
                    {c.deliveredAt ? (
                      <span className="text-emerald-700">Delivered {formatDate(c.deliveredAt)}</span>
                    ) : c.eta ? `Arriving ${formatDate(c.eta)}` : (
                      <span className="text-muted-foreground">Not dispatched yet</span>
                    )}
                  </p>
                </div>
              </div>
              {c.driverPhone && !c.deliveredAt && (
                <a href={`tel:${c.driverPhone}`} className="mt-3 block">
                  <BigButton icon={<Phone className="h-4 w-4" />}>Call the driver</BigButton>
                </a>
              )}
            </article>
          ))}
          {consignments.length === 0 && <EmptyState title="Nothing on the way yet" />}
        </div>
      )}
    </>
  );
}

function CameraQrScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const [active, setActive] = useState(false);
  const [supported] = useState(() => "BarcodeDetector" in window);
  const [error, setError] = useState("");

  function stop() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null; timerRef.current = null; setActive(false);
  }

  useEffect(() => () => stop(), []);

  async function start() {
    if (!supported) { setError("Camera QR scanning is not available in this browser. Use the code field above."); return; }
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setActive(true);
      const Detector = (window as typeof window & { BarcodeDetector: new (options?: { formats?: string[] }) => { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> } }).BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code"] });
      timerRef.current = window.setInterval(async () => { if (!videoRef.current) return; const results = await detector.detect(videoRef.current); if (results[0]?.rawValue) { onCode(results[0].rawValue); stop(); } }, 500);
    } catch { setError("We could not open the camera. Check browser camera permission, then try again."); stop(); }
  }

  return <section className="rounded-xl border bg-card p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Camera className="h-4 w-4 text-primary" /><p className="text-sm font-bold">Use phone camera</p></div><button type="button" onClick={active ? stop : start} className="rounded-lg border px-3 py-2 text-sm font-bold hover:bg-muted">{active ? "Stop camera" : "Open camera scanner"}</button></div>{active && <video ref={videoRef} muted playsInline className="mt-3 aspect-video w-full rounded-lg bg-black object-cover" />}{error && <p className="mt-2 text-xs text-muted-foreground">{error}</p>}</section>;
}

/* --------------------------------------------------------------- pieces */

function CrateCard({
  code, receivedAt, rows, onConfirm,
}: {
  code: string;
  receivedAt?: string;
  rows: Array<{ id: string; name: string; expected: number; status: string }>;
  onConfirm: (received: Record<string, number>) => boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, "OK" | "SHORT" | "DAMAGED" | null>>({});
  const [shortQty, setShortQty] = useState<Record<string, number>>({});

  if (receivedAt) {
    return (
      <article className="rounded-xl border-2 border-emerald-200 bg-emerald-50/50 p-4">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold">{code}</p>
          <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700">
            <Check className="h-4 w-4" /> Checked in {formatDate(receivedAt)}
          </span>
        </div>
      </article>
    );
  }

  const allAnswered = rows.every((r) => answers[r.id]);

  return (
    <article className="rounded-xl border-2 bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-lg font-extrabold">{code}</p>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <QrCode className="h-4 w-4" /> {rows.length} item{rows.length === 1 ? "" : "s"}
        </span>
      </div>

      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.id}>
            <p className="font-bold leading-snug">{r.name}</p>
            <p className="mb-2 text-sm text-muted-foreground">{r.expected} sent</p>
            <ReceiveChoice
              value={answers[r.id] ?? null}
              onChange={(v) => {
                setAnswers({ ...answers, [r.id]: v });
                if (v !== "SHORT") setShortQty({ ...shortQty, [r.id]: r.expected });
              }}
            />
            {answers[r.id] === "SHORT" && (
              <div className="mt-2 flex items-center gap-2 rounded-lg border bg-muted/40 p-2.5">
                <label htmlFor={`sq-${r.id}`} className="text-sm font-semibold">
                  How many arrived?
                </label>
                <input
                  id={`sq-${r.id}`}
                  type="number"
                  min={0}
                  max={r.expected}
                  value={shortQty[r.id] ?? r.expected - 1}
                  onChange={(e) => setShortQty({ ...shortQty, [r.id]: Number(e.target.value) })}
                  className="ml-auto w-20 rounded-lg border bg-background px-2 py-2 text-center text-base font-bold tabular-nums"
                />
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <BigButton
          tone="good"
          disabled={!allAnswered}
          icon={<Check className="h-5 w-5" />}
          onClick={() => {
            const received: Record<string, number> = {};
            rows.forEach((r) => {
              const a = answers[r.id];
              received[r.id] = a === "SHORT" ? (shortQty[r.id] ?? r.expected - 1) : r.expected;
            });
            if (onConfirm(received)) setAnswers({});
          }}
        >
          {allAnswered ? "Confirm receipt" : "Answer every item"}
        </BigButton>
      </div>
    </article>
  );
}

function ReportDamage({
  items, onSubmit,
}: {
  items: Array<{ id: string; name: string }>;
  onSubmit: (v: { itemId: string; qty: number; cause: TicketCause; photos: string[]; note: string }) => boolean;
}) {
  const [open, setOpen] = useState(false);
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [qty, setQty] = useState(1);
  const [cause, setCause] = useState<TicketCause>(defaultCause(undefined));
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  if (!open) {
    return (
      <BigButton tone="stop" icon={<PackageX className="h-5 w-5" />} onClick={() => setOpen(true)}>
        Report damage
      </BigButton>
    );
  }

  const verdict = canSubmitTicket({ photos, cause });

  return (
    <section className="rounded-xl border-2 border-primary/30 bg-card p-4">
      <h3 className="text-lg">Report damage</h3>
      <p className="mb-4 mt-1 text-sm text-muted-foreground">
        A photo and a cause are required — without them the claim cannot be settled later.
      </p>

      <div className="space-y-3">
        <div>
          <label htmlFor="rd-item" className="eyebrow mb-1 block">Which item</label>
          <select id="rd-item" value={itemId} onChange={(e) => setItemId(e.target.value)}
            className="min-h-[3.25rem] w-full rounded-xl border-2 bg-background px-3 text-base font-semibold">
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="rd-qty" className="eyebrow mb-1 block">How many</label>
            <input id="rd-qty" type="number" min={1} value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="min-h-[3.25rem] w-full rounded-xl border-2 bg-background px-3 text-center text-base font-bold tabular-nums" />
          </div>
          <div>
            <label htmlFor="rd-cause" className="eyebrow mb-1 block">Cause</label>
            <select id="rd-cause" value={cause} onChange={(e) => setCause(e.target.value as TicketCause)}
              className="min-h-[3.25rem] w-full rounded-xl border-2 bg-background px-2 text-sm font-semibold">
              <option value="TRANSIT">In transit</option>
              <option value="MANUFACTURING">Made wrong</option>
              <option value="HANDLING_AT_SITE">Damaged at site</option>
              <option value="SHORT_SUPPLY">Never arrived</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="rd-note" className="eyebrow mb-1 block">What happened</label>
          <textarea id="rd-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Leg cracked at the weld, crate corner crushed."
            className="w-full resize-y rounded-xl border-2 bg-background px-3 py-2.5 text-base" />
        </div>

        <PhotoCapture
          photos={photos}
          required
          label="Photograph the damage"
          onAdd={(photo) => setPhotos((p) => [...p, photo ?? `damage-${p.length + 1}.jpg`])}
          onRemove={(i) => setPhotos((p) => p.filter((_, x) => x !== i))}
        />

        <RuleGate verdict={verdict}>
          <BigButton
            tone="primary"
            onClick={() => {
              if (onSubmit({ itemId, qty, cause, photos, note })) {
                setPhotos([]); setNote(""); setQty(1); setOpen(false);
              }
            }}
          >
            Send report
          </BigButton>
        </RuleGate>

        <BigButton onClick={() => setOpen(false)}>Cancel</BigButton>
      </div>
    </section>
  );
}

function SiteStatusCheckIn({ value, onChange }: { value: SiteWorkStatus; onChange: (status: SiteWorkStatus) => void }) {
  const choices: Array<{ value: SiteWorkStatus; label: string; hint: string }> = [
    { value: "WORK_STARTED", label: "Started", hint: "Crew has begun" },
    { value: "WORK_IN_PROGRESS", label: "In progress", hint: "Work is happening" },
    { value: "WAITING", label: "Waiting", hint: "Need help or material" },
    { value: "READY_FOR_HANDOVER", label: "Ready", hint: "Ready for handover" },
  ];

  return (
    <section className="mb-4 rounded-2xl border bg-card p-3.5">
      <p className="eyebrow">Quick site update</p>
      <h2 className="mt-1 text-base font-extrabold">What is happening at site?</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Tap one option. Your Admin will see it immediately.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              onClick={() => onChange(choice.value)}
              aria-pressed={selected}
              className={cn(
                "min-h-[4.5rem] rounded-xl border-2 px-3 text-left transition-colors",
                selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:bg-muted/60"
              )}
            >
              <span className="block text-sm font-extrabold">{selected && <Check className="mr-1 inline h-4 w-4" />}{choice.label}</span>
              <span className={cn("mt-0.5 block text-[11px] font-medium", selected ? "text-primary-foreground/80" : "text-muted-foreground")}>{choice.hint}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function DailyProgress({ onSubmit }: { onSubmit: (note: string, photos: string[]) => boolean }) {
  const [note, setNote] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);

  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="font-bold">Today's progress</h3>
      <p className="mb-3 mt-0.5 text-sm text-muted-foreground">
        The client sees this. One photo minimum — rule IN-02.
      </p>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Consultation zone complete, counter fitted."
        aria-label="Progress note"
        className="mb-3 w-full resize-y rounded-xl border-2 bg-background px-3 py-2.5 text-base"
      />
      <PhotoCapture
        photos={photos}
        required
        label="Photograph the work"
        onAdd={(photo) => setPhotos((p) => [...p, photo ?? `site-${p.length + 1}.jpg`])}
        onRemove={(i) => setPhotos((p) => p.filter((_, x) => x !== i))}
      />
      <div className="mt-3">
        <BigButton
          tone="primary"
          disabled={!note.trim() || !photos.length}
          onClick={() => { if (onSubmit(note, photos)) { setNote(""); setPhotos([]); } }}
        >
          Post update
        </BigButton>
      </div>
    </section>
  );
}

function RaiseSnag({
  onSubmit,
}: { onSubmit: (v: { description: string; severity: SnagSeverity; photos: string[] }) => boolean }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<SnagSeverity>("MINOR");
  const [photos, setPhotos] = useState<string[]>([]);

  if (!open) {
    return <BigButton onClick={() => setOpen(true)}>Raise a snag</BigButton>;
  }

  return (
    <section className="rounded-xl border-2 border-primary/30 bg-card p-4">
      <h3 className="mb-3 text-lg">Raise a snag</h3>
      <textarea
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Counter laminate edge lifting."
        aria-label="Snag description"
        className="mb-3 w-full resize-y rounded-xl border-2 bg-background px-3 py-2.5 text-base"
      />
      <div className="mb-3 grid grid-cols-3 gap-2">
        {(["MINOR", "MAJOR", "CRITICAL"] as SnagSeverity[]).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setSeverity(s)}
            aria-pressed={severity === s}
            className={cn(
              "min-h-[3rem] rounded-xl border-2 text-xs font-bold capitalize",
              severity === s ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"
            )}
          >
            {s.toLowerCase()}
          </button>
        ))}
      </div>
      <PhotoCapture
        photos={photos}
        required
        label="Photograph it"
        onAdd={(photo) => setPhotos((p) => [...p, photo ?? `snag-${p.length + 1}.jpg`])}
        onRemove={(i) => setPhotos((p) => p.filter((_, x) => x !== i))}
      />
      <div className="mt-3 space-y-2">
        <BigButton
          tone="primary"
          disabled={!description.trim() || !photos.length}
          onClick={() => {
            if (onSubmit({ description, severity, photos })) {
              setDescription(""); setPhotos([]); setSeverity("MINOR"); setOpen(false);
            }
          }}
        >
          Raise snag
        </BigButton>
        <BigButton onClick={() => setOpen(false)}>Cancel</BigButton>
      </div>
    </section>
  );
}
