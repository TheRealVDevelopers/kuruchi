import { ExternalLink, FileText } from "lucide-react";
import { documentSize, safeDocumentUrl } from "./model";

export function DocumentFile({ name, fileUrl, contentType, size }: { name: string; fileUrl?: string; contentType?: string; size?: number }) {
  const url = safeDocumentUrl(fileUrl);
  const isImage = contentType?.startsWith("image/") || (url && /^data:image\//i.test(url));
  return <article className="overflow-hidden rounded-2xl border bg-background">
    {url && isImage && <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`View ${name}`}>
      <img src={url} alt={name} loading="lazy" className="h-32 w-full bg-muted/40 object-contain p-2"/>
    </a>}
    <div className="flex items-start gap-3 p-3">
      <FileText className="mt-0.5 h-5 w-5 shrink-0 text-primary"/>
      <div className="min-w-0 flex-1"><p className="break-words text-sm font-extrabold">{name}</p>
        {(contentType || size) && <p className="mt-1 text-xs text-muted-foreground">{contentType === "application/pdf" ? "PDF" : contentType?.startsWith("image/") ? "Image" : "Document"}{size ? ` · ${documentSize(size)}` : ""}</p>}
        {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-bold text-primary">Open document <ExternalLink className="h-3.5 w-3.5"/></a> : <p className="mt-2 text-xs text-muted-foreground">Attachment not available yet.</p>}
      </div>
    </div>
  </article>;
}
