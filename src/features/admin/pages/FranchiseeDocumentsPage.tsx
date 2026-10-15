import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Check, Pencil, ShieldCheck, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/AuthContext";
import { PageHeader } from "@/components/app/Shell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DocumentFile } from "@/features/franchisee-documents/DocumentFile";
import { removeSharedDocument, renameSharedDocument, uploadSharedDocument } from "@/features/franchisee-documents/library";
import { DOCUMENT_ACCEPT, documentSize, isSharedCategory, SHARED_DOCUMENT_CATEGORIES, validateLibraryFile, type SharedDocumentCategory, type SharedFranchiseeDocument } from "@/features/franchisee-documents/model";
import { useSharedDocuments } from "@/features/franchisee-documents/useSharedDocuments";
import type { AppUser } from "@/types";

function message(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code?.includes("permission") || code?.includes("unauthorized")) return "Sign out and sign in again, then retry. Your account must have Admin access.";
  return !code && error instanceof Error ? error.message : "The document could not be saved. Check your connection and retry.";
}

export default function FranchiseeDocumentsPage() {
  const { user } = useAuth();
  const library = useSharedDocuments();
  const [category, setCategory] = useState<SharedDocumentCategory>("KURCHI_KYC");
  const [uploading, setUploading] = useState(false);
  if (user?.role !== "ADMIN") return null;

  return <div className="mx-auto max-w-5xl">
    <PageHeader eyebrow="Franchisee workspace" title="Franchisee documents" description="Upload named Kurchi KYC documents and instruction manuals. These two collections are shared with every franchisee."/>
    <Tabs value={category} onValueChange={(value) => { if (!uploading && isSharedCategory(value)) setCategory(value); }}>
      <TabsList className="mb-5 grid h-auto w-full grid-cols-1 gap-1 p-1 sm:grid-cols-2" aria-label="Shared document containers">
        {SHARED_DOCUMENT_CATEGORIES.map((item, index) => {
          const Icon = index === 0 ? ShieldCheck : BookOpen;
          return <TabsTrigger key={item.id} value={item.id} disabled={uploading} className="min-h-12 gap-2 whitespace-normal px-3 text-sm font-extrabold"><Icon className="h-4 w-4 shrink-0"/>{item.label}<span className="rounded-full bg-muted px-2 py-0.5 text-xs">{library.documents.filter((entry) => entry.category === item.id).length}</span></TabsTrigger>;
        })}
      </TabsList>
      {library.error && <div role="alert" className="mb-5 rounded-2xl border border-destructive/30 p-4 text-sm"><p>{library.error}</p><button type="button" onClick={library.retry} className="mt-2 min-h-10 font-bold text-primary">Try again</button></div>}
      {SHARED_DOCUMENT_CATEGORIES.map((item) => <TabsContent key={item.id} value={item.id} forceMount className="space-y-5 data-[state=inactive]:hidden">
        <DocumentUploader user={user} category={item.id} label={item.label} onBusy={setUploading}/>
        <section className="rounded-3xl border bg-card p-5">
          <h2 className="text-lg font-extrabold">Published {item.label.toLowerCase()}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Franchisees can open these files from the matching container on their page.</p>
          {library.loading ? <p role="status" className="mt-4 text-sm text-muted-foreground">Loading documents…</p> : library.documents.some((entry) => entry.category === item.id) ? <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {library.documents.filter((entry) => entry.category === item.id).map((entry) => <ManagedDocument key={entry.id} user={user} document={entry}/>)}
          </div> : <p className="mt-4 rounded-2xl bg-muted/50 p-4 text-sm text-muted-foreground">No documents uploaded here yet. Choose files above to add the first ones.</p>}
        </section>
      </TabsContent>)}
    </Tabs>
    <div className="mt-6 rounded-2xl border bg-card p-5 text-sm"><p className="font-extrabold">Invoices &amp; Delivery Documents</p><p className="mt-1 text-muted-foreground">Each franchisee’s third container collects their own bills, challans, e-way details and showroom attachments automatically.</p><Link to="/admin/tools?tab=documents" className="mt-3 inline-flex min-h-10 items-center font-bold text-primary">Add showroom billing attachments →</Link></div>
  </div>;
}

type PendingFile = { id: string; file: File; name: string; error: string };

