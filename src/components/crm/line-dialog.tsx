"use client";
import { useCallback, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Field, FormError, OptionSelect } from "./form";
import { Combobox, type ComboOption } from "./combobox";
import { useLookups } from "./providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import type { LineField } from "@/domain/lines";
import type { ProductRow } from "@/server/services/products";

/** What one line looks like in the editor; strings so the inputs stay controlled. */
export type LineDraft = {
  id?: string; productId: string | null; productLabel?: string; description: string; businessUnitId: string | null; subBusinessUnitId: string | null; oemId: string | null;
  quantity: string; unit: string; revenueModel: "ONE_TIME" | "ARR"; termMonths: string; unitSalesPrice: string; unitPurchaseCost: string; salesMethodId: string | null;
};

export const emptyLine = (): LineDraft => ({ productId: null, description: "", businessUnitId: null, subBusinessUnitId: null, oemId: null, quantity: "1", unit: "Nos", revenueModel: "ONE_TIME", termMonths: "", unitSalesPrice: "", unitPurchaseCost: "", salesMethodId: null });

/** The API shape of a draft. Blank money fields become null; term only for ARR. */
export function lineToInput(l: LineDraft) {
  return {
    id: l.id,
    productId: l.productId,
    description: l.description,
    businessUnitId: l.businessUnitId ?? undefined,
    subBusinessUnitId: l.subBusinessUnitId ?? undefined,
    oemId: l.oemId ?? undefined,
    quantity: l.quantity,
    unit: l.unit || undefined,
    revenueModel: l.revenueModel,
    termMonths: l.revenueModel === "ARR" && l.termMonths ? Number(l.termMonths) : null,
    unitSalesPrice: l.unitSalesPrice === "" ? null : l.unitSalesPrice,
    unitPurchaseCost: l.unitPurchaseCost === "" ? null : l.unitPurchaseCost,
    salesMethodId: l.salesMethodId,
  };
}

/**
 * Add or edit one opportunity line. `editable` says which groups the actor may change: spec (what is sold),
 * price (sales price), cost (purchase cost). `onSave` gets the draft; the caller stores it or sends it to the API.
 */
