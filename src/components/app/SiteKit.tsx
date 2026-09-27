import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Camera, Check, CloudOff, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Controls built for a phone held in one hand on a half-built site.
 *
 * Everything here is sized for a thumb and readable in bad light: 56px minimum
 * targets, high-contrast states, and no control that needs two hands or precise
 * aim. The desktop screens can afford dropdowns and tables; this cannot.
 */

/** Minimum comfortable thumb target. Used everywhere in the site app. */
const TAP = "min-h-[3.5rem]";

export function BigButton({
  children, onClick, tone = "default", disabled, type = "button", icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  tone?: "default" | "primary" | "good" | "stop";
  disabled?: boolean;
  type?: "button" | "submit";
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        TAP,
        "flex w-full items-center justify-center gap-2 rounded-xl border-2 px-4 text-base font-bold transition-colors active:scale-[0.99] disabled:opacity-40",
        tone === "default" && "border-border bg-card hover:bg-muted",
        tone === "primary" && "border-primary bg-primary text-primary-foreground",
        tone === "good" && "border-emerald-600 bg-emerald-600 text-white",
        tone === "stop" && "border-primary bg-card text-primary"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Three-way receipt answer. Tap, don't type — typing a number into a small box
 * with one thumb is the step people skip, and a skipped GRN is how a shortage
 * goes unnoticed for a week.
 */
export function ReceiveChoice({
  value, onChange,
}: {
  value: "OK" | "SHORT" | "DAMAGED" | null;
  onChange: (v: "OK" | "SHORT" | "DAMAGED") => void;
}) {
  const options = [
    { id: "OK" as const, label: "All arrived", tone: "emerald" },
    { id: "SHORT" as const, label: "Some missing", tone: "amber" },
    { id: "DAMAGED" as const, label: "Damaged", tone: "red" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            aria-pressed={active}
            className={cn(
              TAP,
              "flex flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-xs font-bold leading-tight transition-colors",
              !active && "border-border bg-card text-muted-foreground",
              active && o.tone === "emerald" && "border-emerald-600 bg-emerald-50 text-emerald-800",
              active && o.tone === "amber" && "border-amber-500 bg-amber-50 text-amber-900",
              active && o.tone === "red" && "border-primary bg-primary/5 text-primary"
            )}
          >
            {active && <Check className="h-4 w-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Camera-first photo capture with a thumbnail strip.
 *
 * Photos are mandatory on damage reports and progress updates (ST-02, IN-02),
 * so the control that adds one is the biggest thing on the card, not a small
 * link under a text box.
 */
export function PhotoCapture({
  photos, onAdd, onRemove, label = "Take a photo", required,
}: {
  photos: string[];
  /** Receives a local image URL. Existing demo callers may ignore it. */
  onAdd: (photo?: string) => void;
  onRemove?: (i: number) => void;
  label?: string;
  required?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  function choosePhoto() {
    inputRef.current?.click();
  }

  function capturePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Cancelling the camera / picker is a normal path on site.
    if (!file) return;

    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onAdd(typeof reader.result === "string" ? reader.result : undefined);
      setReading(false);
    };
    reader.onerror = () => {
      // Still allow the workflow to continue in a browser that blocks file reads.
      onAdd();
      setReading(false);
    };
    reader.readAsDataURL(file);
    // Selecting the same image twice should still fire a change event.
    event.target.value = "";
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={capturePhoto}
        className="sr-only"
        aria-label={label}
      />
      <button
        type="button"
        onClick={choosePhoto}
        className={cn(
          "flex w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed py-6 transition-colors",
          photos.length === 0 && required
            ? "border-primary/50 bg-primary/5 text-primary"
            : "border-border bg-card text-muted-foreground hover:bg-muted"
        )}
      >
        <Camera className="h-7 w-7" />
        <span className="text-sm font-bold">{reading ? "Adding photo…" : label}</span>
        {photos.length === 0 && required && (
          <span className="text-xs font-semibold">Required</span>
        )}
      </button>

      {photos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <li
              key={`${p}-${i}`}
              className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-lg border bg-muted text-[10px] text-muted-foreground"
            >
              {p.startsWith("data:image/") ? (
                <img src={p} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-5 w-5" />
              )}
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full border bg-card shadow-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A compact camera control for packing and dispatch tables. */
export function InlinePhotoCapture({
  label = "Add photo", onAdd,
}: {
  label?: string;
  onAdd: (photo?: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);

  function capturePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      onAdd(typeof reader.result === "string" ? reader.result : undefined);
      setReading(false);
    };
    reader.onerror = () => { onAdd(); setReading(false); };
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={capturePhoto} className="sr-only" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-xs font-semibold hover:bg-muted"
      >
        <Camera className="h-3.5 w-3.5" /> {reading ? "Adding…" : label}
      </button>
    </>
  );
}

/** A single prominent instruction — what to do next, not a list of options. */
export function NextUp({
  eyebrow, title, detail, action,
}: {
  eyebrow: string;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-xl border-2 border-primary/25 bg-primary/5 p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{eyebrow}</p>
      <h2 className="mt-1.5 text-lg leading-snug">{title}</h2>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      {action && <div className="mt-3.5">{action}</div>}
    </section>
  );
}

/** Site connectivity is genuinely unreliable — say so rather than failing silently. */
export function OfflineBanner() {
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine
  );

  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  if (online) return null;

  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-xl border-2 border-amber-400 bg-amber-50 p-3.5 text-sm text-amber-900">
      <CloudOff className="mt-0.5 h-5 w-5 shrink-0" />
      <span>
        <strong className="block font-bold">No signal</strong>
        Keep working — updates are held on this phone and sent when you are back online.
      </span>
    </div>
  );
}
