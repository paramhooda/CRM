"use client";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BuTag } from "./pills";
import { Money, Pct } from "./money";
import { useLookups } from "./providers";
import { REVENUE_MODEL_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

export type LineRowData = {
  id?: string; lineNo?: number; description: string; productLabel?: string | null; businessUnitId: string | null; subBusinessUnitId: string | null; oemId: string | null;
  quantity: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: number | string | null; unitSalesPrice?: string | null; unitPurchaseCost?: string | null;
  lineValue?: string | null; lineCost?: string | null; expectedGmPct?: string | null; salesMethodId?: string | null; canEdit?: boolean; canDelete?: boolean;
};

/** The lines of a deal, read-only; the row actions open the dialog owned by the parent. */
export function LinesTable({ rows, sales, onEdit, onDelete, totals }: { rows: LineRowData[]; sales: boolean; onEdit?: (row: LineRowData, index: number) => void; onDelete?: (row: LineRowData, index: number) => void; totals?: { value: string | null; cost: string | null; gm: string | null; arr?: string | null } }) {
  const L = useLookups();
  const name = (list: { id: string; name: string }[], id: string | null) => list.find((x) => x.id === id)?.name ?? "—";
  const bu = (id: string | null) => L.businessUnits.find((b) => b.id === id);
  const actions = !!(onEdit || onDelete);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
              <TableHead className="w-8">#</TableHead>
              <TableHead>Line</TableHead>
              <TableHead>BU · Sub BU</TableHead>
              <TableHead>OEM</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Model</TableHead>
              {sales && <TableHead className="text-right">Sales price</TableHead>}
              <TableHead className="text-right">Cost</TableHead>
              {sales && <TableHead className="text-right">Value</TableHead>}
              {sales && <TableHead className="text-right">GM</TableHead>}
              {actions && <TableHead className="w-20" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r, i) => {
              const b = bu(r.businessUnitId);
              return (
                <TableRow key={r.id ?? i}>
                  <TableCell className="text-xs text-muted-foreground">{r.lineNo ?? i + 1}</TableCell>
                  <TableCell className="min-w-56">
                    <div className="font-medium">{r.description}</div>
                    <div className="text-xs text-muted-foreground">{r.productLabel ? `Catalogue · ${r.productLabel}` : "Custom"}{r.salesMethodId && sales ? ` · ${name(L.salesMethods, r.salesMethodId)}` : ""}</div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap"><span className="flex items-center gap-1.5">{b && <BuTag name={b.name} colourToken={b.colourToken} />}<span className="text-xs text-muted-foreground">{name(L.subBusinessUnits, r.subBusinessUnitId)}</span></span></TableCell>
                  <TableCell className="whitespace-nowrap">{name(L.oems, r.oemId)}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular">{r.quantity} <span className="text-xs text-muted-foreground">{r.unit}</span></TableCell>
                  <TableCell className="whitespace-nowrap text-xs">{REVENUE_MODEL_LABEL[r.revenueModel]}{r.revenueModel === "ARR" && r.termMonths ? ` · ${r.termMonths} mo` : ""}</TableCell>
                  {sales && <TableCell className={cn("text-right", r.unitSalesPrice ? "" : "text-warning")}>{r.unitSalesPrice ? <Money value={r.unitSalesPrice} precise /> : "Not priced"}</TableCell>}
                  <TableCell className={cn("text-right", !r.unitPurchaseCost && "text-warning")}>{r.unitPurchaseCost ? <Money value={r.unitPurchaseCost} precise /> : "No cost"}</TableCell>
                  {sales && <TableCell className="text-right font-medium"><Money value={r.lineValue} /></TableCell>}
                  {sales && <TableCell className="text-right"><Pct value={r.expectedGmPct} /></TableCell>}
                  {actions && (
                    <TableCell className="text-right">
                      <span className="inline-flex gap-0.5">
                        {onEdit && r.canEdit !== false && <Button variant="ghost" size="icon-xs" aria-label={`Edit line ${r.lineNo ?? i + 1}`} onClick={() => onEdit(r, i)}><Pencil /></Button>}
                        {onDelete && r.canDelete !== false && <Button variant="ghost" size="icon-xs" aria-label={`Remove line ${r.lineNo ?? i + 1}`} className="text-destructive hover:text-destructive" onClick={() => onDelete(r, i)}><Trash2 /></Button>}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {totals && sales && (
        <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1 border-t border-border bg-muted/40 px-4 py-2 text-sm">
          {totals.arr && Number(totals.arr) > 0 && <span className="text-muted-foreground">ARR <Money value={totals.arr} className="font-medium text-foreground" /></span>}
          <span className="text-muted-foreground">Cost <Money value={totals.cost} className="font-medium text-foreground" /></span>
          <span className="text-muted-foreground">Value <Money value={totals.value} className="font-semibold text-foreground" /></span>
          <span className="text-muted-foreground">GM <Pct value={totals.gm} className="font-semibold text-foreground" /></span>
        </div>
      )}
    </div>
  );
}