export function LineDialog({ open, onOpenChange, initial, editable, onSave, title }: { open: boolean; onOpenChange: (o: boolean) => void; initial?: LineDraft; editable: Set<LineField>; onSave: (line: LineDraft) => Promise<void>; title?: string }) {
  const L = useLookups();
  const f = useForm<LineDraft>(initial ?? emptyLine());
  const spec = editable.has("spec");
  const [productLocked, setProductLocked] = useState(!!initial?.productId);
  const oem = L.oems.find((o) => o.id === f.values.oemId);
  const ownIp = !!oem?.isOwnIp;
  const subs = useMemo(() => L.subBusinessUnits.filter((s) => !f.values.businessUnitId || s.businessUnitId === f.values.businessUnitId), [L.subBusinessUnits, f.values.businessUnitId]);
  const loadProducts = useCallback(async (q: string) => {
    const r = await api.get<{ rows: ProductRow[] }>(`/products?q=${encodeURIComponent(q)}`);
    return r.rows.map((p) => ({ value: p.id, label: p.name, hint: `${p.oem.name} · ${p.subBusinessUnit.name}`, product: p }) as ComboOption & { product: ProductRow });
  }, []);
  const pickProduct = (id: string | null, option?: ComboOption) => {
    const p = (option as (ComboOption & { product?: ProductRow }) | undefined)?.product;
    f.setValues((v) => ({
      ...v, productId: id, productLabel: option?.label,
      ...(p ? { description: v.description || p.name, businessUnitId: p.businessUnitId, subBusinessUnitId: p.subBusinessUnitId, oemId: p.oemId, unit: p.unit, revenueModel: p.revenueModel, termMonths: p.defaultTermMonths ? String(p.defaultTermMonths) : v.termMonths, unitSalesPrice: v.unitSalesPrice || (p.listPrice ?? ""), salesMethodId: p.oem.isOwnIp ? null : v.salesMethodId } : {}),
    }));
    setProductLocked(!!id);
  };
  const save = async () => {
    const v = f.values;
    const errs: Record<string, string> = {};
    if (!v.description.trim()) errs.description = "Describe what is sold.";
    if (!v.businessUnitId) errs.businessUnitId = "Pick a business unit.";
    if (!v.subBusinessUnitId) errs.subBusinessUnitId = "Pick a Sub BU.";
    if (!v.oemId) errs.oemId = "Pick an OEM.";
    if (!/^\d+(\.\d{1,2})?$/.test(v.quantity) || Number(v.quantity) <= 0) errs.quantity = "Enter a quantity above zero.";
    if (v.revenueModel === "ARR" && !(Number(v.termMonths) >= 1 && Number(v.termMonths) <= 120)) errs.termMonths = "1 to 120 months.";
    if (v.unitSalesPrice && !/^\d+(\.\d{1,2})?$/.test(v.unitSalesPrice)) errs.unitSalesPrice = "Enter an amount.";
    if (v.unitPurchaseCost && !/^\d+(\.\d{1,2})?$/.test(v.unitPurchaseCost)) errs.unitPurchaseCost = "Enter an amount.";
    if (Object.keys(errs).length) return f.setErrors(errs);
    await f.submit(async (p) => {
      await onSave({ ...p, salesMethodId: ownIp ? null : p.salesMethodId, termMonths: p.revenueModel === "ARR" ? p.termMonths : "" });
      onOpenChange(false);
    });
  };
  const num = (id: keyof LineDraft, label: string, enabled: boolean, hint?: string) => (
    <Field label={label} htmlFor={`line-${id}`} error={f.errors[id]} hint={hint}>
      <Input id={`line-${id}`} inputMode="decimal" value={f.values[id] as string} onChange={(e) => f.set(id, e.target.value as never)} disabled={!enabled} aria-invalid={!!f.errors[id]} placeholder={enabled ? "" : "—"} />
    </Field>
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title ?? (initial?.id ? "Edit line" : "Add line")}</DialogTitle>
          <DialogDescription>{spec ? "Pick a catalogue product or describe a custom item. The business unit, Sub BU and OEM come from the product." : "You can change only the fields open to your role."}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          {spec && (
            <Field label="Catalogue product" htmlFor="line-product" hint="Leave empty for a custom line.">
              <Combobox id="line-product" value={f.values.productId} onChange={pickProduct} load={loadProducts} placeholder="Search the catalogue…" searchPlaceholder="Product name or code…" allowClear />
            </Field>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Description" htmlFor="line-description" error={f.errors.description} required className="sm:col-span-2">
              <Input id="line-description" value={f.values.description} onChange={(e) => f.set("description", e.target.value)} disabled={!spec} aria-invalid={!!f.errors.description} />
            </Field>
            <Field label="Business unit" htmlFor="line-bu" error={f.errors.businessUnitId} required>
              <OptionSelect id="line-bu" value={f.values.businessUnitId} onChange={(v) => f.setValues((x) => ({ ...x, businessUnitId: v, subBusinessUnitId: null }))} options={L.businessUnits} disabled={!spec || productLocked} invalid={!!f.errors.businessUnitId} />
            </Field>
            <Field label="Sub BU" htmlFor="line-sub" error={f.errors.subBusinessUnitId} required>
              <OptionSelect id="line-sub" value={f.values.subBusinessUnitId} onChange={(v) => f.set("subBusinessUnitId", v)} options={subs} disabled={!spec || productLocked || !f.values.businessUnitId} invalid={!!f.errors.subBusinessUnitId} placeholder={f.values.businessUnitId ? "Choose" : "Pick a business unit first"} />
            </Field>
            <Field label="OEM" htmlFor="line-oem" error={f.errors.oemId} required hint={ownIp ? "Own IP: no sales method." : undefined}>
              <OptionSelect id="line-oem" value={f.values.oemId} onChange={(v) => f.set("oemId", v)} options={L.oems} disabled={!spec || productLocked} invalid={!!f.errors.oemId} />
            </Field>
            <Field label="Sales method" htmlFor="line-sm" error={f.errors.salesMethodId}>
              <OptionSelect id="line-sm" value={ownIp ? null : f.values.salesMethodId} onChange={(v) => f.set("salesMethodId", v)} options={L.salesMethods} none="Not set" disabled={!editable.has("price") || ownIp} />
            </Field>
            {num("quantity", "Quantity", spec)}
            <Field label="Unit" htmlFor="line-unit"><Input id="line-unit" value={f.values.unit} onChange={(e) => f.set("unit", e.target.value)} disabled={!spec} maxLength={20} /></Field>
            <Field label="Revenue model" htmlFor="line-model">
              <ToggleGroup id="line-model" type="single" variant="outline" size="sm" value={f.values.revenueModel} onValueChange={(v) => v && f.set("revenueModel", v as "ONE_TIME" | "ARR")} disabled={!spec} className="justify-start">
                <ToggleGroupItem value="ONE_TIME">One-time</ToggleGroupItem>
                <ToggleGroupItem value="ARR">Recurring (ARR)</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            {f.values.revenueModel === "ARR" && num("termMonths", "Term (months)", spec, "Line value = annual value × term ÷ 12")}
            {editable.has("price") && num("unitSalesPrice", "Unit sales price (₹)", true)}
            {editable.has("cost") && num("unitPurchaseCost", "Unit purchase cost (₹)", true, ownIp ? "Own IP: the standard cost unless you set one." : undefined)}
          </div>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={f.pending}>{initial?.id ? "Save line" : "Add line"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
