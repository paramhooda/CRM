"use client";
// New / edit opportunity. Asks only what sales knows at the start; everything else is derived or comes later in
// the process. Fields depend on earlier answers: contacts follow the account, deal types follow the account type,
// categories follow the business unit, OEMs follow the category, the bid date follows the procurement mode, deal
// registration follows the OEMs, and the contract term follows recurring billing.
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Save, Loader2, Plus, Trash2, ArrowRight, ChevronDown, Package, Wrench, ShoppingCart } from "lucide-react";
import { ProductPicker } from "@/components/opportunities/product-picker";
import type { ProductOption } from "@/server/queries/options";
import { billingPeriods, type BillingFrequencyKey } from "@/lib/boq";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { createOpportunity, updateOpportunity } from "@/server/actions/opportunities";
import { STAGE_META, FORECAST_LABEL, DEAL_TYPE_LABEL, PROCUREMENT_LABEL, DEAL_REG_LABEL, type StageKey } from "@/lib/constants";
import { dealTypesFor, dealTypeFor, suggestPresales, needsBidDate, dealRegOems, type AccountTypeKey } from "@/lib/deal-setup";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Opt = { id: string; name: string };
type OemOpt = Opt & { dealRegistration?: boolean };
type CatOpt = Opt & { buId: string; buName?: string; needsPresales?: boolean };
export type OppFormValues = Record<string, string>;
export type AccountOpt = { id: string; name: string; accountType: "NEW_LOGO" | "EXISTING"; contacts: { id: string; name: string; title: string | null }[] };

/** A line on the New opportunity form: an estimate (BU → category → OEM → value) or an exact catalogue product. */
type Draft = {
  key: string;
  kind: "product" | "estimate";
  productId: string;
  quantity: number;
  unitPrice: number | null;
  buId: string;
  categoryId: string;
  oemId: string;
  value: number | null;
  billingFrequency: BillingFrequencyKey;
  termMonths: number | null;
};
let draftSeq = 0;
const TERMS = [12, 24, 36, 48, 60];

