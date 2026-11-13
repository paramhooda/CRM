"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/crm/data-table";
import { NeutralPill } from "@/components/crm/pills";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import type { LookupType } from "@/contracts/lookups";
import { cn } from "@/lib/utils";

export type LookupRow = { id: string; name: string; code?: string | null; isActive: boolean; sortOrder: number; colourToken?: string | null; businessUnitId?: string | null; needsPresales?: boolean; isOwnIp?: boolean; appliesTo?: "LOST" | "DROPPED" | "BOTH"; restrictedToSales?: boolean; requiredAtWon?: boolean };
type Bu = { id: string; name: string };

const COLOURS = [{ id: "bu-iti", name: "Blue" }, { id: "bu-cloud", name: "Green" }, { id: "bu-services", name: "Amber" }, { id: "bu-cyber", name: "Orange" }];
const APPLIES = [{ id: "BOTH", name: "Lost and dropped" }, { id: "LOST", name: "Lost only" }, { id: "DROPPED", name: "Dropped only" }];

/** One editor for every lookup table: name, order, active, plus the type's own fields. */
export function LookupEditor({ type, rows, businessUnits }: { type: LookupType; rows: LookupRow[]; businessUnits: Bu[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<LookupRow | "new" | null>(null);
  const buName = new Map(businessUnits.map((b) => [b.id, b.name]));
  const toggleActive = async (r: LookupRow) => {
    await api.patch(`/admin/lookups/${type}/${r.id}`, { isActive: !r.isActive });
    toast.success(r.isActive ? `${r.name} deactivated` : `${r.name} activated`);
    router.refresh();
  };
  const columns: Column<LookupRow>[] = [
    { key: "name", header: "Name", cell: (r) => <span className={cn(!r.isActive && "text-muted-foreground line-through")}>{r.name}</span> },
    ...(type === "business-units" ? ([{ key: "code", header: "Code", cell: (r) => r.code ?? "—" }, { key: "colour", header: "Colour", cell: (r) => <span className="flex items-center gap-2"><span className="size-3 rounded-sm" style={{ background: `var(--${r.colourToken ?? "muted"})` }} />{COLOURS.find((c) => c.id === r.colourToken)?.name ?? "—"}</span> }] as Column<LookupRow>[]) : []),
    ...(type === "sub-business-units" ? ([{ key: "bu", header: "Business unit", cell: (r) => buName.get(r.businessUnitId ?? "") ?? "—" }, { key: "presales", header: "Needs presales", cell: (r) => (r.needsPresales ? "Yes" : "No") }] as Column<LookupRow>[]) : []),
    ...(type === "oems" ? ([{ key: "own", header: "Own IP", cell: (r) => (r.isOwnIp ? <NeutralPill className="bg-selected text-selected-foreground">Own IP</NeutralPill> : "—") }] as Column<LookupRow>[]) : []),
    ...(type === "loss-reasons" ? ([{ key: "applies", header: "Applies to", cell: (r) => APPLIES.find((a) => a.id === r.appliesTo)?.name ?? "—" }] as Column<LookupRow>[]) : []),
    ...(type === "document-kinds" ? ([{ key: "flags", header: "Rules", cell: (r) => <span className="flex gap-1">{r.restrictedToSales && <NeutralPill>Sales only</NeutralPill>}{r.requiredAtWon && <NeutralPill>Required at Won</NeutralPill>}</span> }] as Column<LookupRow>[]) : []),
    { key: "order", header: "Order", align: "right", cell: (r) => r.sortOrder, hideBelow: "md" },
    { key: "active", header: "Active", cell: (r) => <Switch checked={r.isActive} onCheckedChange={() => toggleActive(r)} aria-label={`${r.name} active`} /> },
    { key: "edit", header: "", align: "right", cell: (r) => <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil /></Button> },
  ];
  return (
    <>
      <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setEditing("new")}><Plus /> Add value</Button></div>
      <DataTable columns={columns} rows={rows} total={rows.length} dense empty={{ title: "Nothing here yet", action: <Button size="sm" onClick={() => setEditing("new")}><Plus /> Add value</Button> }} />
      {editing && <LookupDialog key={editing === "new" ? "new" : editing.id} type={type} row={editing === "new" ? null : editing} businessUnits={businessUnits} nextOrder={(rows.at(-1)?.sortOrder ?? 0) + 10} onClose={() => setEditing(null)} />}
    </>
  );
}

function LookupDialog({ type, row, businessUnits, nextOrder, onClose }: { type: LookupType; row: LookupRow | null; businessUnits: Bu[]; nextOrder: number; onClose: () => void }) {
  const router = useRouter();
  const f = useForm({
    name: row?.name ?? "", sortOrder: String(row?.sortOrder ?? nextOrder), isActive: row?.isActive ?? true, code: row?.code ?? "", colourToken: row?.colourToken ?? "bu-iti", businessUnitId: row?.businessUnitId ?? null,
    needsPresales: row?.needsPresales ?? false, isOwnIp: row?.isOwnIp ?? false, appliesTo: (row?.appliesTo ?? "BOTH") as "LOST" | "DROPPED" | "BOTH", restrictedToSales: row?.restrictedToSales ?? false, requiredAtWon: row?.requiredAtWon ?? false,
  });
  const save = () =>
    f.submit(async (v) => {
      if (!v.name.trim()) return f.setErrors({ name: "Give it a name." });
      const body: Record<string, unknown> = { name: v.name.trim(), sortOrder: Number(v.sortOrder) || 0, isActive: v.isActive };
      if (type === "business-units") Object.assign(body, { code: v.code || undefined, colourToken: v.colourToken });
      if (type === "sub-business-units") Object.assign(body, { businessUnitId: v.businessUnitId ?? undefined, needsPresales: v.needsPresales });
      if (type === "oems") Object.assign(body, { isOwnIp: v.isOwnIp });
      if (type === "loss-reasons") Object.assign(body, { appliesTo: v.appliesTo });
      if (type === "document-kinds") Object.assign(body, { restrictedToSales: v.restrictedToSales, requiredAtWon: v.requiredAtWon });
      if (row) await api.patch(`/admin/lookups/${type}/${row.id}`, body);
      else await api.post(`/admin/lookups/${type}`, body);
      toast.success(row ? "Saved" : "Added");
      onClose();
      router.refresh();
    });
  const toggle = (id: keyof typeof f.values, label: string) => (
    <div className="flex items-center gap-2"><Switch id={`lk-${id}`} checked={!!f.values[id]} onCheckedChange={(v) => f.set(id, v as never)} /><label htmlFor={`lk-${id}`} className="text-sm">{label}</label></div>
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{row ? `Edit ${row.name}` : "Add value"}</DialogTitle><DialogDescription>Shown in dropdowns in this order while active.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Name" htmlFor="lk-name" error={f.errors.name} required><Input id="lk-name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} autoFocus /></Field>
          {type === "business-units" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Code" htmlFor="lk-code" error={f.errors.code}><Input id="lk-code" value={f.values.code} onChange={(e) => f.set("code", e.target.value.toUpperCase())} maxLength={8} /></Field>
              <Field label="Colour" htmlFor="lk-colour" error={f.errors.colourToken}><OptionSelect id="lk-colour" value={f.values.colourToken} onChange={(v) => f.set("colourToken", v ?? "bu-iti")} options={COLOURS} /></Field>
            </div>
          )}
          {type === "sub-business-units" && (
            <>
              <Field label="Business unit" htmlFor="lk-bu" error={f.errors.businessUnitId} required><OptionSelect id="lk-bu" value={f.values.businessUnitId} onChange={(v) => f.set("businessUnitId", v)} options={businessUnits} invalid={!!f.errors.businessUnitId} /></Field>
              {toggle("needsPresales", "Deals with this Sub BU need presales (BOQ stage) by default")}
            </>
          )}
          {type === "oems" && toggle("isOwnIp", "Progression's own IP (no sales method; presales sets the cost)")}
          {type === "loss-reasons" && <Field label="Applies to" htmlFor="lk-applies"><OptionSelect id="lk-applies" value={f.values.appliesTo} onChange={(v) => f.set("appliesTo", (v ?? "BOTH") as "LOST" | "DROPPED" | "BOTH")} options={APPLIES} /></Field>}
          {type === "document-kinds" && (
            <>
              {toggle("restrictedToSales", "Sales only (hidden from presales and purchase)")}
              {toggle("requiredAtWon", "Required before a deal can close as won")}
            </>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sort order" htmlFor="lk-order" error={f.errors.sortOrder}><Input id="lk-order" inputMode="numeric" value={f.values.sortOrder} onChange={(e) => f.set("sortOrder", e.target.value)} /></Field>
            <div className="self-end pb-2">{toggle("isActive", "Active")}</div>
          </div>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>{row ? "Save" : "Add"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
