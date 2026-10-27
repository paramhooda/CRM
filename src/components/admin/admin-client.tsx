"use client";
import { useState } from "react";
import { Plus, Pencil, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveUser, addPicklistValue, togglePicklistValue, togglePicklistFlag, saveTargets, runRecompute } from "@/server/actions/admin";
import { ROLE_LABEL } from "@/lib/constants";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

export function UserDialog({ id, initial }: { id?: string; initial?: { name: string; email: string; role: string; title: string | null; phone: string | null; active: boolean } }) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? <Button size="icon-sm" variant="ghost" aria-label="Edit user"><Pencil /></Button> : <Button variant="primary"><Plus /> Add user</Button>}
      </DialogTrigger>
      <DialogContent title={id ? "Edit user" : "Add user"} description="Passwords need 10+ characters with upper, lower case and a number.">
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            if (id && !f.active) f.active = "false";
            run(() => saveUser(id ?? null, f), { success: "User saved", onOk: () => setOpen(false), onError: (r) => setErrors(r.fieldErrors ?? {}) });
          }}
        >
          <Field label="Full name" required error={errors.name}><Input name="name" defaultValue={initial?.name} /></Field>
          <Field label="Email" required error={errors.email}><Input name="email" type="email" defaultValue={initial?.email} /></Field>
          <Field label="Role" required>
            <Select name="role" defaultValue={initial?.role ?? "SALES"}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Title"><Input name="title" defaultValue={initial?.title ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={initial?.phone ?? ""} /></Field>
          <Field label={id ? "Reset password" : "Initial password"} required={!id} error={errors.password}><Input name="password" type="password" autoComplete="new-password" placeholder={id ? "Leave blank to keep" : ""} /></Field>
          {id && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
              <input type="checkbox" name="active" defaultChecked={initial?.active} className="accent-[var(--primary)]" /> Active (inactive users cannot sign in)
            </label>
          )}
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={pending}>Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Picklist values: click to activate or deactivate. Categories and OEMs also carry a flag (needs presales / runs deal
 * registration) that is switched in the second mode; flagged values are marked with a dot.
 */
export function PicklistEditor({
  title, type, kind, values, flagLabel,
}: { title: string; type: string; kind: "OEM" | "CATEGORY" | "VALUE"; values: { id: string; label: string; active: boolean; flag?: boolean }[]; flagLabel?: string }) {
  const [v, setV] = useState("");
  const [mode, setMode] = useState<"active" | "flag">("active");
  const { pending, run } = useAction();
  const click = (x: (typeof values)[number]) =>
    mode === "flag" && kind !== "VALUE"
      ? run(() => togglePicklistFlag(kind, x.id), { success: `${x.label}: ${flagLabel?.toLowerCase()} ${x.flag ? "off" : "on"}` })
      : run(() => togglePicklistValue(kind, x.id), { success: x.active ? `${x.label} deactivated` : `${x.label} activated` });
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-[13px] font-semibold">{title} <span className="font-normal text-ink-3">{values.filter((x) => x.active).length}</span></p>
        {flagLabel && (
          <div role="radiogroup" aria-label={`${title} click action`} className="ml-auto inline-flex rounded-md bg-surface-2 p-0.5 text-[11px]">
            {(["active", "flag"] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={cn("rounded px-1.5 py-0.5 cursor-pointer", mode === m ? "bg-surface font-medium shadow-sm" : "text-ink-3")}>
                {m === "active" ? "Active" : flagLabel}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 p-3">
        {values.map((x) => (
          <button
            key={x.id}
            disabled={pending}
            onClick={() => click(x)}
            title={mode === "flag" ? `Click to turn "${flagLabel}" ${x.flag ? "off" : "on"}` : x.active ? "Click to deactivate" : "Click to reactivate"}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs cursor-pointer",
              x.active ? "border-border bg-surface-2 text-ink" : "border-dashed border-border text-ink-3 line-through",
              x.flag && "border-[color-mix(in_srgb,var(--primary)_40%,transparent)]",
            )}
          >
            {x.flag && <span className="size-1.5 rounded-full bg-primary" aria-label={flagLabel} />}
            {x.label}
          </button>
        ))}
      </div>
      {flagLabel && <p className="px-3 pb-2 text-[11px] text-ink-3"><span className="mr-1 inline-block size-1.5 rounded-full bg-primary align-middle" />{flagLabel}</p>}
      <form
        className="flex gap-2 border-t border-border p-2"
        onSubmit={(e) => { e.preventDefault(); run(() => addPicklistValue(type, v), { success: "Added", onOk: () => setV("") }); }}
      >
        <Input value={v} onChange={(e) => setV(e.target.value)} placeholder="Add value" className="h-7" />
        <Button size="sm" type="submit" disabled={!v.trim() || pending}><Plus /> Add</Button>
      </form>
    </div>
  );
}

export function TargetsGrid({ fy, rows }: { fy: number; rows: { userId: string; name: string; q: number[] }[] }) {
  const [grid, setGrid] = useState(rows);
  const [dirty, setDirty] = useState(false);
  const { pending, run } = useAction();
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[13px] font-semibold">Quarterly targets · FY{String(fy).slice(-2)} <span className="font-normal text-ink-3">(INR)</span></p>
        <Button
          size="sm"
          variant="primary"
          disabled={!dirty || pending}
          onClick={() => run(() => saveTargets(fy, grid.flatMap((r) => r.q.map((amount, i) => ({ userId: r.userId, quarter: i + 1, amount })))), { success: "Targets saved", onOk: () => setDirty(false) })}
        >
          <Save /> Save targets
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-3">
              <th className="px-3 py-2 font-medium">Sales person</th>
              {["Q1 Apr–Jun", "Q2 Jul–Sep", "Q3 Oct–Dec", "Q4 Jan–Mar"].map((q) => <th key={q} className="px-2 py-2 text-right font-medium">{q}</th>)}
              <th className="px-3 py-2 text-right font-medium">Annual</th>
            </tr>
          </thead>
          <tbody>
            {grid.map((r, ri) => (
              <tr key={r.userId} className="border-t border-border">
                <td className="px-3 py-1.5">{r.name}</td>
                {r.q.map((val, qi) => (
                  <td key={qi} className="px-2 py-1.5">
                    <Input
                      type="number"
                      min={0}
                      step={100000}
                      value={val}
                      onChange={(e) => {
                        const n = Number(e.target.value) || 0;
                        setGrid((g) => g.map((x, i) => (i === ri ? { ...x, q: x.q.map((y, j) => (j === qi ? n : y)) } : x)));
                        setDirty(true);
                      }}
                      className="h-7 text-right tabular"
                    />
                  </td>
                ))}
                <td className="px-3 py-1.5 text-right font-medium tabular">{inr(r.q.reduce((a, b) => a + b, 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RecomputeButton() {
  const { pending, run } = useAction();
  return (
    <Button disabled={pending} onClick={() => run(() => runRecompute(), { onOk: (r) => toast.success(`Re-evaluated ${(r.data as { count: number }).count} opportunities`) })}>
      <RefreshCw className={pending ? "animate-spin" : ""} /> Re-run health rules now
    </Button>
  );
}
