"use client";
// Settings → Approvals: the admin defines when a deal's prices need approval before the quote goes out, and who
// approves, in order. Every condition ticked on a rule must hold; add several rules for "or".
import { useState } from "react";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input, Field, Select } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveApprovalRule, deleteApprovalRule } from "@/server/actions/admin";
import { cn } from "@/lib/utils";

type Step = { kind: "OWNER_MANAGER" | "ROLE" | "USER"; role: string | null; userId: string | null };
export type RuleRow = {
  id: string; name: string; active: boolean; gmBelowPct: number | null; rateCardDiscount: boolean; minDealValue: number | null;
  businessUnitIds: string[]; steps: Step[];
};
type Opt = { id: string; name: string };

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
/** One select value per approver choice: "manager", "role:SALES_HEAD", "user:<id>" */
const stepKey = (s: Step) => (s.kind === "OWNER_MANAGER" ? "manager" : s.kind === "ROLE" ? `role:${s.role}` : `user:${s.userId}`);
const fromKey = (k: string): Step =>
  k === "manager" ? { kind: "OWNER_MANAGER", role: null, userId: null } : k.startsWith("role:") ? { kind: "ROLE", role: k.slice(5), userId: null } : { kind: "USER", role: null, userId: k.slice(5) };

export function ApprovalRules({ rules, bus, approvers }: { rules: RuleRow[]; bus: Opt[]; approvers: (Opt & { role: string })[] }) {
  const [editing, setEditing] = useState<RuleRow | "new" | null>(null);
  const { pending, run } = useAction();
  const stepLabel = (s: Step) =>
    s.kind === "OWNER_MANAGER" ? "Deal owner's manager" : s.kind === "ROLE" ? (s.role === "ADMIN" ? "Any Admin" : "Any Sales Head") : approvers.find((a) => a.id === s.userId)?.name ?? "A person who left";
  const conditions = (r: RuleRow) =>
    [
      r.gmBelowPct !== null && `GM below ${r.gmBelowPct}%`,
      r.rateCardDiscount && "Rate card discount",
      r.minDealValue !== null && `Deal value ${inr(r.minDealValue)} or more`,
      r.businessUnitIds.length ? `only ${r.businessUnitIds.map((id) => bus.find((b) => b.id === id)?.name ?? "?").join(", ")}` : null,
    ].filter(Boolean).join(" and ");
  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[13px] font-semibold">Price approval rules</h2>
          <p className="mt-0.5 max-w-2xl text-xs text-ink-3">
            When a deal&apos;s prices meet a rule, the deal owner asks for approval before sending the quote, and the approvers sign off in order.
            Every condition on a rule must hold; add several rules for &ldquo;or&rdquo;. With no rules, quotes go out without approval.
          </p>
        </div>
        <Button variant="primary" onClick={() => setEditing("new")}><Plus /> New rule</Button>
      </div>
      <Card>
        {rules.length === 0 ? (
          <p className="flex flex-col items-center gap-2 px-5 py-10 text-center text-sm text-ink-3"><ShieldCheck className="size-5" /> No approval rules yet.</p>
        ) : (
          <ul aria-label="Approval rules">
            {rules.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start gap-3 border-t border-border px-5 py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium">{r.name}{!r.active && <Badge tone="slate">Off</Badge>}</p>
                  <p className="text-xs text-ink-2">When {conditions(r)}</p>
                  <p className="text-xs text-ink-3">Approved by {r.steps.map(stepLabel).join(" → ")}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(r)} aria-label={`Edit ${r.name}`}><Pencil /> Edit</Button>
                <Button
                  size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${r.name}`}
                  onClick={() => { if (confirm(`Delete the rule "${r.name}"?`)) run(() => deleteApprovalRule(r.id), { success: "Rule deleted" }); }}
                ><Trash2 /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && <RuleForm rule={editing === "new" ? null : editing} bus={bus} approvers={approvers} close={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}

function RuleForm({ rule, bus, approvers, close }: { rule: RuleRow | null; bus: Opt[]; approvers: (Opt & { role: string })[]; close: () => void }) {
  const [name, setName] = useState(rule?.name ?? "");
  const [active, setActive] = useState(rule?.active ?? true);
  const [gmOn, setGmOn] = useState(rule ? rule.gmBelowPct !== null : false);
  const [gm, setGm] = useState(rule?.gmBelowPct?.toString() ?? "");
  const [rc, setRc] = useState(rule?.rateCardDiscount ?? false);
  const [valueOn, setValueOn] = useState(rule ? rule.minDealValue !== null : false);
  const [value, setValue] = useState(rule?.minDealValue?.toString() ?? "");
  const [buIds, setBuIds] = useState<string[]>(rule?.businessUnitIds ?? []);
  const [steps, setSteps] = useState<Step[]>(rule?.steps.length ? rule.steps : [{ kind: "OWNER_MANAGER", role: null, userId: null }]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  const move = (i: number, d: -1 | 1) => setSteps((xs) => { const ys = [...xs]; const [x] = ys.splice(i, 1); ys.splice(i + d, 0, x!); return ys; });
  const check = "accent-[var(--primary)]";
  return (
    <DialogContent title={rule ? "Edit approval rule" : "New approval rule"} description="Every condition ticked must hold for the rule to apply." wide>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          run(
            () => saveApprovalRule(rule?.id ?? null, {
              name, active, rateCardDiscount: rc, businessUnitIds: buIds, steps,
              gmBelowPct: gmOn ? gm : null, minDealValue: valueOn ? value : null,
            }),
            { success: "Rule saved", onOk: close, onError: (r) => setErrors({ ...(r.fieldErrors ?? {}), form: r.error ?? "" }) },
          );
        }}
      >
        <Field label="Name" required error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Rule name" placeholder="e.g. Low margin" />
        </Field>
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Conditions">
          <legend className="px-1 text-xs font-medium text-ink-2">When</legend>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <input type="checkbox" checked={gmOn} onChange={(e) => setGmOn(e.target.checked)} className={check} aria-label="GM below a threshold" />
            Contract GM is below
            <Input value={gm} onChange={(e) => { setGm(e.target.value); setGmOn(true); }} inputMode="decimal" className="h-8 w-20 text-right" aria-label="GM threshold %" />%
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={rc} onChange={(e) => setRc(e.target.checked)} className={check} aria-label="Rate card discount" />
            A rate card item (Cloud, NOC, SOC) is priced below its rate card price
          </label>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <input type="checkbox" checked={valueOn} onChange={(e) => setValueOn(e.target.checked)} className={check} aria-label="Deal value above a threshold" />
            The deal value is at least ₹
            <Input value={value} onChange={(e) => { setValue(e.target.value); setValueOn(true); }} inputMode="numeric" className="h-8 w-36 text-right" aria-label="Deal value threshold" />
          </label>
          <div className="text-[13px]">
            <p className="text-xs text-ink-3">Only for deals with lines in (none ticked: any business unit)</p>
            <div className="mt-1 flex flex-wrap gap-3">
              {bus.map((b) => (
                <label key={b.id} className="flex items-center gap-1.5">
                  <input type="checkbox" className={check} checked={buIds.includes(b.id)} onChange={(e) => setBuIds((xs) => (e.target.checked ? [...xs, b.id] : xs.filter((x) => x !== b.id)))} aria-label={`Business unit ${b.name}`} />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          {errors.conditions && <p className="text-xs text-[var(--t-red)]">{errors.conditions}</p>}
        </fieldset>
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border p-3" aria-label="Approvers">
          <legend className="px-1 text-xs font-medium text-ink-2">Approved by, in order</legend>
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-5 text-xs tabular text-ink-3">{i + 1}.</span>
              <Select value={stepKey(s)} onChange={(e) => setSteps((xs) => xs.map((x, j) => (j === i ? fromKey(e.target.value) : x)))} aria-label={`Approver ${i + 1}`} className="min-w-0 flex-1">
                <option value="manager">Deal owner&apos;s manager</option>
                <option value="role:SALES_HEAD">Any Sales Head</option>
                <option value="role:ADMIN">Any Admin</option>
                <optgroup label="A named person">
                  {approvers.map((a) => <option key={a.id} value={`user:${a.id}`}>{a.name}</option>)}
                </optgroup>
              </Select>
              <Button type="button" size="icon-sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move approver ${i + 1} up`}><ArrowUp /></Button>
              <Button type="button" size="icon-sm" variant="ghost" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move approver ${i + 1} down`}><ArrowDown /></Button>
              <Button type="button" size="icon-sm" variant="ghost" disabled={steps.length === 1} onClick={() => setSteps((xs) => xs.filter((_, j) => j !== i))} aria-label={`Remove approver ${i + 1}`}><X /></Button>
            </div>
          ))}
          {steps.length < 6 && (
            <Button type="button" size="sm" className="w-fit" onClick={() => setSteps((xs) => [...xs, { kind: "ROLE", role: "SALES_HEAD", userId: null }])}><Plus /> Add approver</Button>
          )}
          <p className="text-xs text-ink-3">Nobody approves their own prices: a step whose only approver asked for the approval passes on its own. A step with no one available goes to an Admin.</p>
          {errors.steps && <p className="text-xs text-[var(--t-red)]">{errors.steps}</p>}
        </fieldset>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className={check} aria-label="Rule is on" /> Rule is on
        </label>
        {errors.form && !errors.conditions && !errors.steps && <p className={cn("text-xs text-[var(--t-red)]")}>{errors.form}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={close}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={pending}>Save rule</Button>
        </div>
      </form>
    </DialogContent>
  );
}
