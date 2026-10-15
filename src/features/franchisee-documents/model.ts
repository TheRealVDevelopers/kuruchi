import type { AppUser } from "@/types";

export const SHARED_DOCUMENT_CATEGORIES = [
  { id: "KURCHI_KYC", label: "Kurchi KYC Documents", hint: "Company certificates and KYC files shared by Kurchi." },
  { id: "INSTRUCTION_MANUAL", label: "Instruction Manuals", hint: "Installation guides, care instructions and reference manuals." },
] as const;

export type SharedDocumentCategory = typeof SHARED_DOCUMENT_CATEGORIES[number]["id"];
export const LIBRARY_COLLECTION = "franchiseeLibraryDocuments";
export const LIBRARY_STORAGE_ROOT = "franchisee-library";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,application/pdf";

export interface SharedFranchiseeDocument {
  id: string;
  category: SharedDocumentCategory;
  name: string;
  originalName: string;
  fileUrl: string;
  storagePath: string;
  contentType: string;
  size: number;
  uploadedBy: string;
  uploadedByUid: string;
  uploadedAt: string;
}

export function requireLibraryAdmin(user: AppUser | null) {
  if (!user?.active || user.role !== "ADMIN") throw new Error("Only Kurchi Admin can manage shared documents.");
  return user;
}

export function documentName(value: string) {
  const name = value.trim();
  if (!name) throw new Error("Enter a document name.");
  if (name.length > 160) throw new Error("Keep document names within 160 characters.");
  return name;
}

export function validateLibraryFile(file: Pick<File, "name" | "type" | "size">) {
  const fallback: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", pdf: "application/pdf" };
  const contentType = file.type || fallback[file.name.split(".").pop()?.toLowerCase() ?? ""];
  if (!DOCUMENT_ACCEPT.split(",").includes(contentType)) throw new Error("Choose a JPG, PNG, WebP, GIF or PDF file.");
  if (file.size <= 0) throw new Error("This file is empty. Choose another file.");
  if (file.size > MAX_DOCUMENT_BYTES) throw new Error("Each document must be 10 MB or smaller.");
  return contentType;
}

export function isSharedCategory(value: string): value is SharedDocumentCategory {
  return SHARED_DOCUMENT_CATEGORIES.some((category) => category.id === value);
}

export function safeDocumentUrl(value?: string) {
  if (!value) return undefined;
  if (/^https:\/\//i.test(value) || /^data:(image\/(jpeg|png|webp|gif)|application\/pdf);base64,/i.test(value)) return value;
  return undefined;
}

export function documentSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
