"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, errorMessage } from "@/client/api";
import { inr, pct } from "@/domain/money";
import { cn } from "@/lib/utils";

export type GridLine = { id: string; lineNo: number; description: string; quantity: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: number | null; unitPurchaseCost: string | null; unitSalesPrice?: string | null; oem: { name: string; isOwnIp: boolean }; editable: string[] };
export type GridMode = "cost" | "price";

const MONEY = /^\d+(\.\d{1,2})?$/;
const factor = (l: GridLine) => Number(l.quantity) * (l.revenueModel === "ARR" ? (l.termMonths ?? 12) / 12 : 1);

/**
 * One editable money column over the deal's lines: purchase costs (mode "cost") or sales prices (mode "price").
 * Every change goes in one PATCH, so the deal's version moves once and nobody's other fields are touched.
 */
export function PriceGrid({ dealId, version, lines, mode, sales, onSaved }: { dealId: string; version: number; lines: GridLine[]; mode: GridMode; sales: boolean; onSaved?: (r: { saved: number; allCosted: boolean; allPriced: boolean }) => void }) {
  const router = useRouter();
  const field = mode === "cost" ? "unitPurchaseCost" : "unitSalesPrice";
  const rows = useMemo(() => lines.filter((l) => l.editable.includes(mode)), [lines, mode]);
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((l) => [l.id, l[field] ?? ""])));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const changed = rows.filter((l) => (values[l.id] ?? "") !== (l[field] ?? ""));
  const num = (v: string | null | undefined) => (v && MONEY.test(v) ? Number(v) : null);
  const totals = rows.reduce(
    (t, l) => {
      const cost = num(mode === "cost" ? values[l.id] : l.unitPurchaseCost);
      const price = num(mode === "price" ? values[l.id] : l.unitSalesPrice ?? null);
      return { cost: t.cost + (cost ?? 0) * factor(l), value: t.value + (price ?? 0) * factor(l), costed: t.costed && cost !== null, priced: t.priced && price !== null };
    },
    { cost: 0, value: 0, costed: true, priced: true },
  );
  const save = async () => {
    const errs: Record<string, string> = {};
    for (const l of changed) if (values[l.id] && !MONEY.test(values[l.id]!)) errs[l.id] = "An amount with at most two decimals.";
    if (Object.keys(errs).length) return setErrors(errs);
    if (!changed.length) return toast.message("Nothing changed.");
    setPending(true);
    try {
      await api.patch(`/deals/${dealId}/lines`, { version, upserts: changed.map((l) => ({ id: l.id, [field]: values[l.id] || null })), deleteIds: [] });
      toast.success(mode === "cost" ? `Costs saved on ${changed.length} line${changed.length === 1 ? "" : "s"}` : `Prices saved on ${changed.length} line${changed.length === 1 ? "" : "s"}`);
      router.refresh();
      onSaved?.({ saved: changed.length, allCosted: totals.costed && lines.every((l) => l.editable.includes("cost") || l.unitPurchaseCost !== null), allPriced: totals.priced });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{mode === "cost" ? "No line here needs a cost from you." : "No line here takes a sales price from you."}</p>;
  return (
    <div className="flex flex-col gap-3" data-slot="price-grid">
      <div className="overflow-hidden rounded-xl border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent [&>th]:text-xs [&>th]:font-medium [&>th]:text-muted-foreground">
              <TableHead className="w-8">#</TableHead>
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              {mode === "price" && sales && <TableHead className="text-right">Unit cost</TableHead>}
              <TableHead className="w-44 text-right">{mode === "cost" ? "Unit purchase cost" : "Unit sales price"}</TableHead>
              <TableHead className="text-right">{mode === "cost" ? "Line cost" : "Line value"}</TableHead>
              {mode === "price" && sales && <TableHead className="text-right">GM</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => {
              const v = values[l.id] ?? "";
              const n = num(v);
              const cost = mode === "cost" ? n : num(l.unitPurchaseCost);
              const gm = mode === "price" && n && cost !== null ? ((n - cost) / n) * 100 : null;
              return (
                <TableRow key={l.id}>
                  <TableCell className="text-xs text-muted-foreground">{l.lineNo}</TableCell>
                  <TableCell className="min-w-48"><div className="font-medium">{l.description}</div><div className="text-xs text-muted-foreground">{l.oem.name}{l.oem.isOwnIp ? " · own IP" : ""}{l.revenueModel === "ARR" ? ` · recurring, ${l.termMonths ?? 12} months` : ""}</div></TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular">{l.quantity} <span className="text-xs text-muted-foreground">{l.unit}</span></TableCell>
                  {mode === "price" && sales && <TableCell className="text-right tabular">{cost === null ? <span className="text-warning">No cost</span> : inr(cost, { precise: true })}</TableCell>}
                  <TableCell className="text-right">
                    <Input inputMode="decimal" value={v} onChange={(e) => { setValues((o) => ({ ...o, [l.id]: e.target.value.trim() })); setErrors((o) => { const { [l.id]: _d, ...rest } = o; return rest; }); }} aria-label={`${mode === "cost" ? "Cost" : "Price"} for line ${l.lineNo}`} aria-invalid={!!errors[l.id]} className={cn("h-8 text-right tabular", errors[l.id] && "border-destructive")} placeholder="0.00" autoFocus={l === rows[0]} />
                    {errors[l.id] && <div className="mt-1 text-xs text-destructive">{errors[l.id]}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular">{n === null ? <span className="text-muted-foreground">—</span> : inr(n * factor(l))}</TableCell>
                  {mode === "price" && sales && <TableCell className={cn("text-right tabular", gm !== null && gm < 0 && "text-destructive")}>{gm === null ? "—" : pct(gm, 1)}</TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div className="text-muted-foreground">
          {mode === "cost" ? <>Total cost <span className="font-semibold text-foreground tabular">{inr(totals.cost)}</span></> : <>Value <span className="font-semibold text-foreground tabular">{inr(totals.value)}</span>{sales && <> · Cost <span className="font-medium text-foreground tabular">{inr(totals.cost)}</span> · GM <span className="font-semibold text-foreground tabular">{totals.value > 0 && totals.costed ? pct(((totals.value - totals.cost) / totals.value) * 100, 1) : "—"}</span></>}</>}
        </div>
        <Button onClick={save} disabled={pending || changed.length === 0}>{mode === "cost" ? "Save costs" : "Save prices"}</Button>
      </div>
    </div>
  );
}

export function PriceGridDialog({ dealId, version, lines, mode, sales, onClose, onSaved }: { dealId: string; version: number; lines: GridLine[]; mode: GridMode; sales: boolean; onClose: () => void; onSaved?: (r: { saved: number; allCosted: boolean; allPriced: boolean }) => void }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{mode === "cost" ? "Enter purchase costs" : "Set sales prices"}</DialogTitle>
          <DialogDescription>{mode === "cost" ? "The unit price you can buy each line at. One save covers every line." : "The unit price to the customer for each line; the margin updates as you type. One save covers every line."}</DialogDescription>
        </DialogHeader>
        <PriceGrid dealId={dealId} version={version} lines={lines} mode={mode} sales={sales} onSaved={(r) => { onSaved?.(r); onClose(); }} />
        <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