function DocumentUploader({ user, category, label, onBusy }: { user: AppUser; category: SharedDocumentCategory; label: string; onBusy: (busy: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState("");

  function chooseFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    const additions = selected.map((file) => {
      let error = "";
      try { validateLibraryFile(file); } catch (failure) { error = message(failure); }
      return { id: crypto.randomUUID(), file, name: (file.name.replace(/\.[^.]+$/, "") || file.name).slice(0, 160), error };
    });
    setFiles((current) => [...current, ...additions]);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (busy || !files.length) return;
    setBusy(true);
    onBusy(true);
    let uploaded = 0;
    try {
      for (const pending of files) {
        setCurrentId(pending.id);
        try {
          await uploadSharedDocument(user, category, pending.name, pending.file);
          uploaded += 1;
          setFiles((current) => current.filter((entry) => entry.id !== pending.id));
        } catch (error) {
          setFiles((current) => current.map((entry) => entry.id === pending.id ? { ...entry, error: message(error) } : entry));
        }
      }
      if (uploaded) toast.success(`${uploaded} document${uploaded === 1 ? "" : "s"} published`, { description: "Available to every franchisee." });
    } finally {
      setBusy(false);
      setCurrentId("");
      onBusy(false);
    }
  }

  return <form onSubmit={upload} className="rounded-3xl border bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Shared with every franchisee</p><h2 className="mt-1 text-xl font-extrabold">Upload to {label}</h2><p className="mt-2 text-sm text-muted-foreground">Choose one or several images or PDFs, then give each document its own name. Maximum 10 MB per file.</p></div><button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-4 text-sm font-bold disabled:opacity-50"><Upload className="h-4 w-4"/>Choose files</button></div>
    <input ref={input} type="file" multiple accept={DOCUMENT_ACCEPT} disabled={busy} onChange={chooseFiles} className="sr-only" aria-label={`Choose files for ${label}`}/>
    {files.length > 0 && <div className="mt-5 space-y-3">
      {files.map((entry) => <div key={entry.id} className="rounded-2xl border bg-background p-3 sm:p-4">
        <div className="flex items-center gap-3"><div className="min-w-0 flex-1"><p className="truncate text-xs text-muted-foreground">{entry.file.name} · {documentSize(entry.file.size)}</p><label className="mt-2 block text-xs font-bold">Document name<input maxLength={160} value={entry.name} disabled={busy} onChange={(event) => setFiles((current) => current.map((file) => file.id === entry.id ? { ...file, name: event.target.value, error: "" } : file))} className="mt-1 min-h-11 w-full rounded-xl border bg-background px-3 text-sm font-normal"/></label></div><button type="button" disabled={busy} onClick={() => setFiles((current) => current.filter((file) => file.id !== entry.id))} aria-label={`Remove ${entry.file.name} from uploads`} className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border disabled:opacity-50"><X className="h-4 w-4"/></button></div>
        {busy && currentId === entry.id && <p role="status" className="mt-2 text-xs font-bold text-primary">Uploading…</p>}
        {entry.error && <p role="alert" className="mt-2 text-sm text-destructive">{entry.error}</p>}
      </div>)}
      <button type="submit" disabled={busy} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-extrabold text-primary-foreground disabled:opacity-50"><Upload className="h-4 w-4"/>{busy ? "Uploading documents…" : `Upload ${files.length} document${files.length === 1 ? "" : "s"}`}</button>
    </div>}
  </form>;
}

function ManagedDocument({ user, document }: { user: AppUser; document: SharedFranchiseeDocument }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(document.name);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function rename(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try { await renameSharedDocument(user, document, name); setEditing(false); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setError("");
    try { await removeSharedDocument(user, document); setDeleting(false); }
    catch (failure) { setError(message(failure)); }
    finally { setBusy(false); }
  }
  return <div>
    <DocumentFile {...document}/>
    {editing ? <form onSubmit={rename} className="mt-2 space-y-2"><label className="sr-only" htmlFor={`rename-${document.id}`}>Document name</label><input id={`rename-${document.id}`} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="min-h-10 w-full rounded-xl border bg-background px-3 text-sm"/><div className="flex gap-2"><button disabled={busy} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground"><Check className="h-3.5 w-3.5"/>Save name</button><button type="button" disabled={busy} onClick={() => setEditing(false)} className="min-h-9 px-2 text-xs font-bold">Cancel</button></div></form> : <div className="mt-1 flex gap-2"><button type="button" onClick={() => { setName(document.name); setEditing(true); setError(""); }} className="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-bold"><Pencil className="h-3.5 w-3.5"/>Rename</button><button type="button" onClick={() => { setDeleting(true); setError(""); }} className="inline-flex min-h-10 items-center gap-1 px-2 text-xs font-bold text-destructive"><Trash2 className="h-3.5 w-3.5"/>Remove</button></div>}
    {error && !deleting && <p role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
    <AlertDialog open={deleting} onOpenChange={(open) => { if (!busy) setDeleting(open); }}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this shared document?</AlertDialogTitle><AlertDialogDescription>“{document.name}” will be removed from every franchisee’s document container.</AlertDialogDescription></AlertDialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={(event) => { event.preventDefault(); void remove(); }}>{busy ? "Removing…" : "Remove document"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </div>;
}
