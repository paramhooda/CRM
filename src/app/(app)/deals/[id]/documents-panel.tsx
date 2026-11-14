"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { EmptyState } from "@/components/crm/states";
import { useActor, useLookups } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { fmtDateTime } from "@/lib/format";
import type { DealView } from "@/server/services/deals";

type Doc = DealView["documents"][number];

const size = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

export function DocumentsPanel({ dealId, documents, canUpload, sales }: { dealId: string; documents: Doc[]; canUpload: boolean; sales: boolean }) {
  const actor = useActor();
  const router = useRouter();
  const [upload, setUpload] = useState(false);
  const [removing, setRemoving] = useState<Doc | null>(null);
  const mayDelete = (d: Doc) => canUpload && (d.uploadedBy.id === actor.id || actor.role === "ADMIN" || actor.role === "SALES_HEAD" || sales);
  return (
    <div className="flex flex-col gap-3">
      {canUpload && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setUpload(true)}><Upload /> Upload document</Button></div>}
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents" description={canUpload ? "Proposals, BOQs, OEM quotes and the customer's PO live here." : "Nothing has been attached yet."} action={canUpload ? <Button size="sm" onClick={() => setUpload(true)}><Upload /> Upload document</Button> : undefined} />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {documents.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.fileName}</div>
                <div className="text-xs text-muted-foreground">{d.kind.name} · {size(d.sizeBytes)} · {d.uploadedBy.fullName} · {fmtDateTime(d.uploadedAt)}{d.description ? ` · ${d.description}` : ""}</div>
              </div>
              <Button asChild variant="outline" size="sm"><a href={`/api/v1/documents/${d.id}/download`}><Download /> Download</a></Button>
              {mayDelete(d) && <Button variant="ghost" size="icon-sm" aria-label={`Delete ${d.fileName}`} className="text-destructive hover:text-destructive" onClick={() => setRemoving(d)}><Trash2 /></Button>}
            </li>
          ))}
        </ul>
      )}
      {upload && <UploadDialog dealId={dealId} sales={sales} onClose={() => setUpload(false)} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Delete ${removing?.fileName ?? "this document"}?`} description="An administrator can restore it from the database; it leaves the deal now." destructive confirmLabel="Delete" onConfirm={async () => { if (!removing) return; await api.del(`/documents/${removing.id}`); toast.success("Document deleted"); router.refresh(); }} />
    </div>
  );
}

/** The kind + file pair, reused inside the hand-over dialogs. `kinds` is already filtered for the viewer. */
export function DocumentFields({ idPrefix = "doc", kinds, kindId, onKind, onFile, errors, required }: { idPrefix?: string; kinds: { id: string; name: string }[]; kindId: string | null; onKind: (v: string | null) => void; onFile: (f: File | null) => void; errors: Record<string, string>; required?: boolean }) {
  return (
    <>
      <Field label="Kind" htmlFor={`${idPrefix}-kind`} error={errors.documentKindId} required={required}><OptionSelect id={`${idPrefix}-kind`} value={kindId} onChange={onKind} options={kinds} invalid={!!errors.documentKindId} /></Field>
      <Field label="File" htmlFor={`${idPrefix}-file`} error={errors.file} required={required} hint="PDF, Office files, images or zip, up to 20 MB."><Input id={`${idPrefix}-file`} type="file" onChange={(e) => onFile(e.target.files?.[0] ?? null)} aria-invalid={!!errors.file} /></Field>
    </>
  );
}

/** One multipart POST; the server checks kind, type and size again. */
export async function uploadDocument(dealId: string, documentKindId: string, file: File, description?: string) {
  const form = new FormData();
  form.set("documentKindId", documentKindId);
  if (description) form.set("description", description);
  form.set("file", file);
  return api.upload<Doc>(`/deals/${dealId}/documents`, form);
}

/** Kinds the viewer may attach: sales roles see every kind, support roles only the ones not restricted to sales. */
export function useDocumentKinds(sales: boolean) {
  const L = useLookups();
  return L.documentKinds.filter((k) => sales || !k.restrictedToSales);
}

export function UploadDialog({ dealId, sales, kindId: preset, title = "Upload a document", description, onClose }: { dealId: string; sales: boolean; kindId?: string | null; title?: string; description?: string; onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const f = useForm({ documentKindId: (preset ?? null) as string | null, description: "" });
  const kinds = useDocumentKinds(sales);
  const save = () =>
    f.submit(async (v) => {
      const errs: Record<string, string> = {};
      if (!v.documentKindId) errs.documentKindId = "Pick the kind of document.";
      if (!file) errs.file = "Choose a file.";
      if (Object.keys(errs).length) return f.setErrors(errs);
      await uploadDocument(dealId, v.documentKindId!, file!, v.description);
      toast.success("Document uploaded");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description ?? "It is attached to the deal and shows under Documents."}</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <DocumentFields kinds={kinds} kindId={f.values.documentKindId} onKind={(v) => f.set("documentKindId", v)} onFile={(x) => { setFile(x); f.setErrors((e) => { const { file: _f, ...rest } = e; return rest; }); }} errors={f.errors} required />
          <Field label="Description" htmlFor="doc-desc" error={f.errors.description}><Input id="doc-desc" value={f.values.description} onChange={(e) => f.set("description", e.target.value)} placeholder="Optional" maxLength={300} /></Field>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>Upload</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
