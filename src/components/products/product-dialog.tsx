"use client";
import { useState } from "react";
import { Plus, Pencil, Power } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveProduct, toggleProduct } from "@/server/actions/products";
import { PRODUCT_TYPE_LABEL, BILLING_FREQUENCY_LABEL } from "@/lib/constants";

type Opt = { id: string; name: string };
export type ProductValues = Record<string, string>;

export function ProductDialog({
  id, initial, bus, categories, oems,
}: { id?: string; initial?: ProductValues; bus: Opt[]; categories: (Opt & { buId: string })[]; oems: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [bu, setBu] = useState(initial?.businessUnitId ?? "");
  const [freq, setFreq] = useState(initial?.billingFrequency ?? "ONE_TIME");
  const { pending, run } = useAction();
  const v = initial ?? {};
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? <Button size="icon-sm" variant="ghost" aria-label="Edit product"><Pencil /></Button> : <Button variant="primary"><Plus /> New product</Button>}
      </DialogTrigger>
      <DialogContent title={id ? "Edit product" : "New product"} description="Products feed deal line items. HSN/SAC and GST rate travel with every billed line." wide>
        <form
          className="grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            run(() => saveProduct(id ?? null, f), { success: id ? "Product updated" : "Product added", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="SKU" required error={errors.code}><Input name="code" defaultValue={v.code} className="font-mono uppercase" placeholder="DELL-SRV-01" /></Field>
          <Field label="Name" required error={errors.name} className="sm:col-span-2"><Input name="name" defaultValue={v.name} placeholder="Dell 2U Rack Server, 2x Xeon Gold" /></Field>
          <Field label="Business unit" required error={errors.businessUnitId}>
            <Select name="businessUnitId" value={bu} onChange={(e) => setBu(e.target.value)}>
              <option value="">Select</option>{bus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Category" required error={errors.categoryId}>
            <Select name="categoryId" defaultValue={v.categoryId ?? ""} key={bu}>
              <option value="">{bu ? "Select" : "Choose BU first"}</option>
              {categories.filter((c) => c.buId === bu).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="OEM" required error={errors.oemId}>
            <Select name="oemId" defaultValue={v.oemId ?? ""}><option value="">Select</option>{oems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</Select>
          </Field>
          <Field label="Type" required>
            <Select name="productType" defaultValue={v.productType ?? "HARDWARE"}>{Object.entries(PRODUCT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Unit" required><Input name="unit" defaultValue={v.unit ?? "Nos"} /></Field>
          <Field label="Billing" required>
            <Select name="billingFrequency" value={freq} onChange={(e) => setFreq(e.target.value)}>{Object.entries(BILLING_FREQUENCY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          {freq !== "ONE_TIME" && <Field label="Default term (months)" required error={errors.defaultTermMonths}><Input name="defaultTermMonths" type="number" min={1} defaultValue={v.defaultTermMonths ?? "12"} /></Field>}
          <Field label="List price (INR)" hint={freq !== "ONE_TIME" ? "Per billing period" : undefined}><Input name="listPrice" type="number" min={0} defaultValue={v.listPrice} /></Field>
          <Field label="Standard cost (INR)" error={errors.standardCost}><Input name="standardCost" type="number" min={0} defaultValue={v.standardCost} /></Field>
          <Field label="HSN / SAC" required error={errors.hsnSac} hint="HSN for goods, SAC for services"><Input name="hsnSac" defaultValue={v.hsnSac} className="font-mono" placeholder="84715000" /></Field>
          <Field label="GST %" required><Input name="gstRatePct" type="number" min={0} max={28} step="0.01" defaultValue={v.gstRatePct ?? "18"} /></Field>
          <Field label="Description" className="sm:col-span-3"><Textarea name="description" defaultValue={v.description} className="min-h-14" /></Field>
          <input type="hidden" name="active" value={v.active ?? "true"} />
          <div className="flex justify-end gap-2 sm:col-span-3">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ToggleProductButton({ id, active }: { id: string; active: boolean }) {
  const { pending, run } = useAction();
  return (
    <Button size="icon-sm" variant="ghost" disabled={pending} aria-label={active ? "Deactivate product" : "Activate product"} title={active ? "Deactivate" : "Activate"} onClick={() => run(() => toggleProduct(id), { success: active ? "Product deactivated" : "Product activated" })}>
      <Power style={{ color: active ? "var(--t-green)" : "var(--ink-3)" }} />
    </Button>
  );
}
