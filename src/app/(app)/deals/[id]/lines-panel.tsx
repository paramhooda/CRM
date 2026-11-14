"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LinesTable, type LineRowData } from "@/components/crm/lines-table";
import { LineDialog, emptyLine, lineToInput, type LineDraft } from "@/components/crm/line-dialog";
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
    const input = lineToInput(draft);
    // Send only the groups the actor may change, so a stale field never overwrites someone else's work
    const body: Record<string, unknown> = { id: input.id };
    if (editable.has("spec")) Object.assign(body, { productId: input.productId, description: input.description, businessUnitId: input.businessUnitId, subBusinessUnitId: input.subBusinessUnitId, oemId: input.oemId, quantity: input.quantity, unit: input.unit, revenueModel: input.revenueModel, termMonths: input.termMonths });
    if (editable.has("price")) Object.assign(body, { unitSalesPrice: input.unitSalesPrice, salesMethodId: input.salesMethodId });
    if (editable.has("cost")) Object.assign(body, { unitPurchaseCost: input.unitPurchaseCost });
    await api.patch(`/deals/${dealId}/lines`, { version, upserts: [body], deleteIds: [] });
    toast.success(draft.id ? "Line saved" : "Line added");
    router.refresh();
  };
  return (
    <div className="flex flex-col gap-3">
      {canAdd && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setEditing({ line: null })}><Plus /> Add line</Button></div>}
      {lines.length === 0 ? (
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
