"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { createOpportunity, updateOpportunity } from "@/server/actions/opportunities";
import {
  STAGE_META, OPEN_STAGES, FORECAST_LABEL, ACCOUNT_TYPE_LABEL, REVENUE_MODEL_LABEL, DEAL_TYPE_LABEL, PROCUREMENT_LABEL,
  DEAL_REG_LABEL, type StageKey,
} from "@/lib/constants";
import { defaultForecast } from "@/lib/rules/evaluate";
import { inr } from "@/lib/format";

type Opt = { id: string; name: string };
export type OppFormValues = Record<string, string>;
export type AccountOpt = { id: string; name: string; accountType: "NEW_LOGO" | "EXISTING"; contacts: { id: string; name: string; title: string | null }[] };

export function OppForm({
  mode, id, initial, accounts, options, canReassign, currentUserId,
}: {
  mode: "create" | "edit";
  id?: string;
  initial: OppFormValues;
  accounts: AccountOpt[];
  options: {
    bus: Opt[]; categories: (Opt & { buId: string })[]; oems: Opt[]; sales: Opt[]; presales: Opt[];
    leadSources: string[]; competitors: string[]; lossReasons: string[];
  };
  canReassign: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const [v, setV] = useState<OppFormValues>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  const account = accounts.find((a) => a.id === v.accountId);
  const cats = useMemo(() => options.categories.filter((c) => c.buId === v.businessUnitId), [options.categories, v.businessUnitId]);
  const stage = v.stage as StageKey;
  const stages: StageKey[] = mode === "create" ? OPEN_STAGES : (Object.keys(STAGE_META) as StageKey[]);
  const arr = v.revenueModel === "ARR";
  const tender = v.procurementMode === "RFP" || v.procurementMode === "TENDER";

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData();
    for (const [k, val] of Object.entries(v)) fd.set(k, val ?? "");
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
        <Field htmlFor="businessUnitId" error={errors.businessUnitId} label="Business unit" required>
          <Select id="businessUnitId" value={v.businessUnitId} onChange={(e) => setV((x) => ({ ...x, businessUnitId: e.target.value, categoryId: "" }))}>
            <option value="">Select</option>
            {options.bus.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="categoryId" error={errors.categoryId} label="Category" required>
          <Select id="categoryId" value={v.categoryId} onChange={(e) => set("categoryId", e.target.value)} disabled={!v.businessUnitId}>
            <option value="">{v.businessUnitId ? "Select" : "Choose BU first"}</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field htmlFor="oemId" error={errors.oemId} label="OEM">
          <Select id="oemId" value={v.oemId} onChange={(e) => set("oemId", e.target.value)}>
            <option value="">Select</option>
            {options.oems.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
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

      <Section title="Commercials" description="Value, revenue model and margin">
        <Field htmlFor="revenueModel" error={errors.revenueModel} label="Revenue model" required>
          <Select id="revenueModel" value={v.revenueModel} onChange={(e) => set("revenueModel", e.target.value)}>
            {Object.entries(REVENUE_MODEL_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field htmlFor="amount" error={errors.amount} label={arr ? "Total contract value (INR)" : "Amount (INR)"} required hint={v.amount ? inr(v.amount) : "Enter in rupees, e.g. 4500000 for ₹45 L"}>
          {text("amount", { type: "number", min: 0, step: 1000, inputMode: "numeric" })}
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
        <Field htmlFor="stage" error={errors.stage} label="Stage" required>
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
        <Field htmlFor="probability" error={errors.probability} label="Probability %" hint={`Stage default ${STAGE_META[stage]?.probability ?? 0}%`}>
          {text("probability", { type: "number", min: 0, max: 100 })}
        </Field>
        <Field htmlFor="forecastCategory" error={errors.forecastCategory} label="Forecast category" required>
          <Select id="forecastCategory" value={v.forecastCategory} onChange={(e) => set("forecastCategory", e.target.value)}>
            {Object.entries(FORECAST_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field htmlFor="expectedCloseDate" error={errors.expectedCloseDate} label="Expected close date" required hint={mode === "edit" ? "Pushing this out counts as a slip" : undefined}>
          {text("expectedCloseDate", { type: "date" })}
        </Field>
        <Field htmlFor="nextStep" error={errors.nextStep} label="Next step" className="sm:col-span-2">{text("nextStep", { placeholder: "e.g. Solution walkthrough with CIO" })}</Field>
        <Field htmlFor="nextStepDate" error={errors.nextStepDate} label="Next step date">{text("nextStepDate", { type: "date" })}</Field>
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

      <Section title="Procurement & OEM" description="Tender timelines and OEM deal registration">
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
