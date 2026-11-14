"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox, type ComboOption } from "./combobox";
import { OptionSelect } from "./form";
import { ImportDialog } from "./import-dialog";
import { useAiEnabled, useLookups } from "./providers";
import { emptyLine, lineUpsertBody, type LineDraft } from "./line-dialog";
import { api, errorMessage } from "@/client/api";
import type { LineField } from "@/domain/lines";
import type { ExtractedLine } from "@/domain/ai-extract";
import type { ProductRow } from "@/server/services/products";
import { cn } from "@/lib/utils";

type Row = LineDraft & { key: string; deleted?: boolean; issues?: string[] };
export type GridSourceLine = { id: string; productId: string | null; product: { name: string } | null; description: string; businessUnitId: string; subBusinessUnitId: string; oemId: string; quantity: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: number | null; unitPurchaseCost: string | null; editable: string[] };

const MONEY = /^\d+(\.\d{1,2})?$/;
let seq = 0;
const key = () => `r${++seq}`;

/**
 * The BOQ as one editable grid: every line a row, add rows by hand or from a document, remove rows, one Save that
 * sends the whole change in one PATCH. Presales lands here; prices are never shown. Own-IP costs are editable when
 * the viewer may set them.
 */
export function BoqGrid({ dealId, version, lines, editable, onSaved }: { dealId: string; version: number; lines: GridSourceLine[]; editable: { thirdParty: LineField[]; ownIp: LineField[] }; onSaved?: () => void }) {
  const L = useLookups();
  const router = useRouter();
  const ai = useAiEnabled();
  const toRow = (l: GridSourceLine): Row => ({ key: l.id, id: l.id, productId: l.productId, productLabel: l.product?.name, description: l.description, businessUnitId: l.businessUnitId, subBusinessUnitId: l.subBusinessUnitId, oemId: l.oemId, quantity: l.quantity, unit: l.unit, revenueModel: l.revenueModel, termMonths: l.termMonths ? String(l.termMonths) : "", unitSalesPrice: "", unitPurchaseCost: l.unitPurchaseCost ?? "", salesMethodId: null });
  const [rows, setRows] = useState<Row[]>(() => lines.map(toRow));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [importing, setImporting] = useState(false);
  const canAdd = editable.thirdParty.includes("spec");
  const costOwnIp = editable.ownIp.includes("cost");
  const ownIp = (r: Row) => !!L.oems.find((o) => o.id === r.oemId)?.isOwnIp;
  const original = new Map(lines.map((l) => [l.id, toRow(l)]));
  const changed = (r: Row) => {
    const o = r.id ? original.get(r.id) : undefined;
    if (!o) return true;
    return (["productId", "description", "businessUnitId", "subBusinessUnitId", "oemId", "quantity", "unit", "revenueModel", "termMonths", "unitPurchaseCost"] as const).some((k) => String(r[k] ?? "") !== String(o[k] ?? ""));
  };
  const live = rows.filter((r) => !r.deleted);
  const dirty = rows.some((r) => r.deleted || changed(r));
  const update = (k: string, patch: Partial<Row>) => { setRows((rs) => rs.map((r) => (r.key === k ? { ...r, ...patch } : r))); setErrors((e) => { const { [k]: _d, ...rest } = e; return rest; }); };
  const loadProducts = useCallback(async (q: string) => {
    const r = await api.get<{ rows: ProductRow[] }>(`/products?q=${encodeURIComponent(q)}`);
    return r.rows.map((p) => ({ value: p.id, label: p.name, hint: `${p.oem.name} · ${p.subBusinessUnit.name}`, product: p }) as ComboOption & { product: ProductRow });
  }, []);
  const pickProduct = (k: string, id: string | null, option?: ComboOption) => {
    const p = (option as (ComboOption & { product?: ProductRow }) | undefined)?.product;
    update(k, { productId: id, productLabel: option?.label, ...(p ? { description: p.name, businessUnitId: p.businessUnitId, subBusinessUnitId: p.subBusinessUnitId, oemId: p.oemId, unit: p.unit, revenueModel: p.revenueModel, termMonths: p.defaultTermMonths ? String(p.defaultTermMonths) : "", unitPurchaseCost: p.oem.isOwnIp && p.standardCost ? p.standardCost : "" } : {}) });
  };
  const addRow = () => setRows((rs) => [...rs, { ...emptyLine(), key: key() }]);
  const importLines = (xs: ExtractedLine[]) => setRows((rs) => [...rs, ...xs.map((x) => ({ ...emptyLine(), key: key(), productId: x.productId, productLabel: x.productLabel ?? undefined, description: x.description, businessUnitId: x.businessUnitId, subBusinessUnitId: x.subBusinessUnitId, oemId: x.oemId, quantity: x.quantity, unit: x.unit, revenueModel: x.revenueModel, termMonths: x.termMonths, unitPurchaseCost: x.unitPurchaseCost, issues: x.issues }))]);
  const save = async () => {
    const errs: Record<string, string> = {};
    for (const r of live) {
      if (!r.description.trim()) errs[r.key] = "Describe what is sold.";
      else if (!r.businessUnitId || !r.subBusinessUnitId || !r.oemId) errs[r.key] = "Pick the business unit, Sub BU and OEM.";
      else if (!/^\d+(\.\d{1,2})?$/.test(r.quantity) || Number(r.quantity) <= 0) errs[r.key] = "Quantity must be more than zero.";
      else if (r.revenueModel === "ARR" && !(Number(r.termMonths) >= 1 && Number(r.termMonths) <= 120)) errs[r.key] = "A recurring line needs a term of 1 to 120 months.";
      else if (r.unitPurchaseCost && !MONEY.test(r.unitPurchaseCost)) errs[r.key] = "The cost is an amount with at most two decimals.";
    }
    if (Object.keys(errs).length) return setErrors(errs);
    const upserts = live.filter(changed).map((r) => lineUpsertBody(r, new Set<LineField>(ownIp(r) ? editable.ownIp : editable.thirdParty)));
    const deleteIds = rows.filter((r) => r.deleted && r.id).map((r) => r.id!);
    if (!upserts.length && !deleteIds.length) return toast.message("Nothing changed.");
    setPending(true);
    try {
      await api.patch(`/deals/${dealId}/lines`, { version, upserts, deleteIds });
      toast.success(`BOQ saved: ${live.length} line${live.length === 1 ? "" : "s"}`);
      router.refresh();
      onSaved?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const subsFor = (bu: string | null) => L.subBusinessUnits.filter((s) => !bu || s.businessUnitId === bu);
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4" aria-label="BOQ">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-sm font-semibold">Bill of quantities</h2><p className="text-xs text-muted-foreground">What the customer buys: products from the catalogue or custom items. One Save covers every row.</p></div>
        <div className="flex gap-2">
          {canAdd && ai && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileUp /> Import from document</Button>}
          {canAdd && <Button size="sm" variant="outline" onClick={addRow}><Plus /> Add row</Button>}
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[1180px] text-sm" data-slot="boq-grid">
          <thead className="bg-background text-left text-xs text-muted-foreground">
            <tr><th className="w-8 px-2 py-2">#</th><th className="min-w-56 px-2 py-2 font-medium">Product / description</th><th className="px-2 py-2 font-medium">Business unit</th><th className="px-2 py-2 font-medium">Sub BU</th><th className="px-2 py-2 font-medium">OEM</th><th className="w-20 px-2 py-2 text-right font-medium">Qty</th><th className="w-20 px-2 py-2 font-medium">Unit</th><th className="w-28 px-2 py-2 font-medium">Model</th><th className="w-20 px-2 py-2 font-medium">Term</th>{costOwnIp && <th className="w-36 whitespace-nowrap px-2 py-2 text-right font-medium">Own-IP cost</th>}<th className="w-10 px-2 py-2" /></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {live.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-sm text-muted-foreground">No lines yet. Add a row, or import them from the solution document.</td></tr>}
            {live.map((r, i) => {
              const spec = r.id ? (ownIp(r) ? editable.ownIp : editable.thirdParty).includes("spec") : canAdd;
              const locked = !!r.productId;
              return (
                <tr key={r.key} className={cn("align-top", errors[r.key] && "bg-destructive/5")}>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{i + 1}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      {spec && <Combobox value={r.productId} onChange={(v, o) => pickProduct(r.key, v, o)} load={loadProducts} options={r.productId && r.productLabel ? [{ value: r.productId, label: r.productLabel }] : undefined} placeholder="Catalogue product (optional)" searchPlaceholder="Search products…" allowClear className="h-8" />}
                      <Input value={r.description} onChange={(e) => update(r.key, { description: e.target.value })} placeholder="Description" aria-label={`Description for row ${i + 1}`} disabled={!spec} className="h-8" />
                      {(errors[r.key] || r.issues?.length) && <div className={cn("text-xs", errors[r.key] ? "text-destructive" : "text-warning")}>{errors[r.key] ?? r.issues!.join("; ")}</div>}
                    </div>
                  </td>
                  <td className="px-2 py-2"><OptionSelect value={r.businessUnitId} onChange={(v) => update(r.key, { businessUnitId: v, subBusinessUnitId: null })} options={L.businessUnits} disabled={!spec || locked} label={`Business unit for row ${i + 1}`} /></td>
                  <td className="px-2 py-2"><OptionSelect value={r.subBusinessUnitId} onChange={(v) => update(r.key, { subBusinessUnitId: v })} options={subsFor(r.businessUnitId)} disabled={!spec || locked} label={`Sub BU for row ${i + 1}`} /></td>
                  <td className="px-2 py-2"><OptionSelect value={r.oemId} onChange={(v) => update(r.key, { oemId: v, unitPurchaseCost: "" })} options={L.oems} disabled={!spec || locked} label={`OEM for row ${i + 1}`} /></td>
                  <td className="px-2 py-2"><Input inputMode="decimal" value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} aria-label={`Quantity for row ${i + 1}`} disabled={!spec} className="h-8 w-20 text-right tabular" /></td>
                  <td className="px-2 py-2"><Input value={r.unit} onChange={(e) => update(r.key, { unit: e.target.value })} aria-label={`Unit for row ${i + 1}`} disabled={!spec} className="h-8 w-20" /></td>
                  <td className="px-2 py-2"><OptionSelect value={r.revenueModel} onChange={(v) => update(r.key, { revenueModel: (v as "ONE_TIME" | "ARR") ?? "ONE_TIME", termMonths: v === "ARR" ? r.termMonths || "12" : "" })} options={[{ id: "ONE_TIME", name: "One-time" }, { id: "ARR", name: "Recurring" }]} disabled={!spec} label={`Model for row ${i + 1}`} /></td>
                  <td className="px-2 py-2"><Input inputMode="numeric" value={r.termMonths} onChange={(e) => update(r.key, { termMonths: e.target.value })} aria-label={`Term in months for row ${i + 1}`} disabled={!spec || r.revenueModel !== "ARR"} placeholder={r.revenueModel === "ARR" ? "months" : "—"} className="h-8 w-20 text-right tabular" /></td>
                  {costOwnIp && <td className="px-2 py-2"><Input inputMode="decimal" value={ownIp(r) ? r.unitPurchaseCost : ""} onChange={(e) => update(r.key, { unitPurchaseCost: e.target.value.trim() })} aria-label={`Own-IP cost for row ${i + 1}`} disabled={!ownIp(r)} placeholder={ownIp(r) ? "0.00" : "purchase"} className="h-8 w-32 text-right tabular" /></td>}
                  <td className="px-2 py-2">{spec && <Button variant="ghost" size="icon-xs" aria-label={`Remove row ${i + 1}`} className="text-destructive hover:text-destructive" onClick={() => (r.id ? update(r.key, { deleted: true }) : setRows((rs) => rs.filter((x) => x.key !== r.key)))}><Trash2 /></Button>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{live.length} line{live.length === 1 ? "" : "s"}{rows.some((r) => r.deleted) ? ` · ${rows.filter((r) => r.deleted).length} to remove` : ""}{dirty ? " · unsaved changes" : ""}</span>
        <Button onClick={save} disabled={pending || !dirty}>Save BOQ</Button>
      </div>
      {importing && <ImportDialog dealId={dealId} kind="boq" onImportLines={importLines} onClose={() => setImporting(false)} />}
    </section>
  );
}
