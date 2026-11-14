"use client";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/crm/data-table";
import { FilterBar } from "@/components/crm/filter-bar";
import { BuTag, NeutralPill } from "@/components/crm/pills";
import { Money } from "@/components/crm/money";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { useLookups } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { REVENUE_MODEL_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { RecordCode } from "@/components/crm/code";

type Row = { id: string; code: string; name: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; defaultTermMonths: number | null; listPrice: string | null; standardCost: string | null; hsnSac: string | null; isActive: boolean; deletedAt: string | null; businessUnitId: string; subBusinessUnitId: string; oemId: string; businessUnit: { name: string }; subBusinessUnit: { name: string }; oem: { name: string; isOwnIp: boolean } };

export function ProductsTable({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const L = useLookups();
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [removing, setRemoving] = useState<Row | null>(null);
  const bu = new Map(L.businessUnits.map((b) => [b.id, b]));
  const columns: Column<Row>[] = [
    { key: "name", header: "Product", cell: (r) => <span className={cn(r.deletedAt && "text-muted-foreground line-through")}>{r.name}<RecordCode className="block text-[11px]">{r.code}{!r.isActive ? " · inactive" : ""}{r.deletedAt ? " · deleted" : ""}</RecordCode></span> },
    { key: "bu", header: "BU · Sub BU", cell: (r) => <span className="flex items-center gap-1.5">{bu.get(r.businessUnitId) && <BuTag name={r.businessUnit.name} colourToken={bu.get(r.businessUnitId)!.colourToken} />}<span className="text-xs text-muted-foreground">{r.subBusinessUnit.name}</span></span> },
    { key: "oem", header: "OEM", cell: (r) => <span>{r.oem.name}{r.oem.isOwnIp && <NeutralPill className="ml-1 bg-selected text-selected-foreground">Own IP</NeutralPill>}</span>, hideBelow: "md" },
    { key: "model", header: "Model", cell: (r) => `${REVENUE_MODEL_LABEL[r.revenueModel]}${r.revenueModel === "ARR" && r.defaultTermMonths ? ` · ${r.defaultTermMonths} mo` : ""} · ${r.unit}`, hideBelow: "lg" },
    { key: "price", header: "List price", align: "right", cell: (r) => <Money value={r.listPrice} precise />, hideBelow: "sm" },
    { key: "cost", header: "Std cost", align: "right", cell: (r) => <Money value={r.standardCost} precise />, hideBelow: "lg" },
    { key: "actions", header: "", align: "right", cell: (r) => <span className="inline-flex gap-0.5">{!r.deletedAt && <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil /></Button>}{r.deletedAt ? <Button variant="ghost" size="icon-xs" aria-label={`Restore ${r.name}`} onClick={async () => { await api.post(`/admin/products/${r.id}/restore`); toast.success("Product restored"); router.refresh(); }}><RotateCcw /></Button> : <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" aria-label={`Delete ${r.name}`} onClick={() => setRemoving(r)}><Trash2 /></Button>}</span> },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <FilterBar className="mb-0" search={{ placeholder: "Search name or code…" }} filters={[{ key: "bu", label: "Business unit", options: L.businessUnits.map((b) => ({ value: b.id, label: b.name })) }, { key: "oem", label: "OEM", options: L.oems.map((o) => ({ value: o.id, label: o.name })) }, { key: "includeInactive", label: "Inactive", options: [{ value: "true", label: "Show inactive" }] }, { key: "includeDeleted", label: "Deleted", options: [{ value: "true", label: "Show deleted" }] }]} />
        <Button size="sm" onClick={() => setEditing("new")}><Plus /> New product</Button>
      </div>
      <div className="mt-4"><DataTable columns={columns} rows={rows} total={rows.length} dense empty={{ title: "No products match" }} /></div>
      {editing && <ProductDialog key={editing === "new" ? "new" : editing.id} row={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Delete ${removing?.name}?`} description="Existing deal lines keep it; it leaves the catalogue. You can restore it later." destructive confirmLabel="Delete" onConfirm={async () => { if (!removing) return; await api.del(`/admin/products/${removing.id}`); toast.success("Product deleted"); router.refresh(); }} />
    </>
  );
}

function ProductDialog({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const router = useRouter();
  const L = useLookups();
  const f = useForm({ name: row?.name ?? "", businessUnitId: row?.businessUnitId ?? null, subBusinessUnitId: row?.subBusinessUnitId ?? null, oemId: row?.oemId ?? null, unit: row?.unit ?? "Nos", revenueModel: (row?.revenueModel ?? "ONE_TIME") as "ONE_TIME" | "ARR", defaultTermMonths: row?.defaultTermMonths ? String(row.defaultTermMonths) : "", listPrice: row?.listPrice ?? "", standardCost: row?.standardCost ?? "", hsnSac: row?.hsnSac ?? "", isActive: row?.isActive ?? true });
  const subs = useMemo(() => L.subBusinessUnits.filter((s) => !f.values.businessUnitId || s.businessUnitId === f.values.businessUnitId), [L.subBusinessUnits, f.values.businessUnitId]);
  const save = () =>
    f.submit(async (v) => {
      const errs: Record<string, string> = {};
      if (v.name.trim().length < 2) errs.name = "Give it a name.";
      if (!v.businessUnitId) errs.businessUnitId = "Pick a business unit.";
      if (!v.subBusinessUnitId) errs.subBusinessUnitId = "Pick a Sub BU.";
      if (!v.oemId) errs.oemId = "Pick an OEM.";
      if (v.revenueModel === "ARR" && !(Number(v.defaultTermMonths) >= 1)) errs.defaultTermMonths = "Set a default term.";
      for (const k of ["listPrice", "standardCost"] as const) if (v[k] && !/^\d+(\.\d{1,2})?$/.test(v[k])) errs[k] = "Enter an amount.";
      if (Object.keys(errs).length) return f.setErrors(errs);
      const body = { name: v.name.trim(), businessUnitId: v.businessUnitId, subBusinessUnitId: v.subBusinessUnitId, oemId: v.oemId, unit: v.unit || "Nos", revenueModel: v.revenueModel, defaultTermMonths: v.revenueModel === "ARR" ? Number(v.defaultTermMonths) : null, listPrice: v.listPrice || null, standardCost: v.standardCost || null, hsnSac: v.hsnSac || null, isActive: v.isActive };
      if (row) await api.patch(`/admin/products/${row.id}`, body);
      else await api.post("/admin/products", body);
      toast.success(row ? "Product saved" : "Product added");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{row ? `Edit ${row.name}` : "New product"}</DialogTitle><DialogDescription>Lines created from this product take its business unit, Sub BU, OEM and defaults.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Name" htmlFor="p-name" error={f.errors.name} required><Input id="p-name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} autoFocus /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Business unit" htmlFor="p-bu" error={f.errors.businessUnitId} required><OptionSelect id="p-bu" value={f.values.businessUnitId} onChange={(v) => f.setValues((x) => ({ ...x, businessUnitId: v, subBusinessUnitId: null }))} options={L.businessUnits} invalid={!!f.errors.businessUnitId} /></Field>
            <Field label="Sub BU" htmlFor="p-sub" error={f.errors.subBusinessUnitId} required><OptionSelect id="p-sub" value={f.values.subBusinessUnitId} onChange={(v) => f.set("subBusinessUnitId", v)} options={subs} disabled={!f.values.businessUnitId} invalid={!!f.errors.subBusinessUnitId} /></Field>
            <Field label="OEM" htmlFor="p-oem" error={f.errors.oemId} required><OptionSelect id="p-oem" value={f.values.oemId} onChange={(v) => f.set("oemId", v)} options={L.oems} invalid={!!f.errors.oemId} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Revenue model" htmlFor="p-model">
              <ToggleGroup id="p-model" type="single" variant="outline" size="sm" value={f.values.revenueModel} onValueChange={(v) => v && f.set("revenueModel", v as "ONE_TIME" | "ARR")} className="justify-start"><ToggleGroupItem value="ONE_TIME">One-time</ToggleGroupItem><ToggleGroupItem value="ARR">ARR</ToggleGroupItem></ToggleGroup>
            </Field>
            {f.values.revenueModel === "ARR" && <Field label="Default term (months)" htmlFor="p-term" error={f.errors.defaultTermMonths}><Input id="p-term" inputMode="numeric" value={f.values.defaultTermMonths} onChange={(e) => f.set("defaultTermMonths", e.target.value)} /></Field>}
            <Field label="Unit" htmlFor="p-unit" error={f.errors.unit}><Input id="p-unit" value={f.values.unit} onChange={(e) => f.set("unit", e.target.value)} maxLength={20} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="List price (₹)" htmlFor="p-price" error={f.errors.listPrice}><Input id="p-price" inputMode="decimal" value={f.values.listPrice} onChange={(e) => f.set("listPrice", e.target.value)} /></Field>
            <Field label="Standard cost (₹)" htmlFor="p-cost" error={f.errors.standardCost} hint="Default cost for own-IP lines"><Input id="p-cost" inputMode="decimal" value={f.values.standardCost} onChange={(e) => f.set("standardCost", e.target.value)} /></Field>
            <Field label="HSN / SAC" htmlFor="p-hsn" error={f.errors.hsnSac}><Input id="p-hsn" value={f.values.hsnSac} onChange={(e) => f.set("hsnSac", e.target.value)} maxLength={10} /></Field>
          </div>
          <div className="flex items-center gap-2"><Switch id="p-active" checked={f.values.isActive} onCheckedChange={(v) => f.set("isActive", v)} /><label htmlFor="p-active" className="text-sm">Active (shown in the catalogue)</label></div>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>{row ? "Save" : "Add product"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
