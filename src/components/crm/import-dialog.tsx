"use client";
import { useState } from "react";
import { FileUp, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormError } from "./form";
import { useLookups } from "./providers";
import { api, errorMessage } from "@/client/api";
import type { ExtractedCost, ExtractedLine } from "@/domain/ai-extract";
import { inr } from "@/domain/money";
import { cn } from "@/lib/utils";

type BoqResult = { kind: "boq"; lines: ExtractedLine[]; notes: string | null; files: string[] };
type PriceResult = { kind: "prices"; costs: ExtractedCost[]; unmatched: string[]; notes: string | null; files: string[] };

/**
 * "Import from document": PDFs, Excel sheets, CSVs, email files or screenshots go to the assistant, which returns
 * the line items (BOQ) or the quoted unit costs (prices). Everything is shown for review and nothing is saved here:
 * the caller puts the ticked rows into its grid.
 */
export function ImportDialog({ dealId, kind, onImportLines, onImportCosts, onClose }: { dealId: string; kind: "boq" | "prices"; onImportLines?: (lines: ExtractedLine[]) => void; onImportCosts?: (costs: ExtractedCost[]) => void; onClose: () => void }) {
  const L = useLookups();
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BoqResult | PriceResult | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "—";
  const read = async () => {
    if (!files.length) return setError("Add at least one file.");
    setPending(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("kind", kind);
      for (const f of files) form.append("files", f);
      const r = await api.upload<BoqResult | PriceResult>(`/deals/${dealId}/ai/extract`, form);
      setResult(r);
      setPicked(new Set((r.kind === "boq" ? r.lines : r.costs).map((_, i) => i)));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  const apply = () => {
    if (!result) return;
    if (result.kind === "boq") onImportLines?.(result.lines.filter((_, i) => picked.has(i)));
    else onImportCosts?.(result.costs.filter((_, i) => picked.has(i)));
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{kind === "boq" ? "Import the BOQ from a document" : "Import prices from vendor quotes"}</DialogTitle>
          <DialogDescription>{kind === "boq" ? "A solution document, BOQ sheet, quote or email: PDF, Excel, CSV, .eml or a screenshot. The assistant reads the line items; you check them before anything is saved." : "One or more vendor quotations: PDF, Excel, CSV, .eml or screenshots. The assistant reads each line's unit cost (the lowest of several vendors wins); you check them before anything is saved."}</DialogDescription>
        </DialogHeader>
        {!result ? (
          <div className="flex flex-col gap-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong bg-background px-4 py-8 text-sm text-muted-foreground hover:border-ring">
              <FileUp className="size-6" />
              <span>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Choose files (up to 6, 10 MB each)"}</span>
              <Input type="file" multiple accept=".pdf,.xlsx,.csv,.txt,.eml,.png,.jpg,.jpeg,.webp" className="sr-only" aria-label="Documents to read" onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setError(null); }} />
            </label>
            {files.length > 0 && <ul className="text-sm text-muted-foreground">{files.map((f) => <li key={f.name}>{f.name} · {Math.max(1, Math.round(f.size / 1024))} KB</li>)}</ul>}
            <FormError message={error} />
          </div>
        ) : result.kind === "boq" ? (
          <div className="flex flex-col gap-3">
            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-xs text-muted-foreground"><tr><th className="w-8 px-2 py-2" /><th className="px-2 py-2 font-medium">Line</th><th className="px-2 py-2 font-medium">BU · Sub BU · OEM</th><th className="px-2 py-2 text-right font-medium">Qty</th><th className="px-2 py-2 font-medium">To check</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {result.lines.map((l, i) => (
                    <tr key={i} className={cn(!picked.has(i) && "opacity-50")}>
                      <td className="px-2 py-2"><Checkbox checked={picked.has(i)} onCheckedChange={() => toggle(i)} aria-label={`Include ${l.description}`} /></td>
                      <td className="px-2 py-2"><div className="font-medium">{l.description}</div><div className="text-xs text-muted-foreground">{l.productLabel ? `Catalogue · ${l.productLabel}` : "Custom"}{l.revenueModel === "ARR" ? ` · recurring, ${l.termMonths} months` : ""}{l.unitPurchaseCost ? ` · cost ${inr(l.unitPurchaseCost)}` : ""}</div></td>
                      <td className="px-2 py-2 text-xs">{name(L.businessUnits, l.businessUnitId)} · {name(L.subBusinessUnits, l.subBusinessUnitId)} · {name(L.oems, l.oemId)}</td>
                      <td className="px-2 py-2 text-right tabular">{l.quantity} {l.unit}</td>
                      <td className="px-2 py-2 text-xs text-warning">{l.issues.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.lines.length === 0 && <p className="text-sm text-muted-foreground">The assistant found no line items in {result.files.join(", ")}.</p>}
            {result.notes && <p className="text-xs text-muted-foreground">Assistant&apos;s note: {result.notes}</p>}
            <p className="text-xs text-muted-foreground">Lines with something to check are added anyway; fix them in the grid before you save.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="max-h-96 overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="bg-background text-left text-xs text-muted-foreground"><tr><th className="w-8 px-2 py-2" /><th className="px-2 py-2 font-medium">Deal line</th><th className="px-2 py-2 text-right font-medium">Unit cost</th><th className="px-2 py-2 font-medium">Vendor</th></tr></thead>
                <tbody className="divide-y divide-border">
                  {result.costs.map((c, i) => (
                    <tr key={c.lineId} className={cn(!picked.has(i) && "opacity-50")}>
                      <td className="px-2 py-2"><Checkbox checked={picked.has(i)} onCheckedChange={() => toggle(i)} aria-label={`Use the cost for line ${c.lineNo}`} /></td>
                      <td className="px-2 py-2">Line {c.lineNo}</td>
                      <td className="px-2 py-2 text-right tabular">{inr(c.unitPurchaseCost, { precise: true })}</td>
                      <td className="px-2 py-2 text-xs text-muted-foreground">{c.vendor ?? "—"}{c.note ? ` · ${c.note}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.costs.length === 0 && <p className="text-sm text-muted-foreground">No cost matched a line of this deal.</p>}
            {result.unmatched.length > 0 && <div className="text-xs text-muted-foreground">Not used: {result.unmatched.join("; ")}</div>}
            {result.notes && <p className="text-xs text-muted-foreground">Assistant&apos;s note: {result.notes}</p>}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          {!result ? <Button type="button" onClick={read} disabled={pending || !files.length}><Sparkles /> {pending ? "Reading…" : "Read with AI"}</Button> : <Button type="button" onClick={apply} disabled={picked.size === 0}>{kind === "boq" ? `Add ${picked.size} line${picked.size === 1 ? "" : "s"} to the BOQ` : `Fill ${picked.size} cost${picked.size === 1 ? "" : "s"}`}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
