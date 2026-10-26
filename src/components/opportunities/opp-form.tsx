"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Save, Loader2, Plus, Trash2, Calculator, ArrowRight } from "lucide-react";
import { ProductPicker } from "@/components/opportunities/product-picker";
import type { ProductOption } from "@/server/queries/options";
import { billingPeriods, type BillingFrequencyKey } from "@/lib/boq";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createOpportunity, updateOpportunity } from "@/server/actions/opportunities";
import {
  STAGE_META, FORECAST_LABEL, ACCOUNT_TYPE_LABEL, REVENUE_MODEL_LABEL, DEAL_TYPE_LABEL, PROCUREMENT_LABEL,
  DEAL_REG_LABEL, BILLING_FREQUENCY_LABEL, type StageKey,
} from "@/lib/constants";
import { defaultForecast } from "@/lib/rules/evaluate";
import { inr } from "@/lib/format";

type Opt = { id: string; name: string };
export type OppFormValues = Record<string, string>;
export type AccountOpt = { id: string; name: string; accountType: "NEW_LOGO" | "EXISTING"; contacts: { id: string; name: string; title: string | null }[] };

/** A line on the New opportunity form: a catalogue product, or a quick estimate (OEM + category + total value). */
type Draft = {
  key: string;
  kind: "product" | "estimate";
  productId: string;
  quantity: number;
  unitPrice: number | null;
  oemId: string;
  categoryId: string;
  value: number | null;
  billingFrequency: BillingFrequencyKey;
  termMonths: number | null;
};
let draftSeq = 0;

