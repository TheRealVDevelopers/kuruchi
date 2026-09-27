import { useState, type FormEvent } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import * as act from "@/data/actions";

const FIELDS = [
  { id: "name", label: "Your name", type: "text", required: true },
  { id: "company", label: "Company", type: "text", required: true },
  { id: "phone", label: "Phone", type: "tel", required: true },
  { id: "city", label: "City", type: "text", required: false },
] as const;

export default function Contact() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    act.addEnquiry({
      name: String(fd.get("name") ?? ""),
      company: String(fd.get("company") ?? ""),
      phone: String(fd.get("phone") ?? ""),
      city: String(fd.get("city") ?? ""),
      message: String(fd.get("message") ?? ""),
    });
    setSent(true);
    toast.success("Enquiry received", {
      description: "We'll come back to you within one working day.",
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
        Contact
      </p>
      <h1 className="text-3xl font-semibold tracking-tight">Tell us about the project</h1>
      <p className="mt-2 text-muted-foreground">
        How many sites, which cities, and when do they open? That is usually enough for us
        to come back with a sensible first answer.
      </p>

      {sent ? (
        <div className="mt-8 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-medium text-red-900">Thanks — that's with us.</p>
            <p className="mt-1 text-sm text-red-800">
              We'll call the number you left within one working day.
            </p>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.id}>
                <label htmlFor={f.id} className="mb-1.5 block text-sm font-medium">
                  {f.label}
                  {!f.required && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      optional
                    </span>
                  )}
                </label>
                <input
                  id={f.id}
                  name={f.id}
                  type={f.type}
                  required={f.required}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            ))}
          </div>

          <div>
            <label htmlFor="message" className="mb-1.5 block text-sm font-medium">
              What do you need?
            </label>
            <textarea
              id="message"
              name="message"
              rows={5}
              required
              placeholder="e.g. 18 showrooms across south India, opening between January and June."
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            className="rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Send enquiry
          </button>
        </form>
      )}
    </div>
  );
}
