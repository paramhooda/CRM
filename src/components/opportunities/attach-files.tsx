"use client";
// Attach documents inside a hand-over dialog (the RFP with a BOQ request, supplier quotes with pricing, the PO at
// Won). Files are picked here and uploaded by the dialog around its action, through the same route as the Documents
// tab (server actions can't carry 15 MB files).
import { useRef } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { Select } from "@/components/ui/input";
import { ACCEPT, DOCUMENT_KIND_META, MAX_DOCUMENT_BYTES, checkUpload, fmtSize, type DocumentKindKey } from "@/lib/documents";

export type PickedFile = { file: File; kind: DocumentKindKey };
export type ExistingDoc = { id: string; fileName: string; kind: DocumentKindKey };

/** Upload one file to a deal, optionally linked to a request. Never throws. */
export async function uploadDocument(
  oppId: string,
  f: PickedFile,
  link: { presalesRequestId?: string; pricingRequestId?: string; note?: string } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const fd = new FormData();
  fd.set("file", f.file);
  fd.set("kind", f.kind);
  if (link.note) fd.set("note", link.note);
  if (link.presalesRequestId) fd.set("presalesRequestId", link.presalesRequestId);
  if (link.pricingRequestId) fd.set("pricingRequestId", link.pricingRequestId);
  try {
    const res = await fetch(`/api/opportunities/${oppId}/documents`, { method: "POST", body: fd });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? { ok: true } : { ok: false, error: body.error ?? "Upload failed." };
  } catch {
    return { ok: false, error: "Upload failed. Check your connection." };
  }
}

/** Upload several; returns the names that failed with why, for one summary message. */
export async function uploadAll(oppId: string, files: PickedFile[], link: Parameters<typeof uploadDocument>[2] = {}) {
  const failed: string[] = [];
  for (const f of files) {
    const r = await uploadDocument(oppId, f, link);
    if (!r.ok) failed.push(`${f.file.name}: ${r.error}`);
  }
  return failed;
}

export function AttachFiles({
  files, onChange, kinds, existing = [], hint, label = "Attach documents", required = false,
}: {
  files: PickedFile[];
  onChange: (f: PickedFile[]) => void;
  /** Kinds offered here; the first is the default for a new file */
  kinds: DocumentKindKey[];
  /** Documents of these kinds already on the deal, so nobody uploads them twice */
  existing?: ExistingDoc[];
  /** Gentle reminder shown when nothing of the expected kind is attached or on file */
  hint?: string | null;
  label?: string;
  required?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      const c = checkUpload({ name: file.name, size: file.size });
      if (!c.ok) {
        alert(`${file.name}: ${c.error}`);
        continue;
      }
      next.push({ file, kind: kinds[0]! });
    }
    onChange(next);
    if (input.current) input.current.value = "";
  };
  const onFile = existing.filter((d) => kinds.includes(d.kind));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-ink-2">
          {label}
          {required && <span className="text-critical"> *</span>}
          {!required && <span className="font-normal text-ink-3"> (optional)</span>}
        </span>
        <button type="button" onClick={() => input.current?.click()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
          <Paperclip className="size-3.5" /> Add file
        </button>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" aria-label={label} onChange={(e) => add(e.target.files)} />
      </div>
      {onFile.length > 0 && (
        <p className="text-xs text-ink-3">
          Already on the deal: {onFile.map((d) => `${d.fileName} (${DOCUMENT_KIND_META[d.kind].label})`).join(", ")}
        </p>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Files to attach">
          {files.map((f, i) => (
            <li key={`${f.file.name}-${i}`} className="flex items-center gap-2 rounded-md border border-border px-2 py-1">
              <FileText className="size-3.5 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-xs">{f.file.name} <span className="text-ink-3">· {fmtSize(f.file.size)}</span></span>
              {kinds.length > 1 && (
                <Select
                  value={f.kind}
                  aria-label={`Kind of ${f.file.name}`}
                  className="h-7 w-40 text-xs"
                  onChange={(e) => onChange(files.map((x, j) => (j === i ? { ...x, kind: e.target.value as DocumentKindKey } : x)))}
                >
                  {kinds.map((k) => <option key={k} value={k}>{DOCUMENT_KIND_META[k].label}</option>)}
                </Select>
              )}
              <button type="button" aria-label={`Remove ${f.file.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="rounded p-0.5 text-ink-3 hover:text-ink cursor-pointer">
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length === 0 && onFile.length === 0 && hint && <p className="text-xs text-[var(--t-amber)]">{hint}</p>}
      {files.length === 0 && <p className="text-[11px] text-ink-3">PDF, Office, images, email or zip, up to {fmtSize(MAX_DOCUMENT_BYTES)} each</p>}
    </div>
  );
}
