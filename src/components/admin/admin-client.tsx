"use client";
import { useState } from "react";
import { Plus, Pencil, RefreshCw, Save, Unlock, Send, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/input";
import { useAction } from "@/components/crm/use-action";
import { saveUser, unlockUser, saveEmailSettings, sendTestEmail, addPicklistValue, togglePicklistValue, togglePicklistFlag, saveTargets, runRecompute } from "@/server/actions/admin";
import { PASSWORD_HINT } from "@/lib/password";
import { ROLE_LABEL } from "@/lib/constants";
import { inr } from "@/lib/format";
import { cn } from "@/lib/utils";

/** A random password that meets the policy, for the administrator to pass on */
function tempPassword() {
  const pick = (set: string) => set[crypto.getRandomValues(new Uint32Array(1))[0]! % set.length]!;
  const words = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnpqrstuvwxyz", digits = "23456789";
  return [pick(words), ...Array.from({ length: 6 }, () => pick(lower)), pick(digits), pick(digits), pick(digits), pick(words), pick(lower)].join("");
}

export function UserDialog({ id, initial, emailOn = false, openWork = 0, people = [] }: {
  id?: string; initial?: { name: string; email: string; role: string; title: string | null; phone: string | null; active: boolean }; emailOn?: boolean;
  /** Open deals, requests and leads this person holds */
  openWork?: number;
  people?: { id: string; name: string; role: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(initial?.active ?? true);
  const [role, setRole] = useState(initial?.role ?? "SALES");
  // Leaving, or changing job, with open work: someone in the same line of work takes it over
  const leaving = !!id && !!initial && openWork > 0 && ((initial.active && !active) || role !== initial.role);
  const sameLine = (r: string) => r === initial?.role || (["SALES", "SALES_HEAD"].includes(r) && ["SALES", "SALES_HEAD"].includes(initial?.role ?? ""));
  const successors = people.filter((p) => p.id !== id && sameLine(p.role));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pw, setPw] = useState("");
  const [shown, setShown] = useState(false);
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {id ? <Button size="icon-sm" variant="ghost" aria-label="Edit user"><Pencil /></Button> : <Button variant="primary"><Plus /> Add user</Button>}
      </DialogTrigger>
      <DialogContent
        title={id ? "Edit user" : "Add user"}
        description={id ? "Setting a password signs the user out; they choose their own at next sign-in." : emailOn ? "Leave the password blank to email an invitation link." : "The user chooses their own password at first sign-in."}
      >
        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget).entries());
            f.active = active ? "true" : "false";
            run(() => saveUser(id ?? null, f), {
              success: !id && !f.password ? "Invitation sent" : "User saved",
              onOk: () => { setOpen(false); setPw(""); setShown(false); },
              onError: (r) => setErrors(r.fieldErrors ?? {}),
            });
          }}
        >
          <Field label="Full name" required error={errors.name}><Input name="name" defaultValue={initial?.name} /></Field>
          <Field label="Email" required error={errors.email}><Input name="email" type="email" defaultValue={initial?.email} /></Field>
          <Field label="Role" required>
            <Select name="role" value={role} onChange={(e) => setRole(e.target.value)}>{Object.entries(ROLE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Title"><Input name="title" defaultValue={initial?.title ?? ""} /></Field>
          <Field label="Phone"><Input name="phone" defaultValue={initial?.phone ?? ""} /></Field>
          <Field label={id ? "Reset password" : "Temporary password"} required={!id && !emailOn} error={errors.password} hint={pw ? PASSWORD_HINT : undefined}>
            <div className="flex gap-1.5">
              <Input
                name="password" type={shown ? "text" : "password"} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)}
                placeholder={id ? "Leave blank to keep" : emailOn ? "Blank: email an invitation" : ""} aria-label={id ? "Reset password" : "Temporary password"}
              />
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Generate a password" title="Generate a password" onClick={() => { setPw(tempPassword()); setShown(true); }}><Wand2 /></Button>
            </div>
          </Field>
          {id && (
            <label className="flex items-center gap-2 text-[13px] text-ink-2 sm:col-span-2">
              <input type="checkbox" name="active" checked={active} onChange={(e) => setActive(e.target.checked)} className="accent-[var(--primary)]" /> Active (inactive users cannot sign in)
            </label>
          )}
          {leaving && (
            <Field label={`Hand over ${openWork} open item${openWork > 1 ? "s" : ""} to`} required error={errors.handoverToId} className="sm:col-span-2" hint="Their open deals, requests and leads move to this person, who is notified.">
              <Select name="handoverToId" defaultValue="" aria-label="Hand over to">
                <option value="" disabled>Select</option>
                {successors.map((p) => <option key={p.id} value={p.id}>{p.name} · {ROLE_LABEL[p.role as keyof typeof ROLE_LABEL]}</option>)}
              </Select>
            </Field>
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
 * Picklist values: click to activate or deactivate. Categories and OEMs also carry flags (needs presales; runs deal
 * registration, own brand) that are switched by picking the flag first; flagged values are marked with its dot.
 */
export type PicklistFlag = { key: string; label: string };
const FLAG_COLORS = ["var(--primary)", "var(--s3)"];

export function PicklistEditor({
  title, type, kind, values, flags = [],
}: {
  title: string; type: string; kind: "OEM" | "CATEGORY" | "VALUE";
  values: { id: string; label: string; active: boolean; flags?: Record<string, boolean> }[];
  flags?: PicklistFlag[];
}) {
  const [v, setV] = useState("");
  const [mode, setMode] = useState("active");
  const { pending, run } = useAction();
  const flag = flags.find((f) => f.key === mode);
  const color = (key: string) => FLAG_COLORS[flags.findIndex((f) => f.key === key)] ?? FLAG_COLORS[0];
  const click = (x: (typeof values)[number]) =>
    flag && kind !== "VALUE"
      ? run(() => togglePicklistFlag(kind, x.id, flag.key), { success: `${x.label}: ${flag.label.toLowerCase()} ${x.flags?.[flag.key] ? "off" : "on"}` })
      : run(() => togglePicklistValue(kind, x.id), { success: x.active ? `${x.label} deactivated` : `${x.label} activated` });
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <p className="text-[13px] font-semibold">{title} <span className="font-normal text-ink-3">{values.filter((x) => x.active).length}</span></p>
        {flags.length > 0 && (
          <div role="radiogroup" aria-label={`${title} click action`} className="ml-auto inline-flex rounded-md bg-surface-2 p-0.5 text-[11px]">
            {[{ key: "active", label: "Active" }, ...flags].map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={mode === m.key} onClick={() => setMode(m.key)} className={cn("rounded px-1.5 py-0.5 cursor-pointer", mode === m.key ? "bg-surface font-medium shadow-sm" : "text-ink-3")}>
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 p-3">
        {values.map((x) => {
          const on = flags.filter((f) => x.flags?.[f.key]);
          return (
            <button
              key={x.id}
              disabled={pending}
              onClick={() => click(x)}
              title={flag ? `Click to turn "${flag.label}" ${x.flags?.[flag.key] ? "off" : "on"}` : x.active ? "Click to deactivate" : "Click to reactivate"}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs cursor-pointer",
                x.active ? "border-border bg-surface-2 text-ink" : "border-dashed border-border text-ink-3 line-through",
                flag && x.flags?.[flag.key] && "border-[color-mix(in_srgb,var(--primary)_40%,transparent)]",
              )}
            >
              {on.map((f) => <span key={f.key} className="size-1.5 rounded-full" style={{ background: color(f.key) }} aria-label={f.label} />)}
              {x.label}
            </button>
          );
        })}
      </div>
      {flags.length > 0 && (
        <p className="flex flex-wrap gap-x-3 px-3 pb-2 text-[11px] text-ink-3">
          {flags.map((f) => <span key={f.key}><span className="mr-1 inline-block size-1.5 rounded-full align-middle" style={{ background: color(f.key) }} />{f.label}</span>)}
        </p>
      )}
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

export function UnlockButton({ id, name }: { id: string; name: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unlockUser(id), { success: `${name} unlocked` })}>
      <Unlock /> Unlock
    </Button>
  );
}

type EmailForm = { enabled: boolean; host: string; port: number; security: "tls" | "starttls" | "none"; user: string; fromName: string; fromEmail: string; appUrl: string; hasPassword: boolean };

/** Admin → Email: the SMTP server the CRM sends password reset links and invitations through */
export function EmailSettingsCard({ initial, adminEmail, appUrlFromEnv }: { initial: EmailForm; adminEmail: string; appUrlFromEnv?: string }) {
  const [v, setV] = useState(initial);
  const [password, setPassword] = useState("");
  const [testTo, setTestTo] = useState(adminEmail);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction();
  const test = useAction();
  const set = <K extends keyof EmailForm>(k: K, val: EmailForm[K]) => setV((x) => ({ ...x, [k]: val }));
  const payload = () => ({ ...v, password: password || undefined, appUrl: v.appUrl || "" });
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <div className="rounded-xl border border-border bg-surface">
      <div className="border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold">Email</h2>
        <p className="mt-0.5 text-xs text-ink-3">Optional. When on, people can reset a forgotten password by email and new users get an invitation link.</p>
      </div>
      <form
        className="grid gap-3 p-5 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.run(() => saveEmailSettings(payload()), { success: "Email settings saved", onOk: () => { setErrors({}); setPassword(""); if (password) set("hasPassword", true); }, onError: (r) => setErrors(r.fieldErrors ?? {}) });
        }}
      >
        <label className="flex items-center gap-2 text-[13px] sm:col-span-2">
          <input type="checkbox" checked={v.enabled} onChange={(e) => set("enabled", e.target.checked)} className="accent-[var(--primary)]" aria-label="Send email" /> Send email from the CRM
        </label>
        <Field label="SMTP server" error={errors.host} hint="e.g. smtp.office365.com, smtp.gmail.com, smtp.zoho.in">
          <Input value={v.host} onChange={(e) => set("host", e.target.value)} aria-label="SMTP server" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Port" error={errors.port}><Input type="number" value={v.port} onChange={(e) => set("port", Number(e.target.value))} aria-label="Port" /></Field>
          <Field label="Security" hint={v.security === "tls" ? "Usually port 465" : v.security === "starttls" ? "Usually port 587" : "Unencrypted"}>
            <Select value={v.security} onChange={(e) => set("security", e.target.value as EmailForm["security"])} aria-label="Security">
              <option value="starttls">STARTTLS</option>
              <option value="tls">SSL/TLS</option>
              <option value="none">None</option>
            </Select>
          </Field>
        </div>
        <Field label="Username" error={errors.user}><Input value={v.user} onChange={(e) => set("user", e.target.value)} autoComplete="off" aria-label="SMTP username" /></Field>
        <Field label="Password" hint={v.hasPassword ? "Saved. Leave blank to keep it." : "Stored encrypted; never shown again."}>
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder={v.hasPassword ? "••••••••" : ""} aria-label="SMTP password" />
        </Field>
        <Field label="From name"><Input value={v.fromName} onChange={(e) => set("fromName", e.target.value)} aria-label="From name" /></Field>
        <Field label="From address" error={errors.fromEmail}><Input type="email" value={v.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} placeholder="crm@yourcompany.com" aria-label="From address" /></Field>
        <Field
          label="CRM web address" error={errors.appUrl} className="sm:col-span-2"
          hint={appUrlFromEnv ? `Set by APP_URL on the server: ${appUrlFromEnv}` : "Used for links in emails. The address people type to open the CRM."}
        >
          <div className="flex gap-1.5">
            <Input value={appUrlFromEnv ?? v.appUrl} disabled={!!appUrlFromEnv} onChange={(e) => set("appUrl", e.target.value)} placeholder="https://crm.yourcompany.com" aria-label="CRM web address" />
            {!appUrlFromEnv && origin && v.appUrl !== origin && <Button type="button" size="sm" variant="ghost" onClick={() => set("appUrl", origin)}>Use {origin}</Button>}
          </div>
        </Field>
        <div className="flex flex-wrap items-end justify-between gap-2 border-t border-border pt-3 sm:col-span-2">
          <div className="flex items-end gap-1.5">
            <Field label="Send a test to"><Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Test recipient" /></Field>
            <Button type="button" disabled={test.pending || !v.host} onClick={() => test.run(() => sendTestEmail(payload(), testTo), { success: `Test email sent to ${testTo}` })}>
              <Send /> Send test
            </Button>
          </div>
          <Button type="submit" variant="primary" disabled={save.pending}><Save /> Save</Button>
        </div>
      </form>
    </div>
  );
}
