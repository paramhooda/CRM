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
import { accountSchema } from "@/contracts/accounts";

export type AccountFormValues = {
  name: string; gstin: string; industryId: string | null; segmentId: string | null; website: string; phone: string; addressLine: string; city: string; state: string; pincode: string; ownerId: string | null; notes: string;
};

export function AccountForm({ initial, accountId, owners }: { initial?: Partial<AccountFormValues>; accountId?: string; owners: { id: string; fullName: string }[] }) {
  const router = useRouter();
  const L = useLookups();
  const actor = useActor();
  const f = useForm<AccountFormValues>({ name: "", gstin: "", industryId: null, segmentId: null, website: "", phone: "", addressLine: "", city: "", state: "", pincode: "", ownerId: null, notes: "", ...initial }, accountSchema);
  const save = () =>
    f.submit(
      async (body) => {
        const r = accountId ? await api.patch<{ id: string }>(`/accounts/${accountId}`, body) : await api.post<{ id: string }>("/accounts", body);
        toast.success(accountId ? "Account saved" : "Account created");
        router.push(`/accounts/${r.id}`);
        router.refresh();
      },
      (v: AccountFormValues) => ({ ...v, gstin: v.gstin || null, pincode: v.pincode || null, ownerId: v.ownerId ?? undefined }),
    );
  return (
    <form className="flex max-w-2xl flex-col gap-5" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Account name" htmlFor="name" error={f.errors.name} required className="sm:col-span-2">
          <Input id="name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} aria-invalid={!!f.errors.name} autoFocus />
        </Field>
        <Field label="GSTIN" htmlFor="gstin" error={f.errors.gstin} hint="15 characters, unique">
          <Input id="gstin" value={f.values.gstin} onChange={(e) => f.set("gstin", e.target.value.toUpperCase())} aria-invalid={!!f.errors.gstin} className="font-mono uppercase" maxLength={15} />
        </Field>
        <Field label="Industry" htmlFor="industry" error={f.errors.industryId}>
          <OptionSelect id="industry" value={f.values.industryId} onChange={(v) => f.set("industryId", v)} options={L.industries} none="Not set" />
        </Field>
        <Field label="Segment" htmlFor="segment" error={f.errors.segmentId}>
          <OptionSelect id="segment" value={f.values.segmentId} onChange={(v) => f.set("segmentId", v)} options={L.segments} none="Not set" />
        </Field>
        {actor.role !== "SALES" && (
          <Field label="Owner" htmlFor="owner" error={f.errors.ownerId} hint="The sales person who owns the relationship">
            <OptionSelect id="owner" value={f.values.ownerId} onChange={(v) => f.set("ownerId", v)} options={owners.map((o) => ({ id: o.id, name: o.fullName }))} none="Me" />
          </Field>
        )}
        <Field label="Website" htmlFor="website" error={f.errors.website}><Input id="website" value={f.values.website} onChange={(e) => f.set("website", e.target.value)} placeholder="https://" /></Field>
        <Field label="Phone" htmlFor="phone" error={f.errors.phone}><Input id="phone" value={f.values.phone} onChange={(e) => f.set("phone", e.target.value)} /></Field>
        <Field label="Address" htmlFor="addressLine" error={f.errors.addressLine} className="sm:col-span-2"><Input id="addressLine" value={f.values.addressLine} onChange={(e) => f.set("addressLine", e.target.value)} /></Field>
        <Field label="City" htmlFor="city" error={f.errors.city}><Input id="city" value={f.values.city} onChange={(e) => f.set("city", e.target.value)} /></Field>
        <Field label="State" htmlFor="state" error={f.errors.state}><Input id="state" value={f.values.state} onChange={(e) => f.set("state", e.target.value)} /></Field>
        <Field label="Pincode" htmlFor="pincode" error={f.errors.pincode}><Input id="pincode" value={f.values.pincode} onChange={(e) => f.set("pincode", e.target.value)} maxLength={6} inputMode="numeric" /></Field>
        <Field label="Notes" htmlFor="notes" error={f.errors.notes} className="sm:col-span-2"><Textarea id="notes" rows={3} value={f.values.notes} onChange={(e) => f.set("notes", e.target.value)} /></Field>
      </div>
      <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
      <FormActions>
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={f.pending}>{accountId ? "Save changes" : "Create account"}</Button>
      </FormActions>
    </form>
  );
}