export function OppForm({
  mode, id, initial, accounts, options, canReassign, currentUserId, existingLineCount = 0,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: OppFormValues;
  accounts: AccountOpt[];
  options: {
    bus: Opt[]; categories: (Opt & { buId: string; buName?: string })[]; oems: Opt[]; oemTbd?: Opt | null; sales: Opt[]; presales: Opt[];
    leadSources: string[]; competitors: string[]; lossReasons: string[]; products: ProductOption[];
  };
  canReassign: boolean;
  currentUserId: string;
  existingLineCount?: number;
}) {
  const router = useRouter();
  const [v, setV] = useState<OppFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const account = accounts.find((a) => a.id === v.accountId);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const productById = useMemo(() => new Map(options.products.map((p) => [p.id, p])), [options.products]);
  const nameOf = (xs: Opt[], id: string) => xs.find((x) => x.id === id)?.name ?? "";
  const draftValue = (d: Draft) => {
    if (d.kind === "estimate") return d.value ?? 0;
    const p = productById.get(d.productId);
    return p ? d.quantity * billingPeriods({ billingFrequency: d.billingFrequency, termMonths: d.termMonths }) * (d.unitPrice ?? p.listPrice ?? 0) : 0;
  };
  const derived = useMemo(() => {
    let amount = 0;
    let top: { value: number; label: string } | null = null;
    for (const d of drafts) {
      const value = draftValue(d);
      amount += value;
      let label: string | null = null;
      if (d.kind === "product") {
        const p = productById.get(d.productId);
        if (p) label = `${p.buName} / ${p.categoryName} · ${p.oemName}`;
      } else if (d.oemId && d.categoryId) {
        const c = options.categories.find((x) => x.id === d.categoryId);
        label = `${c?.buName ?? nameOf(options.bus, c?.buId ?? "")} / ${c?.name ?? ""} · ${nameOf([...options.oems, ...(options.oemTbd ? [options.oemTbd] : [])], d.oemId)}`;
      }
      if (label && (!top || value > top.value)) top = { value, label };
    }
    return { amount: Math.round(amount), top: top?.label ?? null };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, productById, options]);
  const newDraft = (kind: Draft["kind"]): Draft => ({
    key: `d${++draftSeq}`, kind, productId: "", quantity: 1, unitPrice: null, oemId: "", categoryId: "", value: null,
    billingFrequency: "ONE_TIME", termMonths: null,
  });
  const categoryGroups = useMemo(() => {
    const m = new Map<string, (Opt & { buId: string })[]>();
    for (const c of options.categories) {
      const g = c.buName ?? nameOf(options.bus, c.buId);
      m.set(g, [...(m.get(g) ?? []), c]);
    }
    return [...m.entries()];
     
  }, [options.categories, options.bus]);
  const stage = v.stage as StageKey;
  // New deals enter at the top of the funnel; after that the stage moves only through the stage bar and workflow
  const stages: StageKey[] = ["IDENTIFIED", "QUALIFIED"];
  const commitAllowed = stage === "PROPOSAL" || stage === "NEGOTIATION";
  const today = new Date().toISOString().slice(0, 10);
  const arr = v.revenueModel === "ARR";
  const tender = v.procurementMode === "RFP" || v.procurementMode === "TENDER";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val ?? "");
    if (mode === "create") {
      if (!drafts.length) return void toast.error("Add at least one line item: a product, or a quick estimate with OEM, category and value.");
      if (drafts.some((d) => d.kind === "product" && !d.productId)) return void toast.error("Choose a product on every product line, or remove the empty line.");
      if (drafts.some((d) => d.kind === "estimate" && (!d.oemId || !d.categoryId || !d.value)))
        return void toast.error("Each quick estimate needs an OEM, a category and a value.");
      fd.set(
        "lines",
        JSON.stringify(
          drafts.map((d) =>
            d.kind === "product"
              ? { kind: "product", productId: d.productId, quantity: d.quantity, unitPrice: d.unitPrice, billingFrequency: d.billingFrequency, termMonths: d.termMonths }
              : { kind: "estimate", oemId: d.oemId, categoryId: d.categoryId, value: d.value, billingFrequency: d.billingFrequency, termMonths: d.termMonths },
          ),
        ),
      );
    }
    start(async () => {
      const r = mode === "create" ? await createOpportunity(fd) : await updateOpportunity(id!, fd);
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        toast.error(r.error);
        return;
      }
      if (r.warning) toast.warning(r.warning);
      toast.success(mode === "create" ? "Opportunity created" : "Changes saved");
      const newId = mode === "create" ? (r.data as { id: string }).id : id!;
      router.push(`/opportunities/${newId}`);
      router.refresh();
    });
  }

  const text = (name: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <Input id={name} value={v[name] ?? ""} onChange={(e) => set(name, e.target.value)} aria-invalid={!!errors[name]} {...props} />
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Section title="Opportunity" description="What are we selling, to whom">
        <Field htmlFor="name" error={errors.name} label="Opportunity name" required hint="Convention: <Account> - <Solution>, e.g. Zenith - DC Server Refresh" className="sm:col-span-2">
          {text("name", { placeholder: "Account - Solution", autoFocus: mode === "create" })}
        </Field>
        <Field htmlFor="accountId" error={errors.accountId} label="Account" required>
          <Select
            id="accountId"
            value={v.accountId}
            onChange={(e) => {
              const a = accounts.find((x) => x.id === e.target.value);
              setV((x) => ({ ...x, accountId: e.target.value, accountType: a?.accountType ?? x.accountType, primaryContactId: a?.contacts[0]?.id ?? "" }));
            }}
          >
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="primaryContactId" error={errors.primaryContactId} label="Primary contact">
          <Select id="primaryContactId" value={v.primaryContactId} onChange={(e) => set("primaryContactId", e.target.value)} disabled={!account}>
            <option value="">None</option>
            {account?.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Primary BU / category / OEM" hint="From the largest line item. OEMs live on line items, so a deal can span several." className="sm:col-span-3">
          <div className="flex h-9 items-center rounded-lg border border-dashed border-border px-2.5 text-[13px] text-ink-2">
            {mode === "create"
              ? (derived.top ?? <span className="text-ink-3">Add a line item below</span>)
              : `${nameOf(options.bus, v.businessUnitId)} / ${nameOf(options.categories, v.categoryId)} · ${nameOf([...options.oems, ...(options.oemTbd ? [options.oemTbd] : [])], v.oemId) || "—"}`}
          </div>
        </Field>
        <Field htmlFor="accountType" error={errors.accountType} label="Account type" required hint="Defaults from the account">
          <Select id="accountType" value={v.accountType} onChange={(e) => set("accountType", e.target.value)}>
            {Object.entries(ACCOUNT_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field htmlFor="dealType" error={errors.dealType} label="Deal type">
          <Select id="dealType" value={v.dealType} onChange={(e) => set("dealType", e.target.value)}>
            {Object.entries(DEAL_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field htmlFor="leadSource" error={errors.leadSource} label="Lead source">
          <Select id="leadSource" value={v.leadSource} onChange={(e) => set("leadSource", e.target.value)}>
            <option value="">Select</option>
            {options.leadSources.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </Section>

      {mode === "create" ? (
        <Section
          title="Line items"
          description="At least one. Pick products from the catalogue, or add a quick estimate (OEM, category, value) that presales replaces with products later. A deal can span several OEMs and BUs."
        >
          <div className="flex flex-col gap-2 sm:col-span-3">
            {drafts.map((d, i) => {
              const upd = (patch: Partial<Draft>) => setDrafts((xs) => xs.map((x) => (x.key === d.key ? { ...x, ...patch } : x)));
              const p = d.kind === "product" ? productById.get(d.productId) : undefined;
              const billing = (
                <div className="flex gap-1">
                  <Select
                    value={d.billingFrequency}
                    onChange={(e) => { const f = e.target.value as BillingFrequencyKey; upd({ billingFrequency: f, termMonths: f === "ONE_TIME" ? null : d.termMonths ?? (Number(v.contractTermMonths) || 12) }); }}
                    className="min-w-0 flex-1 text-xs"
                    aria-label={`New line ${i + 1} billing`}
                  >
                    {Object.entries(BILLING_FREQUENCY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </Select>
                  {d.billingFrequency !== "ONE_TIME" && (
                    <Input type="number" min={1} value={d.termMonths ?? 12} onChange={(e) => upd({ termMonths: Number(e.target.value) || 12 })} className="w-14 px-1 text-right text-xs tabular" title="Term (months)" aria-label={`New line ${i + 1} term`} />
                  )}
                </div>
              );
              const removeBtn = (
                <button type="button" onClick={() => setDrafts((xs) => xs.filter((x) => x.key !== d.key))} className="justify-self-end rounded p-1.5 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer" aria-label={`Remove line ${i + 1}`}>
                  <Trash2 className="size-3.5" />
                </button>
              );
              return (
                <div key={d.key} className="rounded-lg border border-border p-2.5">
                  <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-ink-3">
                    <span className="tabular">Line {i + 1}</span>
                    <span className={d.kind === "estimate" ? "rounded bg-[var(--t-amber-bg)] px-1.5 text-[var(--t-amber)] normal-case tracking-normal" : "rounded bg-surface-2 px-1.5 normal-case tracking-normal"}>
                      {d.kind === "estimate" ? "Quick estimate" : "Product"}
                    </span>
                    <span className="ml-auto text-[13px] font-semibold normal-case tracking-normal text-ink tabular">{inr(draftValue(d))}</span>
                  </div>
                  {d.kind === "product" ? (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_72px_150px_130px_32px] md:items-center">
                      <ProductPicker
                        products={options.products}
                        value={d.productId || null}
                        allowCustom={false}
                        onChange={(prod) => prod && upd({ productId: prod.id, billingFrequency: prod.billingFrequency, termMonths: prod.billingFrequency === "ONE_TIME" ? null : Number(v.contractTermMonths) || prod.defaultTermMonths || 12 })}
                      />
                      <Input type="number" min={1} value={d.quantity} onChange={(e) => upd({ quantity: Math.max(1, Number(e.target.value) || 1) })} className="text-right tabular" aria-label={`New line ${i + 1} quantity`} title="Quantity" />
                      {billing}
                      <Input type="number" min={0} value={d.unitPrice ?? ""} placeholder={p?.listPrice?.toLocaleString("en-IN") ?? "Unit price"} onChange={(e) => upd({ unitPrice: e.target.value === "" ? null : Number(e.target.value) })} className="text-right tabular" aria-label={`New line ${i + 1} unit price`} title="Estimated unit price (blank uses list price)" />
                      {removeBtn}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_150px_130px_32px] md:items-center">
                      <Select value={d.oemId} onChange={(e) => upd({ oemId: e.target.value })} aria-label={`New line ${i + 1} OEM`}>
                        <option value="">OEM</option>
                        {options.oemTbd && <option value={options.oemTbd.id}>{options.oemTbd.name}</option>}
                        {options.oems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                      </Select>
                      <Select value={d.categoryId} onChange={(e) => upd({ categoryId: e.target.value })} aria-label={`New line ${i + 1} category`}>
                        <option value="">Business unit · category</option>
                        {categoryGroups.map(([bu, cs]) => (
                          <optgroup key={bu} label={bu}>
                            {cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </optgroup>
                        ))}
                      </Select>
                      {billing}
                      <Input type="number" min={0} step={1000} value={d.value ?? ""} placeholder="Total value ₹" onChange={(e) => upd({ value: e.target.value === "" ? null : Number(e.target.value) })} className="text-right tabular" aria-label={`New line ${i + 1} value`} title="Estimated total value over the term" />
                      {removeBtn}
                    </div>
                  )}
                </div>
              );
            })}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => setDrafts((xs) => [...xs, newDraft("product")])}>
                <Plus /> Add product
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDrafts((xs) => [...xs, newDraft("estimate")])}>
                <Calculator /> Quick estimate
              </Button>
              {drafts.length > 0 && <span className="ml-auto text-[13px] text-ink-2">Deal value <span className="font-semibold tabular text-ink">{inr(derived.amount)}</span></span>}
            </div>
          </div>
        </Section>
      ) : (
        <Section title="Line items" description="OEM, business unit and value come from the line items.">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
            <p className="text-[13px] text-ink-2">
              {existingLineCount} line item{existingLineCount === 1 ? "" : "s"} · deal value <span className="font-semibold tabular text-ink">{inr(v.amount)}</span>
            </p>
            <Button asChild size="sm"><Link href={`/opportunities/${id}?tab=boq`}>Edit line items <ArrowRight /></Link></Button>
          </div>
        </Section>
      )}

      <Section title="Commercials" description="Value, revenue model and margin">
        <Field htmlFor="revenueModel" error={errors.revenueModel} label="Revenue model" required>
          <Select id="revenueModel" value={v.revenueModel} onChange={(e) => set("revenueModel", e.target.value)}>
            {Object.entries(REVENUE_MODEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label={arr ? "Total contract value" : "Deal value"} hint={mode === "create" ? "Sum of the line items" : "Rolls up from the line items"}>
          <div className="flex h-9 items-center rounded-lg border border-dashed border-border px-2.5 text-[13px] font-medium tabular">
            {inr(mode === "create" ? derived.amount : v.amount)}
          </div>
        </Field>
        {arr && (
          <>
            <Field htmlFor="contractTermMonths" error={errors.contractTermMonths} label="Contract term (months)" required>
              <Select id="contractTermMonths" value={v.contractTermMonths} onChange={(e) => set("contractTermMonths", e.target.value)}>
                <option value="">Select</option>
                {[12, 24, 36, 48, 60].map((m) => <option key={m} value={m}>{m} months</option>)}
              </Select>
            </Field>
            <Field htmlFor="arrAmount" error={errors.arrAmount} label="Annual recurring value (INR)" hint={v.amount && v.contractTermMonths ? `Auto: ${inr(Number(v.amount) / (Number(v.contractTermMonths) / 12))} if left blank` : "Auto-calculated if left blank"}>
              {text("arrAmount", { type: "number", min: 0, step: 1000 })}
            </Field>
            <Field htmlFor="contractStartDate" error={errors.contractStartDate} label="Contract start">{text("contractStartDate", { type: "date" })}</Field>
          </>
        )}
        <Field htmlFor="expectedMarginPct" error={errors.expectedMarginPct} label="Expected gross margin %" hint="Replaced by the priced BOQ margin once available">
          {text("expectedMarginPct", { type: "number", step: 0.5, min: -50, max: 90 })}
        </Field>
        <Field htmlFor="competitors" error={errors.competitors} label="Competition">
          <Select id="competitors" value={v.competitors} onChange={(e) => set("competitors", e.target.value)}>
            <option value="">Unknown / none</option>
            {options.competitors.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </Section>

      <Section title="Pipeline" description="Stage, forecast and timing">
        {mode === "create" ? (
          <Field htmlFor="stage" error={errors.stage} label="Stage" required hint={stage === "QUALIFIED" ? "Needs a customer contact" : "Later stages are reached through the process"}>
            <Select
              id="stage"
              value={v.stage}
              onChange={(e) => {
                const s = e.target.value as StageKey;
                setV((x) => ({ ...x, stage: s, probability: String(STAGE_META[s].probability), forecastCategory: defaultForecast(s) }));
              }}
            >
              {stages.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
            </Select>
          </Field>
        ) : (
          <Field label="Stage" hint="Change it from the stage bar on the deal">
            <p className="flex h-9 items-center text-[13px]">{STAGE_META[stage].label} · {v.probability}% probability</p>
          </Field>
        )}
        <Field htmlFor="forecastCategory" error={errors.forecastCategory} label="Forecast category" required hint={commitAllowed ? undefined : "Commit needs a quote with the customer"}>
          <Select id="forecastCategory" value={v.forecastCategory} onChange={(e) => set("forecastCategory", e.target.value)}>
            {Object.entries(FORECAST_LABEL).map(([k, l]) => <option key={k} value={k} disabled={k === "COMMIT" && !commitAllowed && v.forecastCategory !== "COMMIT"}>{l}</option>)}
          </Select>
        </Field>
        <Field htmlFor="expectedCloseDate" error={errors.expectedCloseDate} label="Expected close date" required hint={mode === "edit" ? "Pushing this out counts as a slip" : undefined}>
          {text("expectedCloseDate", { type: "date", min: today })}
        </Field>
        <Field htmlFor="nextStep" error={errors.nextStep} label="Next step" className="sm:col-span-2">{text("nextStep", { placeholder: "e.g. Solution walkthrough with CIO" })}</Field>
        <Field htmlFor="nextStepDate" error={errors.nextStepDate} label="Next step date">{text("nextStepDate", { type: "date", min: today })}</Field>
        {stage === "WON" && (
          <>
            <Field htmlFor="poNumber" error={errors.poNumber} label="Customer PO number" required>{text("poNumber")}</Field>
            <Field htmlFor="poDate" error={errors.poDate} label="PO date" required>{text("poDate", { type: "date" })}</Field>
          </>
        )}
        {(stage === "LOST" || stage === "DROPPED") && (
          <>
            <Field htmlFor="lossReason" error={errors.lossReason} label="Loss reason" required>
              <Select id="lossReason" value={v.lossReason} onChange={(e) => set("lossReason", e.target.value)}>
                <option value="">Select</option>
                {options.lossReasons.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field htmlFor="lossNotes" error={errors.lossNotes} label="Loss notes" className="sm:col-span-2">{text("lossNotes")}</Field>
          </>
        )}
      </Section>

      <Section title="Procurement" description="Tender timelines and OEM deal registration">
        <Field htmlFor="procurementMode" error={errors.procurementMode} label="Procurement mode">
          <Select id="procurementMode" value={v.procurementMode} onChange={(e) => set("procurementMode", e.target.value)}>
            {Object.entries(PROCUREMENT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        {tender && <Field htmlFor="submissionDueDate" error={errors.submissionDueDate} label="Bid submission due" required>{text("submissionDueDate", { type: "date" })}</Field>}
        <Field htmlFor="dealRegStatus" error={errors.dealRegStatus} label="OEM deal registration">
          <Select id="dealRegStatus" value={v.dealRegStatus} onChange={(e) => set("dealRegStatus", e.target.value)}>
            {Object.entries(DEAL_REG_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        {v.dealRegStatus !== "NOT_REQUIRED" && (
          <>
            <Field htmlFor="dealRegNumber" error={errors.dealRegNumber} label="Deal reg number" required={v.dealRegStatus === "APPROVED"}>{text("dealRegNumber")}</Field>
            <Field htmlFor="dealRegExpiry" error={errors.dealRegExpiry} label="Deal reg expiry">{text("dealRegExpiry", { type: "date" })}</Field>
          </>
        )}
      </Section>

      <Section title="Team" description="Ownership">
        <Field htmlFor="salesOwnerId" error={errors.salesOwnerId} label="Sales person" required hint={!canReassign ? "Only managers can reassign" : undefined}>
          <Select id="salesOwnerId" value={v.salesOwnerId || currentUserId} onChange={(e) => set("salesOwnerId", e.target.value)} disabled={!canReassign}>
            {options.sales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="presalesOwnerId" error={errors.presalesOwnerId} label="Presales owner" hint="Prefer 'Pull in presales' on the deal to notify them">
          <Select id="presalesOwnerId" value={v.presalesOwnerId} onChange={(e) => set("presalesOwnerId", e.target.value)}>
            <option value="">Not assigned</option>
            {options.presales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="description" error={errors.description} label="Description" className="sm:col-span-3">
          <Textarea id="description" value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Customer context, pain points, decision process" />
        </Field>
      </Section>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button type="button" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {mode === "create" ? "Create opportunity" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card className="grid gap-4 p-5 md:grid-cols-[220px_1fr]">
      <div>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">{children}</div>
    </Card>
  );
}
