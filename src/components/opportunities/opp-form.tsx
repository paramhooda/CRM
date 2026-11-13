"use client";
// New / edit opportunity. Asks only what sales knows at the start; everything else is derived or comes later in
// the process. Fields depend on earlier answers: contacts follow the account, deal types follow the account type,
// categories follow the business unit, OEMs follow the category, the bid date follows the procurement mode, deal
// registration follows the OEMs, and the contract term follows recurring billing.
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { Save, Loader2, Plus, Trash2, ArrowRight, ChevronDown, Package } from "lucide-react";
import { ProductPicker } from "@/components/opportunities/product-picker";
import type { ProductOption } from "@/server/queries/options";
import { billingPeriods, type BillingFrequencyKey } from "@/lib/boq";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Card } from "@/components/ui/card";
import { createOpportunity, updateOpportunity } from "@/server/actions/opportunities";
import { STAGE_META, FORECAST_LABEL, DEAL_TYPE_LABEL, PROCUREMENT_LABEL, DEAL_REG_LABEL, type StageKey } from "@/lib/constants";
import { dealTypesFor, dealTypeFor, suggestPresales, needsBidDate, dealRegOems, draftLineErrors as draftErrors, typicalBilling, type AccountTypeKey } from "@/lib/deal-setup";
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
  /** The person chose the billing themselves: picking a category no longer changes it */
  billingSet?: boolean;
};
let draftSeq = 0;
/** Line field → the words in its aria-label ("Line 2 category"), to focus the first one with a problem */
const FIELD_LABEL: Record<string, string> = { buId: "business unit", categoryId: "category", oemId: "OEM", value: "value", unitPrice: "unit price" };
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
  const set = (k: string, val: string) => {
    setV((x) => ({ ...x, [k]: val }));
    // Changing a field clears its message
    setErrors((es) => (es[k] ? Object.fromEntries(Object.entries(es).filter(([e]) => e !== k)) : es));
  };
  // The owner shown is the owner saved: an admin creating a deal hands it to a sales person, never to themselves
  const ownerValue = v.salesOwnerId && (mode === "edit" || options.sales.some((u) => u.id === v.salesOwnerId))
    ? v.salesOwnerId
    : options.sales.some((u) => u.id === currentUserId) ? currentUserId : options.sales[0]?.id ?? currentUserId;
  const account = accounts.find((a) => a.id === v.accountId);
  const accountType = (account?.accountType ?? v.accountType ?? "NEW_LOGO") as AccountTypeKey;
  const productById = useMemo(() => new Map(options.products.map((p) => [p.id, p])), [options.products]);
  const newDraft = (kind: Draft["kind"]): Draft => ({
    key: `d${++draftSeq}`, kind, productId: "", quantity: 1, unitPrice: null, buId: "", categoryId: "", oemId: "", value: null,
    billingFrequency: "ONE_TIME", termMonths: null,
  });
  const [drafts, setDrafts] = useState<Draft[]>(() => (mode === "create" ? [newDraft("estimate")] : []));
  const [showMore, setShowMore] = useState(false);
  // Problems with a field under More details open it, so nobody hunts for the error
  const MORE_FIELDS = ["submissionDueDate", "dealRegNumber", "dealRegExpiry", "dealRegStatus", "forecastCategory", "expectedMarginPct", "leadSource", "competitors", "salesOwnerId", "description", "lossReason", "lossNotes", "poNumber", "poDate", "dealType", ...(mode === "create" ? ["nextStep", "nextStepDate"] : [])];
  const moreHasError = Object.keys(errors).some((k) => MORE_FIELDS.includes(k));
  useEffect(() => {
    if (moreHasError) setShowMore(true);
  }, [moreHasError]);
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
  // Once a resale deal is qualified, presales is brought in from the deal page (engineer and due date), not here
  const involveOnly = mode === "edit" && initial.presalesRequired === "false" && initial.stage !== "IDENTIFIED";
  const today = new Date().toISOString().slice(0, 10);

  const focusLine = (i: number, label: string) =>
    setTimeout(() => (document.querySelector(`[aria-label="Line ${i + 1} ${label}"]`) as HTMLElement | null)?.focus(), 0);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    let sentIndex: number[] = [];
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val ?? "");
    fd.set("salesOwnerId", ownerValue);
    fd.set("presalesRequired", String(presalesRequired));
    fd.set("dealType", dealTypeFor(accountType, v.dealType));
    if (!needsBidDate(v.procurementMode)) fd.set("submissionDueDate", "");
    if (!regOems.length && mode === "create") fd.set("dealRegStatus", "NOT_REQUIRED");
    if (mode === "create") {
      fd.set("stage", "IDENTIFIED");
      fd.set("forecastCategory", "PIPELINE");
      // Lines left completely empty are ignored; the rest must say what is sold. The value may be left for later.
      const sent = drafts.map((d, i) => ({ d, i })).filter(({ d }) => (d.kind === "product" ? !!d.productId : !!(d.buId || d.categoryId || d.oemId || d.value)));
      if (!sent.length) {
        setErrors({
          "lines.0.buId": "Choose what is being sold: a business unit, category and OEM",
          ...(!v.accountId ? { accountId: "Select an account" } : {}),
          ...((v.name ?? "").trim().length < 3 ? { name: "Give the deal a name" } : {}),
          ...(!v.expectedCloseDate ? { expectedCloseDate: "Pick the expected close date" } : {}),
        });
        focusLine(0, "business unit");
        return void toast.error("Add what is being sold: a business unit, category and OEM.");
      }
      // Everything missing is shown at once: the deal's own fields and each line's
      const head: Record<string, string> = {};
      if (!v.accountId) head.accountId = "Select an account";
      if ((v.name ?? "").trim().length < 3) head.name = "Give the deal a name";
      if (!v.expectedCloseDate) head.expectedCloseDate = "Pick the expected close date";
      else if (v.expectedCloseDate < today) head.expectedCloseDate = "Can't be in the past";
      const lineErrors = draftErrors(sent.map((x) => x.d), sent.map((x) => x.i));
      if (Object.keys(head).length || Object.keys(lineErrors).length) {
        setErrors({ ...head, ...lineErrors });
        const firstHead = Object.keys(head)[0];
        if (firstHead) {
          setTimeout(() => document.getElementById(firstHead)?.focus(), 0);
          return void toast.error(`${Object.keys(head).length + Object.keys(lineErrors).length > 1 ? "Some fields need attention: " : ""}${head[firstHead]!.toLowerCase().replace(/^./, (c) => c.toUpperCase())}.`);
        }
        const [k, msg] = Object.entries(lineErrors)[0]!;
        const [, n, field] = k.split(".");
        focusLine(Number(n), FIELD_LABEL[field!] ?? "value");
        return void toast.error(`Line ${Number(n) + 1}: ${msg.charAt(0).toLowerCase()}${msg.slice(1)}.`);
      }
      sentIndex = sent.map((x) => x.i);
      fd.set(
        "lines",
        JSON.stringify(
          sent.map(({ d }) =>
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
        // Line problems come back numbered by the lines sent; show them on the lines as they appear on the form
        setErrors(Object.fromEntries(Object.entries(r.fieldErrors ?? {}).map(([k, m]) => {
          const p = k.split(".");
          return p[0] === "lines" && sentIndex[Number(p[1])] !== undefined ? [`lines.${sentIndex[Number(p[1])]}.${p.slice(2).join(".")}`, m] : [k, m];
        })));
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
  const upd = (key: string, patch: Partial<Draft>) => {
    const i = drafts.findIndex((x) => x.key === key);
    setDrafts((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    // Fixing a line clears its messages
    setErrors((es) => Object.fromEntries(Object.entries(es).filter(([k]) => !k.startsWith(`lines.${i}.`) && !(i === 0 && k === "lines.0.buId"))));
  };
  const lineError = (i: number, field: string) => errors[`lines.${i}.${field}`];
  const lineMessages = (i: number) => Object.entries(errors).filter(([k]) => k.startsWith(`lines.${i}.`)).map(([, m]) => m);
  const billing = (d: Draft, i: number) => (
    <div className="flex gap-1">
      <Select
        value={d.billingFrequency === "ONE_TIME" ? "ONE_TIME" : "RECURRING"}
        onChange={(e) => upd(d.key, e.target.value === "ONE_TIME" ? { billingFrequency: "ONE_TIME", termMonths: null, billingSet: true } : { billingFrequency: "MONTHLY", termMonths: d.termMonths ?? 36, billingSet: true })}
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
      <Section title="Deal">
        <Field htmlFor="accountId" error={errors.accountId} label="Account" required>
          <Select
            id="accountId"
            value={v.accountId}
            aria-invalid={!!errors.accountId}
            onChange={(e) => {
              set("accountId", e.target.value);
              const a = accounts.find((x) => x.id === e.target.value);
              setV((x) => ({ ...x, accountId: e.target.value, accountType: a?.accountType ?? x.accountType, primaryContactId: a?.contacts[0]?.id ?? "", dealType: "" }));
            }}
          >
            <option value="">Select account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="primaryContactId" error={errors.primaryContactId} label="Customer contact" hint={account && !account.contacts.length ? "No contacts on this account yet" : "Needed to qualify the deal"}>
          <Select id="primaryContactId" value={v.primaryContactId} onChange={(e) => set("primaryContactId", e.target.value)} disabled={!account}>
            <option value="">{account ? "None yet" : "Choose the account first"}</option>
            {account?.contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ""}</option>)}
          </Select>
        </Field>
        <Field htmlFor="expectedCloseDate" error={errors.expectedCloseDate} label="Expected close" required>
          {text("expectedCloseDate", { type: "date", min: today })}
        </Field>
        <Field htmlFor="name" error={errors.name} label="Opportunity name" required className="sm:col-span-3">
          {text("name", { placeholder: account ? `${account.name.split(" ")[0]} - Solution, e.g. DC Server Refresh` : "Account - Solution", autoFocus: mode === "create" })}
        </Field>
        {mode === "edit" && (
          <>
            <Field htmlFor="nextStep" error={errors.nextStep} label="Next step" className="sm:col-span-2">{text("nextStep", { placeholder: "e.g. Requirement call with the IT head" })}</Field>
            <Field htmlFor="nextStepDate" error={errors.nextStepDate} label="Next step date">{text("nextStepDate", { type: "date", min: today })}</Field>
          </>
        )}
      </Section>

      {mode === "create" ? (
        <Section stacked title="What's being sold" description="A rough business unit, category, OEM and value is enough. Exact products come later.">
          <div className="flex flex-col gap-2 sm:col-span-3">
            {drafts.map((d, i) => {
              const remove = drafts.length > 1 && (
                <button type="button" onClick={() => { setDrafts((xs) => xs.filter((x) => x.key !== d.key)); setErrors((es) => Object.fromEntries(Object.entries(es).filter(([k]) => !k.startsWith("lines.")))); }} className="justify-self-end rounded p-1.5 text-ink-3 hover:bg-surface-hover hover:text-[var(--t-red)] cursor-pointer" aria-label={`Remove line ${i + 1}`}>
                  <Trash2 className="size-3.5" />
                </button>
              );
              if (d.kind === "product") {
                const p = productById.get(d.productId);
                return (
                  <div key={d.key}>
                  <div className={cn("grid grid-cols-1 gap-2 rounded-lg border p-2.5 md:grid-cols-[minmax(0,1fr)_72px_minmax(0,230px)_140px_28px] md:items-center", lineMessages(i).length ? "border-[var(--t-red)]" : "border-border")}>
                    <ProductPicker
                      products={options.products}
                      value={d.productId || null}
                      allowCustom={false}
                      onChange={(prod) => prod && upd(d.key, { productId: prod.id, billingFrequency: prod.billingFrequency, termMonths: prod.billingFrequency === "ONE_TIME" ? null : prod.defaultTermMonths || 36 })}
                    />
                    <Input type="number" min={1} value={d.quantity} onChange={(e) => upd(d.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} className="text-right tabular" aria-label={`Line ${i + 1} quantity`} title="Quantity" />
                    {billing(d, i)}
                    <Input type="number" min={0} value={d.unitPrice ?? ""} placeholder={p?.listPrice?.toLocaleString("en-IN") ?? "Unit price"} aria-invalid={!!lineError(i, "unitPrice")} onChange={(e) => upd(d.key, { unitPrice: e.target.value === "" ? null : Number(e.target.value) })} className="text-right tabular" aria-label={`Line ${i + 1} unit price`} title="Unit price (blank uses list price)" />
                    {remove || <span />}
                  </div>
                  <LineMessages n={i + 1} messages={lineMessages(i)} />
                  </div>
                );
              }
              const cats = options.categories.filter((c) => c.buId === d.buId);
              const catalogue = oemsByCategory.get(d.categoryId);
              const listed = catalogue ? options.oems.filter((o) => catalogue.has(o.id)) : [];
              const others = options.oems.filter((o) => !catalogue?.has(o.id));
              return (
                <div key={d.key}>
                <div className={cn("grid grid-cols-1 gap-2 rounded-lg border p-2.5 md:grid-cols-[repeat(3,minmax(0,1fr))_140px_minmax(0,230px)_28px] md:items-center", lineMessages(i).length ? "border-[var(--t-red)]" : "border-border")}>
                  <Select value={d.buId} onChange={(e) => upd(d.key, { buId: e.target.value, categoryId: "", oemId: "" })} aria-label={`Line ${i + 1} business unit`} aria-invalid={!!lineError(i, "buId")}>
                    <option value="">Business unit</option>
                    {options.bus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                  <Select
                    value={d.categoryId} disabled={!d.buId} aria-label={`Line ${i + 1} category`} aria-invalid={!!lineError(i, "categoryId")}
                    onChange={(e) => {
                      // Hosting, NOC, SOC… usually bill monthly: start the line that way unless billing was already chosen
                      const typical = d.billingSet || !e.target.value ? null : typicalBilling(e.target.value, options.products);
                      upd(d.key, {
                        categoryId: e.target.value, oemId: "",
                        ...(typical === "RECURRING" ? { billingFrequency: "MONTHLY" as const, termMonths: d.termMonths ?? 36 } : typical === "ONE_TIME" ? { billingFrequency: "ONE_TIME" as const, termMonths: null } : {}),
                      });
                    }}
                  >
                    <option value="">{d.buId ? "Category" : "Category (pick BU first)"}</option>
                    {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Select value={d.oemId} disabled={!d.categoryId} onChange={(e) => upd(d.key, { oemId: e.target.value })} aria-label={`Line ${i + 1} OEM`} aria-invalid={!!lineError(i, "oemId")}>
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
                  <Input
                    type="number" min={0} step="any" value={d.value ?? ""} placeholder="Value (optional)" aria-invalid={!!lineError(i, "value")}
                    onChange={(e) => upd(d.key, { value: e.target.value === "" ? null : Number(e.target.value) })} className="text-right tabular" aria-label={`Line ${i + 1} value`}
                    title="Estimated value over the whole term. Leave blank if not known yet: it is needed before the deal is qualified."
                  />
                  {billing(d, i)}
                  {remove || <span />}
                </div>
                <LineMessages n={i + 1} messages={lineMessages(i)} />
                </div>
              );
            })}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={() => setDrafts((xs) => [...xs, newDraft("estimate")])}><Plus /> Add another</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDrafts((xs) => [...xs, newDraft("product")])}><Package /> Pick an exact product</Button>
              <span className="ml-auto text-[13px] text-ink-2">
                Deal value{" "}
                {total > 0 ? <span className="font-semibold tabular text-ink">{inr(total)}</span> : <span className="text-ink-3" title="Add it before qualifying the deal">not known yet</span>}
              </span>
            </div>
          </div>
        </Section>
      ) : (
        <Section title="What's being sold">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-3">
            <p className="text-[13px] text-ink-2">
              {existingLineCount} line item{existingLineCount === 1 ? "" : "s"} · <span className="font-semibold tabular text-ink">{inr(v.amount)}</span>
            </p>
            <Button asChild size="sm"><Link href={`/opportunities/${id}?tab=boq`}>Edit line items <ArrowRight /></Link></Button>
          </div>
        </Section>
      )}

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
        <span className="text-[13px] font-semibold">Needs presales?</span>
        <div role="radiogroup" aria-label="Presales" className="inline-flex rounded-lg border border-border p-0.5">
          {[
            { on: true, label: "Yes", name: "Needs presales", title: "Solution deal: presales designs it and prepares the BOQ" },
            { on: false, label: "No", name: "No presales", title: "Resale deal: you pick catalogue products and go straight to pricing" },
          ].map((o) => {
            // Switching to resale needs presales to have stopped; switching to presales goes through Involve presales
            const locked = mode === "edit" && ((openPresales && !o.on) || (o.on && involveOnly));
            return (
              <button
                key={o.label} type="button" role="radio" aria-label={o.name} aria-checked={presalesRequired === o.on} disabled={locked}
                title={locked ? (o.on ? "Use Involve presales on the deal page" : "Presales is working on this deal") : o.title}
                onClick={() => { setPresalesChosen(true); set("presalesRequired", String(o.on)); }}
                className={cn(
                  "rounded-md px-3 py-1 text-[13px] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
                  presalesRequired === o.on ? "bg-primary-soft font-medium text-ink" : "text-ink-2 hover:text-ink",
                )}
              >
                {o.label}
              </button>
            );
          })}
        </div>
        <span className="text-xs text-ink-3">
          {involveOnly
            ? <>To bring presales in, use <Link href={`/opportunities/${id}`} className="text-primary hover:underline">Involve presales</Link> on the deal.</>
            : presalesRequired ? "Presales designs the solution and prepares the BOQ." : "You pick catalogue products; purchase prices them."}
          {mode === "create" && !presalesChosen && draftCategoryIds.length > 0 && (solutionCats.length ? ` Suggested: ${solutionCats.join(", ")} need${solutionCats.length === 1 ? "s" : ""} a design.` : " Suggested: resale items.")}
        </span>
        {errors.presalesRequired && <p className="w-full text-xs text-[var(--t-red)]">{errors.presalesRequired}</p>}
      </Card>

      <Card className="p-0">
        <button type="button" onClick={() => setShowMore((x) => !x)} className="flex w-full items-center gap-2 px-5 py-3.5 text-left cursor-pointer" aria-expanded={showMore}>
          <span className="text-[13px] font-semibold">More details</span>
          <span className="text-xs text-ink-3">Optional</span>
          <ChevronDown className={cn("ml-auto size-4 text-ink-3 transition-transform", showMore && "rotate-180")} />
        </button>
        <div hidden={!showMore} className="grid gap-4 border-t border-border p-5 sm:grid-cols-3">
          {mode === "create" && (
            <>
              <Field htmlFor="nextStep" error={errors.nextStep} label="Next step" className="sm:col-span-2">{text("nextStep", { placeholder: "e.g. Requirement call with the IT head" })}</Field>
              <Field htmlFor="nextStepDate" error={errors.nextStepDate} label="Next step date">{text("nextStepDate", { type: "date", min: today })}</Field>
            </>
          )}
          {accountType === "EXISTING" && (
            <Field label="Deal type" className="sm:col-span-3">
              <Segmented
                label="Deal type"
                value={dealTypeFor(accountType, v.dealType)}
                onChange={(t) => set("dealType", t)}
                options={dealTypesFor(accountType).map((t) => ({ value: t, label: DEAL_TYPE_LABEL[t] }))}
                className="h-9 w-fit max-w-full items-center overflow-x-auto [&_button]:whitespace-nowrap [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[13px]"
              />
            </Field>
          )}
          <Field label="Procurement" className="sm:col-span-2">
            <Segmented
              label="Procurement"
              value={v.procurementMode as keyof typeof PROCUREMENT_LABEL}
              onChange={(m) => set("procurementMode", m)}
              options={Object.entries(PROCUREMENT_LABEL).map(([k, l]) => ({ value: k as keyof typeof PROCUREMENT_LABEL, label: l }))}
              className="h-9 w-fit max-w-full items-center overflow-x-auto [&_button]:whitespace-nowrap [&_button]:px-2.5 [&_button]:py-1 [&_button]:text-[13px]"
            />
          </Field>
          {needsBidDate(v.procurementMode) ? (
            <Field htmlFor="submissionDueDate" error={errors.submissionDueDate} label="Bid submission due" required>{text("submissionDueDate", { type: "date", min: today })}</Field>
          ) : <span className="hidden sm:block" />}
          {regOems.length > 0 && (
            <>
              <Field htmlFor="dealRegStatus" error={errors.dealRegStatus} label="Deal registration" hint={`${regOems.map((o) => o.name).join(", ")} ${regOems.length === 1 ? "runs" : "run"} deal registration`}>
                <Select id="dealRegStatus" value={v.dealRegStatus} onChange={(e) => set("dealRegStatus", e.target.value)}>
                  {Object.entries(DEAL_REG_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              {v.dealRegStatus === "PENDING" || v.dealRegStatus === "APPROVED" ? (
                <>
                  <Field htmlFor="dealRegNumber" error={errors.dealRegNumber} label="Registration number" required={v.dealRegStatus === "APPROVED"}>{text("dealRegNumber")}</Field>
                  <Field htmlFor="dealRegExpiry" error={errors.dealRegExpiry} label="Registration expiry">{text("dealRegExpiry", { type: "date" })}</Field>
                </>
              ) : <span className="hidden sm:col-span-2 sm:block" />}
            </>
          )}
          {mode === "edit" && (
            <Field htmlFor="forecastCategory" error={errors.forecastCategory} label="Forecast" hint={commitAllowed ? `${STAGE_META[stage].label} · ${v.probability}%` : "Commit needs a quote with the customer"}>
              <Select id="forecastCategory" value={v.forecastCategory} onChange={(e) => set("forecastCategory", e.target.value)}>
                {Object.entries(FORECAST_LABEL).map(([k, l]) => <option key={k} value={k} disabled={k === "COMMIT" && !commitAllowed && v.forecastCategory !== "COMMIT"}>{l}</option>)}
              </Select>
            </Field>
          )}
          {mode === "edit" && STAGE_META[stage].order < STAGE_META.PRICING.order && (
            <Field htmlFor="expectedMarginPct" error={errors.expectedMarginPct} label="Expected margin %" hint="Until purchase prices the lines">
              {text("expectedMarginPct", { type: "number", step: 0.5, min: 0, max: 90 })}
            </Field>
          )}
          <Field htmlFor="leadSource" error={errors.leadSource} label="Lead source">
            <Select id="leadSource" value={v.leadSource} onChange={(e) => set("leadSource", e.target.value)}>
              <option value="">Select</option>
              {options.leadSources.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          <Field htmlFor="competitors" error={errors.competitors} label="Competition">
            <Select id="competitors" value={v.competitors} onChange={(e) => set("competitors", e.target.value)}>
              <option value="">Unknown / none</option>
              {options.competitors.map((x) => <option key={x}>{x}</option>)}
            </Select>
          </Field>
          {canReassign && (
            <Field htmlFor="salesOwnerId" error={errors.salesOwnerId} label="Sales person">
              <Select id="salesOwnerId" value={ownerValue} onChange={(e) => set("salesOwnerId", e.target.value)}>
                {mode === "edit" && v.salesOwnerId && !options.sales.some((u) => u.id === v.salesOwnerId) && <option value={v.salesOwnerId}>Current owner (no longer in sales)</option>}
                {options.sales.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
          )}
          <Field htmlFor="description" error={errors.description} label="Notes" className="sm:col-span-3">
            <Textarea id="description" value={v.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="Customer context, pain points, how they decide" />
          </Field>
          {(stage === "LOST" || stage === "DROPPED") && (
            <>
              <Field htmlFor="lossReason" error={errors.lossReason} label="Reason">
                <Select id="lossReason" value={v.lossReason ?? ""} onChange={(e) => set("lossReason", e.target.value)}>
                  {v.lossReason && !options.lossReasons.includes(v.lossReason) && <option value={v.lossReason}>{v.lossReason}</option>}
                  {!v.lossReason && <option value="">Not recorded</option>}
                  {options.lossReasons.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
              <Field htmlFor="lossNotes" error={errors.lossNotes} label="Loss notes" className="sm:col-span-2">{text("lossNotes")}</Field>
            </>
          )}
          {stage === "WON" && (
            // A manager correcting a typo in the PO, without reopening the deal
            <>
              <Field htmlFor="poNumber" error={errors.poNumber} label="Customer PO number">{text("poNumber")}</Field>
              <Field htmlFor="poDate" error={errors.poDate} label="PO date">{text("poDate", { type: "date" })}</Field>
            </>
          )}
        </div>
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

/** What is missing on one line of the New opportunity form, right under it */
function LineMessages({ n, messages }: { n: number; messages: string[] }) {
  if (!messages.length) return null;
  return (
    <p role="alert" aria-label={`Line ${n} problems`} className="mt-1 px-1 text-xs text-[var(--t-red)]">
      Line {n}: {messages.map((m, i) => (i ? m.charAt(0).toLowerCase() + m.slice(1) : m)).join(", ")}.
    </p>
  );
}
