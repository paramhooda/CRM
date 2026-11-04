"use client";
// Deal documents: SoW and solution documents from presales, supplier and OEM quotes from purchase, the customer's
// RFP and PO from sales. Each person sees what their job needs (src/lib/documents.ts) and adds the kinds they own.
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, FileSpreadsheet, FileImage, File, Upload, Trash2, Loader2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Field } from "@/components/ui/input";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { useAction } from "@/components/crm/use-action";
import { deleteDocument } from "@/server/actions/documents";
import type { OppDetail } from "@/server/queries/opportunity-detail";
import { ACCEPT, DOCUMENT_KIND_META, MAX_DOCUMENT_BYTES, fmtSize, type DocumentKindKey } from "@/lib/documents";
import { fmtDate } from "@/lib/format";

type Doc = OppDetail["documents"][number];

const KIND_TONE: Partial<Record<DocumentKindKey, "violet" | "aqua" | "blue" | "slate">> = {
  SOW: "violet", SOLUTION_DOC: "violet", BOQ_SHEET: "violet", PRESENTATION: "violet", SITE_SURVEY: "violet",
  SUPPLIER_QUOTE: "aqua", OEM_QUOTE: "aqua", CUSTOMER_RFP: "blue", CUSTOMER_PO: "blue",
};

function DocIcon({ mime }: { mime: string }) {
  const cls = "size-4 shrink-0 text-ink-3";
  if (mime.startsWith("image/")) return <FileImage className={cls} />;
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet className={cls} />;
  if (mime === "application/pdf" || mime.includes("word") || mime === "text/plain") return <FileText className={cls} />;
  return <File className={cls} />;
}

export function DocumentsPanel({
  oppId, documents, kinds, canAdd, viewerId, isManager, closed,
}: {
  oppId: string;
  documents: Doc[];
  /** Kinds this viewer may add */
  kinds: DocumentKindKey[];
  canAdd: boolean;
  viewerId: string;
  isManager: boolean;
  closed: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<DocumentKindKey | "">(kinds.length === 1 ? kinds[0]! : "");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [uploading, start] = useTransition();
  const { pending, run } = useAction();

  const upload = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !kind) return;
    if (file.size > MAX_DOCUMENT_BYTES) return void toast.error(`The file is ${fmtSize(file.size)}. The limit is ${fmtSize(MAX_DOCUMENT_BYTES)}.`);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    fd.set("note", note);
    start(async () => {
      try {
        const res = await fetch(`/api/opportunities/${oppId}/documents`, { method: "POST", body: fd });
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) return void toast.error(body.error ?? "Upload failed. Try again.");
        toast.success("Document added");
        setFile(null);
        setNote("");
        if (fileRef.current) fileRef.current.value = "";
        router.refresh();
      } catch {
        toast.error("Upload failed. Check your connection and try again.");
      }
    });
  };

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Documents" description="Statements of work, solution documents, BOQ sheets, and supplier and OEM quotes" />
        <CardContent className="px-0 pb-0">
          {documents.length === 0 ? (
            <p className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-ink-3">
              <Paperclip className="size-5" /> No documents yet.
            </p>
          ) : (
            <ul aria-label="Documents">
              {documents.map((d) => {
                const mayRemove = isManager || (d.uploadedBy.id === viewerId && !closed);
                const request = d.presalesRequest ? `BOQ revision ${d.presalesRequest.revision}` : d.pricingRequest ? "Pricing request" : null;
                return (
                  <li key={d.id} className="flex items-start gap-3 border-t border-border px-5 py-3 first:border-t-0">
                    <DocIcon mime={d.mimeType} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <a href={`/api/documents/${d.id}?inline=1`} target="_blank" rel="noopener" className="truncate text-[13px] font-medium hover:text-primary">
                          {d.fileName}
                        </a>
                        <Badge tone={KIND_TONE[d.kind] ?? "slate"}>{DOCUMENT_KIND_META[d.kind].label}</Badge>
                      </div>
                      {d.note && <p className="mt-0.5 text-xs text-ink-2">{d.note}</p>}
                      <p className="mt-0.5 text-xs text-ink-3">
                        {[d.uploadedBy.name, fmtDate(d.createdAt), request, fmtSize(d.sizeBytes)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <a href={`/api/documents/${d.id}`} className="shrink-0 text-xs text-primary hover:underline" aria-label={`Download ${d.fileName}`}>Download</a>
                    {mayRemove && (
                      <button
                        type="button" disabled={pending} aria-label={`Remove ${d.fileName}`}
                        onClick={() => { if (confirm(`Remove ${d.fileName}?`)) run(() => deleteDocument(d.id), { success: "Document removed" }); }}
                        className="shrink-0 rounded p-1 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      {canAdd && (
        <Card>
          <CardHeader title="Add a document" description={`PDF, Office, CSV, images, email or zip, up to ${fmtSize(MAX_DOCUMENT_BYTES)}`} />
          <CardContent>
            <form className="flex flex-col gap-3" onSubmit={upload}>
              <Field label="Kind" required>
                <Select value={kind} onChange={(e) => setKind(e.target.value as DocumentKindKey)} aria-label="Document kind">
                  <option value="" disabled>Select</option>
                  {kinds.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_META[k].label}</option>)}
                </Select>
              </Field>
              <Field label="File" required>
                <input
                  ref={fileRef} type="file" accept={ACCEPT} aria-label="File"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-ink-2 file:mr-2 file:cursor-pointer file:rounded-md file:border file:border-border file:bg-surface-2 file:px-2.5 file:py-1 file:text-xs file:text-ink"
                />
              </Field>
              <Field label="Note">
                <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="e.g. Ingram quote, valid 30 days" aria-label="Note" />
              </Field>
              <Button type="submit" variant="primary" size="sm" disabled={!file || !kind || uploading} className="self-start">
                {uploading ? <Loader2 className="animate-spin" /> : <Upload />} Upload
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
