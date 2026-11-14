"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinesTable, type LineRowData } from "@/components/crm/lines-table";
import { LineDialog, emptyLine, lineUpsertBody, type LineDraft } from "@/components/crm/line-dialog";
import { PriceGrid, PriceGridDialog, type GridMode } from "@/components/crm/price-grid";
import { BoqGrid } from "@/components/crm/boq-grid";
import { ALL_COSTED_EVENT } from "./next-panel";
import { ImportDialog } from "@/components/crm/import-dialog";
import { useAiEnabled } from "@/components/crm/providers";
import type { ExtractedLine } from "@/domain/ai-extract";
import { FileUp } from "lucide-react";
import { IndianRupee, Tags } from "lucide-react";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { EmptyState } from "@/components/crm/states";
import { api } from "@/client/api";
import type { LineField } from "@/domain/lines";
import type { DealView } from "@/server/services/deals";

type Line = DealView["lines"][number];

/** Lines of a live deal. Each save is one PATCH with the deal's version, so two people can't overwrite each other. */
export function LinesPanel({ dealId, version, lines, sales, lineEditable, totals, open }: { dealId: string; version: number; lines: Line[]; sales: boolean; lineEditable: { thirdParty: LineField[]; ownIp: LineField[] }; totals?: { value: string | null; cost: string | null; gm: string | null; arr?: string | null }; open: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<{ line: Line | null } | null>(null);
  const [removing, setRemoving] = useState<Line | null>(null);
  const canAdd = open && lineEditable.thirdParty.includes("spec");
  const editableFor = (l: Line) => new Set<LineField>((l.editable ?? []) as LineField[]);
  const toDraft = (l: Line): LineDraft => ({
    id: l.id, productId: l.productId, productLabel: l.product?.name, description: l.description, businessUnitId: l.businessUnitId, subBusinessUnitId: l.subBusinessUnitId, oemId: l.oemId,
    quantity: l.quantity, unit: l.unit, revenueModel: l.revenueModel, termMonths: l.termMonths ? String(l.termMonths) : "", unitSalesPrice: l.unitSalesPrice ?? "", unitPurchaseCost: l.unitPurchaseCost ?? "", salesMethodId: l.salesMethodId ?? null,
  });
  const rows: LineRowData[] = lines.map((l) => ({ ...l, productLabel: l.product?.name ?? null, canEdit: editableFor(l).size > 0, canDelete: editableFor(l).has("delete") }));
  const save = async (draft: LineDraft, editable: Set<LineField>) => {
    await api.patch(`/deals/${dealId}/lines`, { version, upserts: [lineUpsertBody(draft, editable)], deleteIds: [] });
    toast.success(draft.id ? "Line saved" : "Line added");
    router.refresh();
  };
  const [grid, setGrid] = useState<GridMode | null>(null);
  const [importing, setImporting] = useState(false);
  const ai = useAiEnabled();
  const canCost = open && lines.some((l) => editableFor(l).has("cost"));
  const canPrice = open && lines.some((l) => editableFor(l).has("price"));
  // Purchase has one job here: the cost column. It gets the grid straight away instead of a dialog per line.
  const purchaseOnly = canCost && !canAdd && !canPrice && !sales;
  // Presales builds the BOQ: the whole bill as one editable grid, nothing about prices
  if (!sales && canAdd) return <BoqGrid dealId={dealId} version={version} lines={lines} editable={lineEditable} />;
  const importLines = async (xs: ExtractedLine[]) => {
    const upserts = xs.filter((x) => x.businessUnitId && x.subBusinessUnitId && x.oemId).map((x) => ({ productId: x.productId, description: x.description, businessUnitId: x.businessUnitId, subBusinessUnitId: x.subBusinessUnitId, oemId: x.oemId, quantity: x.quantity, unit: x.unit, revenueModel: x.revenueModel, termMonths: x.revenueModel === "ARR" ? Number(x.termMonths) || 12 : null }));
    const skipped = xs.length - upserts.length;
    if (!upserts.length) return toast.error("None of the lines had a business unit, Sub BU and OEM; add them by hand.");
    await api.patch(`/deals/${dealId}/lines`, { version, upserts, deleteIds: [] });
    toast.success(`${upserts.length} line${upserts.length === 1 ? "" : "s"} added${skipped ? `; ${skipped} skipped (missing BU, Sub BU or OEM)` : ""}`);
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      {purchaseOnly && (
        <section className="rounded-xl border border-border bg-card p-4" aria-label="Enter purchase costs">
          <h2 className="mb-3 text-sm font-semibold">Enter purchase costs</h2>
          <PriceGrid dealId={dealId} version={version} lines={lines} mode="cost" sales={false} onSaved={(r) => { if (r.allCosted) window.dispatchEvent(new Event(ALL_COSTED_EVENT)); }} />
        </section>
      )}
      {(canAdd || (canCost && !purchaseOnly) || canPrice) && (
        <div className="flex flex-wrap justify-end gap-2">
          {canCost && !purchaseOnly && <Button size="sm" variant="outline" onClick={() => setGrid("cost")}><IndianRupee /> Enter costs</Button>}
          {canPrice && <Button size="sm" variant="outline" onClick={() => setGrid("price")}><Tags /> Set prices</Button>}
          {canAdd && ai && <Button size="sm" variant="outline" onClick={() => setImporting(true)}><FileUp /> Import from document</Button>}
          {canAdd && <Button size="sm" variant="outline" onClick={() => setEditing({ line: null })}><Plus /> Add line</Button>}
        </div>
      )}
      {importing && <ImportDialog dealId={dealId} kind="boq" onImportLines={(xs) => { void importLines(xs); }} onClose={() => setImporting(false)} />}
      {grid && <PriceGridDialog dealId={dealId} version={version} lines={lines} mode={grid} sales={sales} onClose={() => setGrid(null)} />}
      {purchaseOnly ? null : lines.length === 0 ? (
        <EmptyState title="No lines yet" description={canAdd ? "Add what is being sold: products from the catalogue or custom items." : "Nothing has been added to this deal yet."} action={canAdd ? <Button size="sm" onClick={() => setEditing({ line: null })}><Plus /> Add line</Button> : undefined} />
      ) : (
        <LinesTable rows={rows} sales={sales} totals={totals} onEdit={(r) => setEditing({ line: lines.find((l) => l.id === r.id) ?? null })} onDelete={(r) => setRemoving(lines.find((l) => l.id === r.id) ?? null)} />
      )}
      {editing && (
        <LineDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing.line ? toDraft(editing.line) : emptyLine()}
          editable={editing.line ? editableFor(editing.line) : new Set<LineField>(lineEditable.thirdParty)}
          onSave={(draft) => save(draft, editing.line ? editableFor(editing.line) : new Set<LineField>(lineEditable.thirdParty))}
        />
      )}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title="Remove this line?" description="The removal is recorded in the deal's history." destructive confirmLabel="Remove" onConfirm={async () => { if (!removing) return; await api.patch(`/deals/${dealId}/lines`, { version, upserts: [], deleteIds: [removing.id] }); toast.success("Line removed"); router.refresh(); }} />
    </div>
  );
}
