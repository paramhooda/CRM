// Deal documents (pure, unit-tested): what each role adds, what each role sees, and which files are accepted.
// Sales sees everything on its deals. Presales and purchase see what their job needs, plus anything they added.

export type DocumentKindKey =
  | "CUSTOMER_RFP" | "CUSTOMER_PO" | "SOW" | "SOLUTION_DOC" | "BOQ_SHEET" | "PRESENTATION" | "SITE_SURVEY"
  | "SUPPLIER_QUOTE" | "OEM_QUOTE" | "OTHER";

export const DOCUMENT_KIND_META: Record<DocumentKindKey, { label: string }> = {
  CUSTOMER_RFP: { label: "Customer RFP / requirement" },
  CUSTOMER_PO: { label: "Customer PO" },
  SOW: { label: "Statement of work" },
  SOLUTION_DOC: { label: "Solution document" },
  /** No longer uploaded: the BOQ is generated from the line items. Kept so older files still show. */
  BOQ_SHEET: { label: "BOQ sheet (uploaded)" },
  PRESENTATION: { label: "Presentation" },
  SITE_SURVEY: { label: "Site survey" },
  SUPPLIER_QUOTE: { label: "Supplier quote" },
  OEM_QUOTE: { label: "OEM quote" },
  OTHER: { label: "Other" },
};

const ALL = Object.keys(DOCUMENT_KIND_META) as DocumentKindKey[];

/** What each role adds: sales the customer's papers, presales the design, purchase the supplier pricing. The BOQ is never uploaded: it is the line items. */
const UPLOAD: Record<string, DocumentKindKey[]> = {
  SALES: ["CUSTOMER_RFP", "CUSTOMER_PO", "SOW", "OTHER"],
  PRESALES: ["SOW", "SOLUTION_DOC", "PRESENTATION", "SITE_SURVEY", "OTHER"],
  PURCHASE: ["SUPPLIER_QUOTE", "OEM_QUOTE", "OTHER"],
};

/**
 * What presales and purchase see besides their own uploads. Purchase gets what it must buy against (the customer's
 * RFP for exact specs, BOQ, SoW) and the supplier pricing; presales gets the customer's requirement, the design papers
 * and supplier pricing (part availability, end-of-sale). Neither sees the customer's PO, which carries sell prices.
 */
const VISIBLE: Record<string, DocumentKindKey[]> = {
  PRESALES: ["CUSTOMER_RFP", "SOW", "SOLUTION_DOC", "BOQ_SHEET", "PRESENTATION", "SITE_SURVEY", "SUPPLIER_QUOTE", "OEM_QUOTE"],
  PURCHASE: ["CUSTOMER_RFP", "SOW", "BOQ_SHEET", "SUPPLIER_QUOTE", "OEM_QUOTE"],
};

export function uploadKinds(role: string): DocumentKindKey[] {
  return UPLOAD[role] ?? ALL.filter((k) => k !== "BOQ_SHEET");
}

/** Kinds a role sees regardless of who added them; null means every document */
export function visibleKinds(role: string): DocumentKindKey[] | null {
  return VISIBLE[role] ?? null;
}

export function canSeeDocument(viewer: { id: string; role: string }, doc: { kind: string; uploadedById: string }) {
  const kinds = visibleKinds(viewer.role);
  return !kinds || doc.uploadedById === viewer.id || (kinds as string[]).includes(doc.kind);
}

export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

/** Office documents, PDFs, images, mail and archives. Nothing a browser would run (no HTML, SVG or scripts). */
const TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  zip: "application/zip",
  msg: "application/vnd.ms-outlook",
  eml: "message/rfc822",
};
export const ACCEPT = Object.keys(TYPES).map((e) => `.${e}`).join(",");
const INLINE = new Set(["application/pdf", "image/png", "image/jpeg"]);

/** Check an upload by name and size. The stored type comes from the extension, never from the browser. */
export function checkUpload(f: { name: string; size: number }): { ok: true; fileName: string; mimeType: string } | { ok: false; error: string } {
  const base = f.name.split(/[\\/]/).pop() ?? "";
  const fileName = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(-150);
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mimeType = TYPES[ext];
  if (!fileName || !ext) return { ok: false, error: "The file needs a name with an extension, such as .pdf or .xlsx." };
  if (!mimeType) return { ok: false, error: `.${ext} files are not accepted. Use PDF, Word, Excel, PowerPoint, CSV, text, images, email or zip.` };
  if (f.size <= 0) return { ok: false, error: "The file is empty." };
  if (f.size > MAX_DOCUMENT_BYTES) return { ok: false, error: `The file is ${fmtSize(f.size)}. The limit is ${fmtSize(MAX_DOCUMENT_BYTES)}.` };
  return { ok: true, fileName, mimeType };
}

/** PDFs and images open in the browser; everything else downloads */
export function contentDisposition(fileName: string, mimeType: string, inline: boolean) {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, "_").replace(/[\\;]/g, "_");
  const type = inline && INLINE.has(mimeType) ? "inline" : "attachment";
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
}
