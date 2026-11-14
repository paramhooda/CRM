"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/crm/states";
import { NeutralPill } from "@/components/crm/pills";
import { Field, FormError, OptionSelect } from "@/components/crm/form";
import { ConfirmDialog } from "@/components/crm/dialogs";
import { useLookups } from "@/components/crm/providers";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

type Step = { approverKind: "OWNER_MANAGER" | "ROLE" | "USER"; approverRole: "ADMIN" | "SALES_HEAD" | null; approverUserId: string | null };
type Rule = { id: string; name: string; isActive: boolean; gmBelowPct: string | null; dealValueAtLeast: string | null; businessUnitId: string | null; businessUnit: { name: string } | null; steps: (Step & { stepNo: number })[] };
type Person = { id: string; fullName: string };

const KINDS = [{ id: "OWNER_MANAGER", name: "The owner's manager" }, { id: "ROLE", name: "Anyone with a role" }, { id: "USER", name: "A specific person" }];
const ROLES = [{ id: "SALES_HEAD", name: "Sales Head" }, { id: "ADMIN", name: "Admin" }];

const stepText = (s: Step, people: Person[]) => (s.approverKind === "OWNER_MANAGER" ? "Owner's manager" : s.approverKind === "ROLE" ? `Any ${s.approverRole === "ADMIN" ? "Admin" : "Sales Head"}` : people.find((p) => p.id === s.approverUserId)?.fullName ?? "Person");

