"use client";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Field, FormActions, FormError, OptionSelect } from "@/components/crm/form";
import { Combobox } from "@/components/crm/combobox";
import { LineDialog, emptyLine, lineToInput, type LineDraft } from "@/components/crm/line-dialog";
import { LinesTable } from "@/components/crm/lines-table";
import { EmptyState } from "@/components/crm/states";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { useActor, useLookups } from "@/components/crm/providers";
import { FORECAST_LABEL } from "@/components/crm/pills";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { createDealSchema, patchDealSchema } from "@/contracts/deals";
import { deriveLine, rollupDeal } from "@/domain/lines";
import { isoDay } from "@/lib/format";
import type { LineField } from "@/domain/lines";

export type DealFormValues = {
  name: string; accountId: string | null; primaryContactId: string | null; ownerId: string | null; expectedCloseDate: string; forecastCategory: "COMMIT" | "UPSIDE" | "PIPELINE";
  needsPresales: boolean | null; leadSourceId: string | null; description: string; nextStep: string; nextStepDate: string;
};
type Contact = { id: string; firstName: string; lastName: string; designation: string | null };

/** Creates a deal (with its first lines) or edits the header of an existing one. */
export function DealForm({ initial, dealId, version, owners, accountName, contacts: initialContacts }: {
  initial?: Partial<DealFormValues>; dealId?: string; version?: number; owners: { id: string; fullName: string }[]; accountName?: string; contacts?: Contact[];
}) {
  const router = useRouter();
  const L = useLookups();
  const actor = useActor();
  const [defaultClose] = useState(() => isoDay(new Date(Date.now() + 90 * 86_400_000)));
  const f = useForm<DealFormValues>({ name: "", accountId: null, primaryContactId: null, ownerId: null, expectedCloseDate: defaultClose, forecastCategory: "PIPELINE", needsPresales: null, leadSourceId: null, description: "", nextStep: "", nextStepDate: "", ...initial }, dealId ? patchDealSchema.omit({ version: true }) : createDealSchema.omit({ lines: true }));
  const [contacts, setContacts] = useState<Contact[]>(initialContacts ?? []);
  const [lines, setLines] = useState<LineDraft[]>([]);
  const [lineDialog, setLineDialog] = useState<{ index: number | null } | null>(null);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const editable = new Set<LineField>(actor.role === "ADMIN" ? ["spec", "price", "cost", "delete"] : ["spec", "price", "delete"]);

  const loadAccounts = useCallback(async (q: string) => {
    const r = await api.get<{ rows: { id: string; name: string; code: string }[] }>(`/accounts?q=${encodeURIComponent(q)}&pageSize=20`);
    return r.rows.map((a) => ({ value: a.id, label: a.name, hint: a.code }));
  }, []);
  const loadContacts = useCallback(async (accountId: string | null) => {
    if (!accountId) return setContacts([]);
    const a = await api.get<{ contacts: Contact[] }>(`/accounts/${accountId}`);
    setContacts(a.contacts);
  }, []);

  // Presales is suggested from the Sub BUs on the lines until the user decides
  const suggestedPresales = lines.some((l) => L.subBusinessUnits.find((s) => s.id === l.subBusinessUnitId)?.needsPresales);
  const needsPresales = f.values.needsPresales ?? suggestedPresales;
  const derived = lines.map((l) => deriveLine({ quantity: l.quantity, unitSalesPrice: l.unitSalesPrice || null, unitPurchaseCost: l.unitPurchaseCost || null, revenueModel: l.revenueModel, termMonths: l.termMonths ? Number(l.termMonths) : null }));
  const roll = lines.length ? rollupDeal(derived.map((d, i) => ({ ...d, revenueModel: lines[i]!.revenueModel, businessUnitId: lines[i]!.businessUnitId ?? "", oemId: lines[i]!.oemId ?? "", lineNo: i + 1, unitSalesPrice: lines[i]!.unitSalesPrice || null }))) : null;

  const save = () =>
    f.submit(async (v) => {
      const body = { ...v, nextStepDate: v.nextStepDate || null, needsPresales: v.needsPresales ?? (dealId ? undefined : suggestedPresales), ownerId: v.ownerId ?? undefined, description: v.description || null, nextStep: v.nextStep || null };
      if (dealId) {
        const { accountId: _a, ownerId: _o, ...rest } = body;
        await api.patch(`/deals/${dealId}`, { ...rest, version });
        toast.success("Deal saved");
        router.push(`/deals/${dealId}`);
      } else {
        const r = await api.post<{ id: string }>("/deals", { ...body, lines: lines.map(lineToInput) });
        toast.success("Deal created");
        router.push(`/deals/${r.id}`);
      }
      router.refresh();
    });

  return (
    <form className="flex flex-col gap-6" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <section className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Field label="Deal name" htmlFor="name" error={f.errors.name} required className="sm:col-span-2">
          <Input id="name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} aria-invalid={!!f.errors.name} autoFocus placeholder="What the customer is buying, in a line" />
        </Field>
        <Field label="Account" htmlFor="account" error={f.errors.accountId} required>
          {dealId ? <Input id="account" value={accountName ?? ""} disabled /> : <Combobox id="account" value={f.values.accountId} onChange={(v) => { f.setValues((x) => ({ ...x, accountId: v, primaryContactId: null })); void loadContacts(v); }} load={loadAccounts} placeholder="Pick an account" searchPlaceholder="Search accounts…" invalid={!!f.errors.accountId} />}
        </Field>
        <Field label="Customer contact" htmlFor="contact" error={f.errors.primaryContactId} hint={f.values.accountId && contacts.length === 0 ? "No contacts yet; add one on the account." : "Needed before the deal leaves Qualified."}>
          <OptionSelect id="contact" value={f.values.primaryContactId} onChange={(v) => f.set("primaryContactId", v)} options={contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}${c.designation ? ` · ${c.designation}` : ""}` }))} none="Not set" disabled={!f.values.accountId} />
        </Field>
        <Field label="Expected close" htmlFor="close" error={f.errors.expectedCloseDate} required>
          <Input id="close" type="date" value={f.values.expectedCloseDate} onChange={(e) => f.set("expectedCloseDate", e.target.value)} aria-invalid={!!f.errors.expectedCloseDate} />
        </Field>
        <Field label="Forecast" htmlFor="forecast" error={f.errors.forecastCategory}>
          <OptionSelect id="forecast" value={f.values.forecastCategory} onChange={(v) => f.set("forecastCategory", (v ?? "PIPELINE") as DealFormValues["forecastCategory"])} options={L.forecasts.map((x) => ({ id: x.key, name: FORECAST_LABEL[x.key] }))} />
        </Field>
        <Field label="Lead source" htmlFor="source" error={f.errors.leadSourceId}>
          <OptionSelect id="source" value={f.values.leadSourceId} onChange={(v) => f.set("leadSourceId", v)} options={L.leadSources} none="Not set" />
        </Field>
        {!dealId && actor.role !== "SALES" && (
          <Field label="Owner" htmlFor="owner" error={f.errors.ownerId}>
            <OptionSelect id="owner" value={f.values.ownerId} onChange={(v) => f.set("ownerId", v)} options={owners.map((o) => ({ id: o.id, name: o.fullName }))} none="Me" />
          </Field>
        )}
        <div className="flex items-center gap-3 self-end pb-2">
          <Switch id="presales" checked={needsPresales} onCheckedChange={(v) => f.set("needsPresales", v)} />
          <label htmlFor="presales" className="text-sm">Needs presales (BOQ stage)<span className="block text-xs text-muted-foreground">{f.values.needsPresales === null ? "Suggested from the lines" : "Set by you"}</span></label>
        </div>
        <Field label="Next step" htmlFor="nextStep" error={f.errors.nextStep}><Input id="nextStep" value={f.values.nextStep} onChange={(e) => f.set("nextStep", e.target.value)} placeholder="e.g. Demo with the CIO" /></Field>
        <Field label="Next step date" htmlFor="nextStepDate" error={f.errors.nextStepDate}><Input id="nextStepDate" type="date" value={f.values.nextStepDate} onChange={(e) => f.set("nextStepDate", e.target.value)} /></Field>
        <Field label="Description" htmlFor="description" error={f.errors.description} className="sm:col-span-2"><Textarea id="description" rows={3} value={f.values.description} onChange={(e) => f.set("description", e.target.value)} placeholder="Requirement, background, what matters to the customer" /></Field>
      </section>

      {!dealId && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Opportunity lines</h2>
              <p className="text-xs text-muted-foreground">What is being sold. Rough is fine; presales and purchase refine it later.</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setLineDialog({ index: null })}><Plus /> Add line</Button>
          </div>
          {lines.length === 0 ? (
            <EmptyState title="No lines yet" description="A deal can be created without lines and filled in later." className="py-8" />
          ) : (
            <LinesTable
              sales
              rows={lines.map((l, i) => ({ ...l, lineNo: i + 1, lineValue: derived[i]!.lineValue, expectedGmPct: derived[i]!.expectedGmPct, termMonths: l.termMonths || null }))}
              onEdit={(_r, i) => setLineDialog({ index: i })}
              onDelete={(_r, i) => setRemoveIndex(i)}
              totals={roll ? { value: roll.dealValue, cost: roll.totalCost, gm: roll.expectedGmPct, arr: roll.annualRecurringValue } : undefined}
            />
          )}
        </section>
      )}

      <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
      <FormActions className="max-w-3xl">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={f.pending}>{dealId ? "Save changes" : "Create deal"}</Button>
      </FormActions>

      {lineDialog && (
        <LineDialog
          open
          onOpenChange={(o) => !o && setLineDialog(null)}
          initial={lineDialog.index !== null ? lines[lineDialog.index] : emptyLine()}
          editable={editable}
          onSave={async (line) => setLines((ls) => (lineDialog.index === null ? [...ls, line] : ls.map((x, i) => (i === lineDialog.index ? line : x))))}
        />
      )}
      <ConfirmDialog open={removeIndex !== null} onOpenChange={(o) => !o && setRemoveIndex(null)} title="Remove this line?" confirmLabel="Remove" destructive onConfirm={() => setLines((ls) => ls.filter((_, i) => i !== removeIndex))} />
    </form>
  );
}
