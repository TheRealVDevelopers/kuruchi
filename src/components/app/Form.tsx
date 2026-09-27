import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Shared form primitives so every add/edit screen looks and behaves the same. */

export function Field({
  id, label, value, onChange, placeholder, required, type = "text", hint,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NumField({
  id, label, value, onChange, required, hint,
}: {
  id: string; label: string; value: number; onChange: (v: number) => void;
  required?: boolean; hint?: string;
}) {
  return (
    <Field
      id={id} label={label} required={required} hint={hint}
      value={String(value)}
      type="number"
      onChange={(v) => onChange(Number(v.replace(/[^0-9.]/g, "")) || 0)}
    />
  );
}

export function SelectField({
  id, label, value, onChange, options, required,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>; required?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-1 text-primary">*</span>}
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

export function TextArea({
  id, label, value, onChange, rows = 3, placeholder,
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  rows?: number; placeholder?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </label>
      <textarea
        id={id}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}

/** A panel that slides open above a list for adding or editing a record. */
export function EditPanel({
  title, onSubmit, onCancel, onDelete, children, submitLabel = "Save",
}: {
  title: string;
  onSubmit: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  children: ReactNode;
  submitLabel?: string;
}) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="mb-5 rounded-lg border-2 border-primary/30 bg-card p-4"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-bold">{title}</h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Close"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {children}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
        >
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-md border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

export function AddButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90",
        className
      )}
    >
      {label}
    </button>
  );
}