export function RulesTable({ rows, people }: { rows: Rule[]; people: Person[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [removing, setRemoving] = useState<Rule | null>(null);
  return (
    <>
      <div className="mb-3 flex justify-end"><Button size="sm" onClick={() => setEditing("new")}><Plus /> New rule</Button></div>
      {rows.length === 0 ? (
        <EmptyState title="No approval rules" description="Without rules, no deal needs approval before a proposal." action={<Button size="sm" onClick={() => setEditing("new")}><Plus /> New rule</Button>} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className={cn("rounded-xl border border-border bg-card p-4", !r.isActive && "opacity-70")}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">{r.name}{!r.isActive && <NeutralPill>Inactive</NeutralPill>}</div>
                  <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                    <span className="text-muted-foreground">When</span>
                    {r.gmBelowPct && <NeutralPill>GM below {r.gmBelowPct}%</NeutralPill>}
                    {r.dealValueAtLeast && <NeutralPill>Value at least {inr(r.dealValueAtLeast)}</NeutralPill>}
                    {r.businessUnit && <NeutralPill>BU is {r.businessUnit.name}</NeutralPill>}
                  </div>
                  <ol className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-muted-foreground">Approvers</span>
                    {r.steps.map((s, i) => <li key={s.stepNo} className="flex items-center gap-1.5"><span className="rounded-md bg-muted px-2 py-0.5">{i + 1}. {stepText(s, people)}</span>{i < r.steps.length - 1 && <span className="text-muted-foreground">→</span>}</li>)}
                  </ol>
                </div>
                <span className="inline-flex gap-0.5">
                  <Button variant="ghost" size="icon-xs" aria-label={`Edit ${r.name}`} onClick={() => setEditing(r)}><Pencil /></Button>
                  <Button variant="ghost" size="icon-xs" className="text-destructive hover:text-destructive" aria-label={`Delete ${r.name}`} onClick={() => setRemoving(r)}><Trash2 /></Button>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
      {editing && <RuleDialog key={editing === "new" ? "new" : editing.id} rule={editing === "new" ? null : editing} people={people} onClose={() => setEditing(null)} />}
      <ConfirmDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)} title={`Delete ${removing?.name}?`} description="Approvals already given stay on their deals." destructive confirmLabel="Delete" onConfirm={async () => { if (!removing) return; await api.del(`/admin/approval-rules/${removing.id}`); toast.success("Rule deleted"); router.refresh(); }} />
    </>
  );
}

function RuleDialog({ rule, people, onClose }: { rule: Rule | null; people: Person[]; onClose: () => void }) {
  const router = useRouter();
  const L = useLookups();
  const f = useForm({ name: rule?.name ?? "", isActive: rule?.isActive ?? true, gmBelowPct: rule?.gmBelowPct ?? "", dealValueAtLeast: rule?.dealValueAtLeast?.replace(/\.00$/, "") ?? "", businessUnitId: rule?.businessUnitId ?? null, steps: (rule?.steps.map((s) => ({ approverKind: s.approverKind, approverRole: s.approverRole, approverUserId: s.approverUserId })) ?? [{ approverKind: "OWNER_MANAGER", approverRole: null, approverUserId: null }]) as Step[] });
  const setStep = (i: number, patch: Partial<Step>) => f.set("steps", f.values.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const save = () =>
    f.submit(async (v) => {
      const errs: Record<string, string> = {};
      if (v.name.trim().length < 3) errs.name = "Give the rule a name.";
      if (!v.gmBelowPct && !v.dealValueAtLeast && !v.businessUnitId) errs.gmBelowPct = "Set at least one condition.";
      if (v.gmBelowPct && !/^\d+(\.\d{1,2})?$/.test(v.gmBelowPct)) errs.gmBelowPct = "Enter a percentage.";
      if (v.dealValueAtLeast && !/^\d+(\.\d{1,2})?$/.test(v.dealValueAtLeast)) errs.dealValueAtLeast = "Enter an amount.";
      if (!v.steps.length) errs.steps = "Add at least one approver.";
      if (v.steps.some((s) => (s.approverKind === "ROLE" && !s.approverRole) || (s.approverKind === "USER" && !s.approverUserId))) errs.steps = "Each approver needs a role or a person.";
      if (Object.keys(errs).length) return f.setErrors(errs);
      const body = { name: v.name.trim(), isActive: v.isActive, gmBelowPct: v.gmBelowPct || null, dealValueAtLeast: v.dealValueAtLeast || null, businessUnitId: v.businessUnitId, steps: v.steps };
      if (rule) await api.patch(`/admin/approval-rules/${rule.id}`, body);
      else await api.post("/admin/approval-rules", body);
      toast.success(rule ? "Rule saved" : "Rule added");
      onClose();
      router.refresh();
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader><DialogTitle>{rule ? `Edit ${rule.name}` : "New approval rule"}</DialogTitle><DialogDescription>A deal matches when every set condition is true. Approvers decide in order; a step the requester would decide passes by itself.</DialogDescription></DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <Field label="Name" htmlFor="r-name" error={f.errors.name} required><Input id="r-name" value={f.values.name} onChange={(e) => f.set("name", e.target.value)} autoFocus /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="GM below (%)" htmlFor="r-gm" error={f.errors.gmBelowPct}><Input id="r-gm" inputMode="decimal" value={f.values.gmBelowPct} onChange={(e) => f.set("gmBelowPct", e.target.value)} placeholder="e.g. 12" /></Field>
            <Field label="Value at least (₹)" htmlFor="r-value" error={f.errors.dealValueAtLeast}><Input id="r-value" inputMode="decimal" value={f.values.dealValueAtLeast} onChange={(e) => f.set("dealValueAtLeast", e.target.value)} placeholder="e.g. 10000000" /></Field>
            <Field label="Business unit" htmlFor="r-bu" error={f.errors.businessUnitId}><OptionSelect id="r-bu" value={f.values.businessUnitId} onChange={(v) => f.set("businessUnitId", v)} options={L.businessUnits} none="Any" /></Field>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Approvers, in order</span><Button type="button" size="xs" variant="outline" onClick={() => f.set("steps", [...f.values.steps, { approverKind: "ROLE", approverRole: "SALES_HEAD", approverUserId: null }])} disabled={f.values.steps.length >= 6}><Plus /> Add step</Button></div>
            {f.values.steps.map((s, i) => (
              <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] items-center gap-2">
                <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                <OptionSelect value={s.approverKind} onChange={(v) => setStep(i, { approverKind: (v ?? "OWNER_MANAGER") as Step["approverKind"], approverRole: v === "ROLE" ? "SALES_HEAD" : null, approverUserId: null })} options={KINDS} label={`Step ${i + 1} kind`} />
                {s.approverKind === "ROLE" ? <OptionSelect value={s.approverRole} onChange={(v) => setStep(i, { approverRole: (v ?? "SALES_HEAD") as Step["approverRole"] })} options={ROLES} label={`Step ${i + 1} role`} /> : s.approverKind === "USER" ? <OptionSelect value={s.approverUserId} onChange={(v) => setStep(i, { approverUserId: v })} options={people.map((p) => ({ id: p.id, name: p.fullName }))} placeholder="Pick a person" label={`Step ${i + 1} person`} /> : <span className="text-xs text-muted-foreground">Whoever the deal owner reports to</span>}
                <Button type="button" variant="ghost" size="icon-xs" aria-label={`Remove step ${i + 1}`} onClick={() => f.set("steps", f.values.steps.filter((_, j) => j !== i))}><X /></Button>
              </div>
            ))}
            {f.errors.steps && <p className="text-xs text-destructive">{f.errors.steps}</p>}
          </div>
          <div className="flex items-center gap-2"><Switch id="r-active" checked={f.values.isActive} onCheckedChange={(v) => f.set("isActive", v)} /><label htmlFor="r-active" className="text-sm">Active</label></div>
          <FormError message={f.formError && !Object.keys(f.errors).length ? f.formError : null} />
          <DialogFooter><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={f.pending}>{rule ? "Save" : "Add rule"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