export function OppForm({
  mode, id, initial, accounts, options, canReassign, currentUserId, existingLineCount = 0, lineOemIds = [], openPresales = false,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: OppFormValues;
  accounts: AccountOpt[];
  options: {
    bus: Opt[]; categories: CatOpt[]; oems: OemOpt[]; oemTbd?: Opt | null; sales: Opt[]; presales: Opt[];
    leadSources: string[]; competitors: string[]; lossReasons: string[]; products: ProductOption[];
  };
  canReassign: boolean;
  currentUserId: string;
  existingLineCount?: number;
  /** Edit mode: OEMs on the deal's lines, which decide whether deal registration applies */
  lineOemIds?: string[];
  /** Edit mode: presales is working on the deal, so it cannot be switched to resale */
  openPresales?: boolean;
}) {
  const router = useRouter();
  const [v, setV] = useState<OppFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const account = accounts.find((a) => a.id === v.accountId);
  const accountType = (account?.accountType ?? v.accountType ?? "NEW_LOGO") as AccountTypeKey;
  const productById = useMemo(() => new Map(options.products.map((p) => [p.id, p])), [options.products]);
  const newDraft = (kind: Draft["kind"]): Draft => ({
    key: `d${++draftSeq}`, kind, productId: "", quantity: 1, unitPrice: null, buId: "", categoryId: "", oemId: "", value: null,
    billingFrequency: "ONE_TIME", termMonths: null,
  });
  const [drafts, setDrafts] = useState<Draft[]>(() => (mode === "create" ? [newDraft("estimate")] : []));
  const [showMore, setShowMore] = useState(mode === "edit" && !!(v.leadSource || v.competitors || v.description));
  // Presales: suggested from the categories until the person chooses
  const [presalesChosen, setPresalesChosen] = useState(mode === "edit");

  // Catalogue OEMs per category, so the OEM list follows the category
  const oemsByCategory = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const p of options.products) m.set(p.categoryId, (m.get(p.categoryId) ?? new Set()).add(p.oemId));
    return m;
  }, [options.products]);

  const draftValue = (d: Draft) => {
    if (d.kind === "estimate") return d.value ?? 0;
    const p = productById.get(d.productId);
    return p ? d.quantity * billingPeriods({ billingFrequency: d.billingFrequency, termMonths: d.termMonths }) * (d.unitPrice ?? p.listPrice ?? 0) : 0;
  };
  const total = Math.round(drafts.reduce((a, d) => a + draftValue(d), 0));
  const draftCategoryIds = drafts.map((d) => (d.kind === "estimate" ? d.categoryId : productById.get(d.productId)?.categoryId ?? "")).filter(Boolean);
  const draftOemIds = drafts.map((d) => (d.kind === "estimate" ? d.oemId : productById.get(d.productId)?.oemId ?? "")).filter(Boolean);
  const suggested = suggestPresales(draftCategoryIds, options.categories.map((c) => ({ id: c.id, needsPresales: !!c.needsPresales })));
  const presalesRequired = mode === "create" && !presalesChosen ? suggested : v.presalesRequired === "true";
  const solutionCats = options.categories.filter((c) => c.needsPresales && draftCategoryIds.includes(c.id)).map((c) => c.name);
  const regOems = dealRegOems(mode === "create" ? draftOemIds : lineOemIds, options.oems);
  const stage = v.stage as StageKey;
  const commitAllowed = stage === "PROPOSAL" || stage === "NEGOTIATION";
  const today = new Date().toISOString().slice(0, 10);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val ?? "");
    fd.set("presalesRequired", String(presalesRequired));
    fd.set("dealType", dealTypeFor(accountType, v.dealType));
    if (!needsBidDate(v.procurementMode)) fd.set("submissionDueDate", "");
    if (!regOems.length && mode === "create") fd.set("dealRegStatus", "NOT_REQUIRED");
    if (mode === "create") {
      fd.set("stage", "IDENTIFIED");
      fd.set("forecastCategory", "PIPELINE");
      const lines = drafts.filter((d) => d.kind === "product" ? d.productId : d.buId || d.categoryId || d.oemId || d.value);
      if (!lines.length) return void toast.error("Add what is being sold: a business unit, category, OEM and value.");
      if (lines.some((d) => d.kind === "estimate" && (!d.categoryId || !d.oemId || !d.value)))
        return void toast.error("Each line needs a category, an OEM (or To be decided) and a value.");
      fd.set(
        "lines",
        JSON.stringify(
          lines.map((d) =>
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
  const upd = (key: string, patch: Partial<Draft>) => setDrafts((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const billing = (d: Draft, i: number) => (
    <div className="flex gap-1">
      <Select
        value={d.billingFrequency === "ONE_TIME" ? "ONE_TIME" : "RECURRING"}
        onChange={(e) => upd(d.key, e.target.value === "ONE_TIME" ? { billingFrequency: "ONE_TIME", termMonths: null } : { billingFrequency: "MONTHLY", termMonths: d.termMonths ?? 36 })}
        aria-label={`Line ${i + 1} billing`}
        className="min-w-0 flex-1"
      >
        <option value="ONE_TIME">One-time</option>
        <option value="RECURRING">Recurring</option>
      </Select>
      {d.billingFrequency !== "ONE_TIME" && (
        <Select value={String(d.termMonths ?? 36)} onChange={(e) => upd(d.key, { termMonths: Number(e.target.value) })} aria-label={`Line ${i + 1} term`} className="w-[108px] shrink-0">
          {TERMS.map((t) => <option key={t} value={t}>{t} months</option>)}
        </Select>
      )}
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Section title="Customer">
        <Field htmlFor="accountId" error={errors.accountId} label="Account" required>
          <Select
            id="accountId"
            value={v.accountId}
            onChange={(e) => {
              const a = accounts.find((x) => x.id === e.target.value);
              setV((x) => ({ ...x, accountId: e.target.value, accountType: a?.accountType ?? x.accountType, primaryContactId: a?.contacts[0]?.id ?? "", dealType: "" }));
            }}
          >
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="primaryContactId" error={errors.primaryContactId} label="Customer contact" hint={account && !account.contacts.length ? "No contacts on this account yet" : "Needed before the deal is qualified"}>
          <Select id="primaryContactId" value={v.primaryContactId} onChange={(e) => set("primaryContactId", e.target.value)} disabled={!account}>
            <option value="">{account ? "None yet" : "Choose the account first"}</option>
            {account?.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ""}</option>)}
          </Select>
        </Field>
        <Field label="Deal type" hint={accountType === "NEW_LOGO" ? "A new customer is always new business" : "Existing customer"}>
          {accountType === "NEW_LOGO" ? (
            <p className="flex h-9 items-center text-[13px]">New logo · New business</p>
          ) : (
            <Segmented
              label="Deal type"
              value={dealTypeFor(accountType, v.dealType)}
              onChange={(t) => set("dealType", t)}
              options={dealTypesFor(accountType).map((t) => ({ value: t, label: DEAL_TYPE_LABEL[t] }))}
              className="h-9 w-fit max-w-full items-center overflow-x-auto [&_button]:whitespace-nowrap [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[13px]"
            />
          )}
        </Field>
      </Section>

      <Section title="Opportunity">
        <Field htmlFor="name" error={errors.name} label="Opportunity name" required className="sm:col-span-2">
          {text("name", { placeholder: account ? `${account.name.split(" ")[0]} - Solution, e.g. DC Server Refresh` : "Account - Solution", autoFocus: mode === "create" })}
        </Field>
        <Field htmlFor="expectedCloseDate" error={errors.expectedCloseDate} label="Expected close" required hint={mode === "edit" ? "Pushing it out counts as a slip" : undefined}>
          {text("expectedCloseDate", { type: "date", min: today })}
        </Field>
        <Field htmlFor="nextStep" error={errors.nextStep} label="Next step" className="sm:col-span-2">{text("nextStep", { placeholder: "e.g. Requirement call with the IT head" })}</Field>
        <Field htmlFor="nextStepDate" error={errors.nextStepDate} label="Next step date">{text("nextStepDate", { type: "date", min: today })}</Field>
        {mode === "edit" && (
          <>
            <Field label="Stage" hint="Moves through the stage bar on the deal">
              <p className="flex h-9 items-center text-[13px]">{STAGE_META[stage].label} · {v.probability}%</p>
            </Field>
            <Field htmlFor="forecastCategory" error={errors.forecastCategory} label="Forecast" hint={commitAllowed ? undefined : "Commit needs a quote with the customer"}>
              <Select id="forecastCategory" value={v.forecastCategory} onChange={(e) => set("forecastCategory", e.target.value)}>
                {Object.entries(FORECAST_LABEL).map(([k, l]) => <option key={k} value={k} disabled={k === "COMMIT" && !commitAllowed && v.forecastCategory !== "COMMIT"}>{l}</option>)}
              </Select>
            </Field>
          </>
        )}
      </Section>

      {mode === "create" ? (
        <Section stacked title="What's being sold" description="A rough split by business unit, category and OEM is enough. Exact products come later from presales or the catalogue.">
          <div className="flex flex-col gap-2 sm:col-span-3">
            {drafts.map((d, i) => {
              const remove = drafts.length > 1 && (
                <button type="button" onClick={() => setDrafts((xs) => xs.filter((x) => x.key !== d.key))} className="justify-self-end rounded p-1.5 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer" aria-label={`Remove line ${i + 1}`}>
                  <Trash2 className="size-3.5" />
                </button>
              );
              if (d.kind === "product") {
                const p = productById.get(d.productId);
                return (
                  <div key={d.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2.5 md:grid-cols-[minmax(0,1fr)_72px_minmax(0,230px)_140px_28px] md:items-center">
                    <ProductPicker
                      products={options.products}
                      value={d.productId || null}
                      allowCustom={false}
                      onChange={(prod) => prod && upd(d.key, { productId: prod.id, billingFrequency: prod.billingFrequency, termMonths: prod.billingFrequency === "ONE_TIME" ? null : prod.defaultTermMonths || 36 })}
                    />
                    <Input type="number" min={1} value={d.quantity} onChange={(e) => upd(d.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="text-right tabular" aria-label={`Line ${i + 1} quantity`} title="Quantity" />
                    {billing(d, i)}
                    <Input type="number" min={0} value={d.unitPrice ?? ""} placeholder={p?.listPrice?.toLocaleString("en-IN") ?? "Unit price"} onChange={(e) => upd(d.key, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} className="text-right tabular" aria-label={`Line ${i + 1} unit price`} title="Unit price (blank uses list price)" />
                    {remove || <span />}
                  </div>
                );
              }
              const cats = options.categories.filter((c) => c.buId === d.buId);
              const catalogue = oemsByCategory.get(d.categoryId);
              const listed = catalogue ? options.oems.filter((o) => catalogue.has(o.id)) : [];
              const others = options.oems.filter((o) => !catalogue?.has(o.id));
              return (
                <div key={d.key} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-2.5 md:grid-cols-[repeat(3,minmax(0,1fr))_140px_minmax(0,230px)_28px] md:items-center">
                  <Select value={d.buId} onChange={(e) => upd(d.key, { buId: e.target.value, categoryId: "", oemId: "" })} aria-label={`Line ${i + 1} business unit`}>
                    <option value="">Business unit</option>
                    {options.bus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                  <Select value={d.categoryId} disabled={!d.buId} onChange={(e) => upd(d.key, { categoryId: e.target.value, oemId: "" })} aria-label={`Line ${i + 1} category`}>
                    <option value="">{d.buId ? "Category" : "Category (pick BU first)"}</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Select value={d.oemId} disabled={!d.categoryId} onChange={(e) => upd(d.key, { oemId: e.target.value })} aria-label={`Line ${i + 1} OEM`}>
                    <option value="">{d.categoryId ? "OEM" : "OEM (pick category first)"}</option>
                    {options.oemTbd && <option value={options.oemTbd.id}>{options.oemTbd.name}</option>}
                    {listed.length > 0 ? (
                      <>
                        <optgroup label="Usual for this category">{listed.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
                        <optgroup label="Other OEMs">{others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</optgroup>
                      </>
                    ) : (
                      others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)
                    )}
                  </Select>
                  <Input type="number" min={0} step={1000} value={d.value ?? ""} placeholder="Value ₹" onChange={(e) => upd(d.key, { value: e.target.value === "" ? null : Number(e.target.value) })} className="text-right tabular" aria-label={`Line ${i + 1} value`} title="Estimated value over the whole term" />
                  {billing(d, i)}
                  {remove || <span />}
                </div>
              );
            })}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => setDrafts((xs) => [...xs, newDraft("estimate")])}><Plus /> Add another</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDrafts((xs) => [...xs, newDraft("product")])}><Package /> Pick an exact product</Button>
              <span className="ml-auto text-[13px] text-ink-2">Deal value <span className="font-semibold tabular text-ink">{inr(total)}</span></span>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="What's being sold" description="Business unit, OEM and value come from the line items.">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
            <p className="text-[13px] text-ink-2">
              {existingLineCount} line item{existingLineCount === 1 ? "" : "s"} · <span className="font-semibold tabular text-ink">{inr(v.amount)}</span>
            </p>
            <Button asChild size="sm"><Link href={`/opportunities/${id}?tab=boq`}>Edit line items <ArrowRight /></Link></Button>
          </div>
        </Section>
      )}

      <Section title="Presales" description="Decides the path: BOQ by presales, or straight to pricing.">
        <div role="radiogroup" aria-label="Presales" className="grid gap-2 sm:col-span-3 sm:grid-cols-2">
          {[
            { on: true, icon: <Wrench className="size-4" />, title: "Needs presales", body: "Solution deal: presales designs it and prepares the BOQ, then purchase prices it." },
            { on: false, icon: <ShoppingCart className="size-4" />, title: "No presales", body: "Resale deal: you pick catalogue products. Purchase prices the third-party ones; own brands use the rate card." },
          ].map((o) => {
            const locked = mode === "edit" && openPresales && !o.on;
            return (
              <button
                key={o.title}
                type="button"
                role="radio"
                aria-checked={presalesRequired === o.on}
                disabled={locked}
                title={locked ? "Presales is working on this deal" : undefined}
                onClick={() => { setPresalesChosen(true); set("presalesRequired", String(o.on)); }}
                className={cn(
                  "flex gap-3 rounded-lg border p-3 text-left transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                  presalesRequired === o.on ? "border-primary bg-primary-soft" : "border-border hover:border-border-strong",
                )}
              >
                <span className={cn("mt-0.5", presalesRequired === o.on ? "text-primary" : "text-ink-3")}>{o.icon}</span>
                <span>
                  <span className="block text-[13px] font-medium">{o.title}</span>
                  <span className="block text-xs text-ink-3">{o.body}</span>
                </span>
              </button>
            );
          })}
          {mode === "create" && !presalesChosen && draftCategoryIds.length > 0 && (
            <p className="text-xs text-ink-3 sm:col-span-2">
              Suggested from the categories: {suggested ? `${solutionCats.join(", ")} need${solutionCats.length === 1 ? "s" : ""} a solution design.` : "resale items can be quoted from the catalogue."} You can change it.
            </p>
          )}
          {errors.presalesRequired && <p className="text-xs text-[var(--t-red)] sm:col-span-2">{errors.presalesRequired}</p>}
        </div>
      </Section>

      <Section title="Bid" description={regOems.length ? "Procurement and OEM deal registration" : "How the customer buys"}>
        <Field label="Procurement" className="sm:col-span-2">
          <Segmented
            label="Procurement"
            value={v.procurementMode as keyof typeof PROCUREMENT_LABEL}
            onChange={(m) => set("procurementMode", m)}
            options={Object.entries(PROCUREMENT_LABEL).map(([k, l]) => ({ value: k as keyof typeof PROCUREMENT_LABEL, label: l }))}
            className="h-9 w-fit max-w-full items-center overflow-x-auto [&_button]:whitespace-nowrap [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[13px]"
          />
        </Field>
        {needsBidDate(v.procurementMode) && (
          <Field htmlFor="submissionDueDate" error={errors.submissionDueDate} label="Bid submission due" required>{text("submissionDueDate", { type: "date", min: today })}</Field>
        )}
        {regOems.length > 0 && (
          <>
            <Field htmlFor="dealRegStatus" error={errors.dealRegStatus} label="Deal registration" hint={`${regOems.map((o) => o.name).join(", ")} ${regOems.length === 1 ? "runs" : "run"} deal registration`} className="sm:col-start-1">
              <Select id="dealRegStatus" value={v.dealRegStatus} onChange={(e) => set("dealRegStatus", e.target.value)}>
                {Object.entries(DEAL_REG_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </Select>
            </Field>
            {(v.dealRegStatus === "PENDING" || v.dealRegStatus === "APPROVED") && (
              <>
                <Field htmlFor="dealRegNumber" error={errors.dealRegNumber} label="Registration number" required={v.dealRegStatus === "APPROVED"}>{text("dealRegNumber")}</Field>
                <Field htmlFor="dealRegExpiry" error={errors.dealRegExpiry} label="Registration expiry">{text("dealRegExpiry", { type: "date" })}</Field>
              </>
            )}
          </>
        )}
      </Section>

      <Card className="p-0">
        <button type="button" onClick={() => setShowMore((x) => !x)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left cursor-pointer" aria-expanded={showMore}>
          <span className="text-[13px] font-semibold">More details</span>
          <span className="text-xs text-ink-3">Optional · lead source, competition, notes{canReassign ? ", owner" : ""}</span>
          <ChevronDown className={cn("ml-auto size-4 text-ink-3 transition-transform", showMore && "rotate-180")} />
        </button>
        {showMore && (
          <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-3">
            <Field htmlFor="leadSource" error={errors.leadSource} label="Lead source">
              <Select id="leadSource" value={v.leadSource} onChange={(e) => set("leadSource", e.target.value)}>
                <option value="">Select</option>
                {options.leadSources.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            <Field htmlFor="competitors" error={errors.competitors} label="Competition">
              <Select id="competitors" value={v.competitors} onChange={(e) => set("competitors", e.target.value)}>
                <option value="">Unknown / none</option>
                {options.competitors.map((s) => <option key={s}>{s}</option>)}
              </Select>
            </Field>
            {canReassign ? (
              <Field htmlFor="salesOwnerId" error={errors.salesOwnerId} label="Sales person">
                <Select id="salesOwnerId" value={v.salesOwnerId || currentUserId} onChange={(e) => set("salesOwnerId", e.target.value)}>
                  {options.sales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            ) : <span className="hidden sm:block" />}
            {mode === "edit" && STAGE_META[stage].order < STAGE_META.PRICING.order && (
              <Field htmlFor="expectedMarginPct" error={errors.expectedMarginPct} label="Expected margin %" hint="Until purchase prices the lines">
                {text("expectedMarginPct", { type: "number", step: 0.5, min: 0, max: 90 })}
              </Field>
            )}
            <Field htmlFor="description" error={errors.description} label="Notes" className="sm:col-span-3">
              <Textarea id="description" value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Customer context, pain points, how they decide" />
            </Field>
            {(stage === "LOST" || stage === "DROPPED") && (
              <Field htmlFor="lossNotes" error={errors.lossNotes} label="Loss notes" className="sm:col-span-3">{text("lossNotes")}</Field>
            )}
          </div>
        )}
      </Card>

      <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t border-border bg-surface/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
        <Button type="button" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />} {mode === "create" ? "Create opportunity" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, description, children, stacked }: { title: string; description?: string; children: React.ReactNode; stacked?: boolean }) {
  return (
    <Card className={cn("grid gap-4 p-5", !stacked && "md:grid-cols-[180px_1fr]")}>
      <div>
        <h2 className="text-[13px] font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-ink-3">{description}</p>}
      </div>
      <div className="grid content-start gap-4 sm:grid-cols-3">{children}</div>
    </Card>
  );
}
