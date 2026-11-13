"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FormActions, FormError, OptionSelect } from "@/components/crm/form";
import { useActor, useLookups } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { leadSchema } from "@/contracts/leads";

export type LeadFormValues = { companyName: string; contactName: string; contactEmail: string; contactPhone: string; designation: string; leadSourceId: string | null; industryId: string | null; segmentId: string | null; businessUnitId: string | null; estimatedValue: string; notes: string; ownerId: string | null };

export function LeadForm({ initial, leadId, owners }: { initial?: Partial<LeadFormValues>; leadId?: string; owners: { id: string; fullName: string }[] }) {
  const router = useRouter();
  const L = useLookups();
  const actor = useActor();
  const f = useForm<LeadFormValues>({ companyName: "", contactName: "", contactEmail: "", contactPhone: "", designation: "", leadSourceId: null, industryId: null, segmentId: null, businessUnitId: null, estimatedValue: "", notes: "", ownerId: null, ...initial }, leadSchema);
  const save = () =>
    f.submit(
      async (body) => {
        const r = leadId ? await api.patch<{ id: string }>(`/leads/${leadId}`, body) : await api.post<{ id: string }>("/leads", body);
        toast.success(leadId ? "Lead saved" : "Lead captured");
        router.push(`/leads/${r.id}`);
        router.refresh();
      },
      (v: LeadFormValues) => ({ ...v, contactEmail: v.contactEmail || null, estimatedValue: v.estimatedValue || null, ownerId: v.ownerId ?? undefined }),
    );
  return (
    <form className="flex max-w-2xl flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company" htmlFor="companyName" error={f.errors.companyName} required className="sm:col-span-2"><Input id="companyName" value={f.values.companyName} onChange={(e) => f.set("companyName", e.target.value)} aria-invalid={!!f.errors.companyName} autoFocus /></Field>
        <Field label="Contact name" htmlFor="contactName" error={f.errors.contactName} required><Input id="contactName" value={f.values.contactName} onChange={(e) => f.set("contactName", e.target.value)} aria-invalid={!!f.errors.contactName} /></Field>
        <Field label="Designation" htmlFor="designation" error={f.errors.designation}><Input id="designation" value={f.values.designation} onChange={(e) => f.set("designation", e.target.value)} /></Field>
        <Field label="Email" htmlFor="contactEmail" error={f.errors.contactEmail}><Input id="contactEmail" type="email" value={f.values.contactEmail} onChange={(e) => f.set("contactEmail", e.target.value)} aria-invalid={!!f.errors.contactEmail} /></Field>
        <Field label="Phone" htmlFor="contactPhone" error={f.errors.contactPhone}><Input id="contactPhone" value={f.values.contactPhone} onChange={(e) => f.set("contactPhone", e.target.value)} /></Field>
        <Field label="Lead source" htmlFor="leadSourceId" error={f.errors.leadSourceId} required><OptionSelect id="leadSourceId" value={f.values.leadSourceId} onChange={(v) => f.set("leadSourceId", v)} options={L.leadSources} invalid={!!f.errors.leadSourceId} /></Field>
        <Field label="Business unit of interest" htmlFor="businessUnitId" error={f.errors.businessUnitId}><OptionSelect id="businessUnitId" value={f.values.businessUnitId} onChange={(v) => f.set("businessUnitId", v)} options={L.businessUnits} none="Not sure yet" /></Field>
        <Field label="Industry" htmlFor="industryId" error={f.errors.industryId}><OptionSelect id="industryId" value={f.values.industryId} onChange={(v) => f.set("industryId", v)} options={L.industries} none="Not set" /></Field>
        <Field label="Segment" htmlFor="segmentId" error={f.errors.segmentId}><OptionSelect id="segmentId" value={f.values.segmentId} onChange={(v) => f.set("segmentId", v)} options={L.segments} none="Not set" /></Field>
        <Field label="Estimated value (₹)" htmlFor="estimatedValue" error={f.errors.estimatedValue}><Input id="estimatedValue" inputMode="decimal" value={f.values.estimatedValue} onChange={(e) => f.set("estimatedValue", e.target.value)} aria-invalid={!!f.errors.estimatedValue} /></Field>
        {actor.role !== "SALES" && (
          <Field label="Owner" htmlFor="ownerId" error={f.errors.ownerId}><OptionSelect id="ownerId" value={f.values.ownerId} onChange={(v) => f.set("ownerId", v)} options={owners.map((o) => ({ id: o.id, name: o.fullName }))} none="Me" /></Field>
        )}
        <Field label="Notes" htmlFor="notes" error={f.errors.notes} className="sm:col-span-2"><Textarea id="notes" rows={3} value={f.values.notes} onChange={(e) => f.set("notes", e.target.value)} placeholder="What do they need?" /></Field>
      </div>
      <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
      <FormActions>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={f.pending}>{leadId ? "Save changes" : "Capture lead"}</Button>
      </FormActions>
    </form>
  );
}
