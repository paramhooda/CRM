"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Building2, Mail, BellRing, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormError } from "@/components/crm/form";
import { TintIcon } from "@/components/crm/pills";
import { api, errorMessage, isApiError } from "@/client/api";

type Dict = Record<string, unknown>;

/** One card per setting key: local state, one Save, field errors from the server. */
function useSetting(key: string, initial: Dict) {
  const router = useRouter();
  const [v, setV] = useState<Dict>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const set = (k: string, x: unknown) => { setV((o) => ({ ...o, [k]: x })); setErrors((e) => { const { [k]: _d, ...rest } = e; return rest; }); };
  const save = async (prepare: (d: Dict) => Dict = (d) => d) => {
    setPending(true);
    setErrors({});
    try {
      await api.put(`/admin/settings/${key}`, prepare(v));
      toast.success("Saved");
      router.refresh();
    } catch (e) {
      if (isApiError(e) && Object.keys(e.fields).length) setErrors(e.fields);
      toast.error(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  const str = (k: string) => (v[k] == null ? "" : String(v[k]));
  return { v, set, str, errors, pending, save };
}

function SettingCard({ icon, tone, title, description, children, footer }: { icon: typeof Building2; tone: "blue" | "green" | "amber" | "red"; title: string; description: string; children: ReactNode; footer: ReactNode }) {
  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <div className="flex items-start gap-3">
          <TintIcon icon={icon} tone={tone} />
          <div><CardTitle className="text-[17px]">{title}</CardTitle><CardDescription className="mt-1">{description}</CardDescription></div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {children}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">{footer}</div>
      </CardContent>
    </Card>
  );
}

export function SettingsForms({ company, mail, alerts, ai, adminEmail }: { company: Dict; mail: Dict; alerts: Dict; ai: Dict; adminEmail: string }) {
  const c = useSetting("company", company);
  const m = useSetting("mail", { ...mail, password: "" });
  const a = useSetting("alerts", alerts);
  const i = useSetting("ai", { ...ai, apiKey: "" });
  const [testing, setTesting] = useState<"mail" | "ai" | null>(null);
  const test = async (kind: "mail" | "ai") => {
    setTesting(kind);
    try {
      const r = await api.post<{ to?: string; text?: string }>(`/admin/settings/${kind}/test`);
      toast.success(kind === "mail" ? `Test email sent to ${r.to}` : `The assistant answered: ${r.text}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(null);
    }
  };
  const blank = (d: Dict) => Object.fromEntries(Object.entries(d).map(([k, x]) => [k, x === "" ? null : x]));
  const num = (x: string) => (x.trim() === "" ? null : Number(x));
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SettingCard icon={Building2} tone="blue" title="Company" description="Printed at the top of every quote, with your logo." footer={<Button onClick={() => c.save(blank)} disabled={c.pending}>Save company</Button>}>
        <Field label="Company name" htmlFor="co-name" error={c.errors.name} required><Input id="co-name" value={c.str("name")} onChange={(e) => c.set("name", e.target.value)} /></Field>
        <Field label="Address" htmlFor="co-address" error={c.errors.addressLine}><Input id="co-address" value={c.str("addressLine")} onChange={(e) => c.set("addressLine", e.target.value)} /></Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="co-city" error={c.errors.city}><Input id="co-city" value={c.str("city")} onChange={(e) => c.set("city", e.target.value)} /></Field>
          <Field label="State" htmlFor="co-state" error={c.errors.state}><Input id="co-state" value={c.str("state")} onChange={(e) => c.set("state", e.target.value)} /></Field>
          <Field label="Pincode" htmlFor="co-pin" error={c.errors.pincode}><Input id="co-pin" value={c.str("pincode")} onChange={(e) => c.set("pincode", e.target.value)} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="GSTIN" htmlFor="co-gstin" error={c.errors.gstin}><Input id="co-gstin" value={c.str("gstin")} onChange={(e) => c.set("gstin", e.target.value)} className="font-mono" /></Field>
          <Field label="Phone" htmlFor="co-phone" error={c.errors.phone}><Input id="co-phone" value={c.str("phone")} onChange={(e) => c.set("phone", e.target.value)} /></Field>
          <Field label="Email" htmlFor="co-email" error={c.errors.email}><Input id="co-email" value={c.str("email")} onChange={(e) => c.set("email", e.target.value)} /></Field>
          <Field label="Website" htmlFor="co-web" error={c.errors.website}><Input id="co-web" value={c.str("website")} onChange={(e) => c.set("website", e.target.value)} /></Field>
        </div>
        <Field label="Quote terms" htmlFor="co-terms" error={c.errors.quoteTerms} hint="Printed under the lines of every quote."><Textarea id="co-terms" rows={3} value={c.str("quoteTerms")} onChange={(e) => c.set("quoteTerms", e.target.value)} /></Field>
      </SettingCard>

      <SettingCard icon={Mail} tone="green" title="Email" description="The SMTP server the portal sends proposals through. Mail goes out from each person's own address." footer={<><Button onClick={() => m.save((d) => ({ ...blank(d), port: Number(d.port) || 587, password: d.password === "" && mail.passwordSet ? undefined : d.password }))} disabled={m.pending}>Save email</Button><Button variant="outline" onClick={() => test("mail")} disabled={testing === "mail" || !mail.host}>Send me a test email</Button><span className="text-xs text-muted-foreground">{mail.host ? `Set up: ${String(mail.host)}:${String(mail.port)} · test goes to ${adminEmail}` : "Not set up yet: the Send proposal button offers download only."}</span></>}>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="SMTP host" htmlFor="mail-host" error={m.errors.host} hint="e.g. smtp.office365.com"><Input id="mail-host" value={m.str("host")} onChange={(e) => m.set("host", e.target.value)} /></Field>
          <Field label="Port" htmlFor="mail-port" error={m.errors.port}><Input id="mail-port" inputMode="numeric" value={m.str("port")} onChange={(e) => m.set("port", e.target.value)} /></Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Username" htmlFor="mail-user" error={m.errors.user}><Input id="mail-user" value={m.str("user")} onChange={(e) => m.set("user", e.target.value)} autoComplete="off" /></Field>
          <Field label="Password" htmlFor="mail-pass" error={m.errors.password} hint={mail.passwordSet ? "A password is stored; leave blank to keep it." : undefined}><Input id="mail-pass" type="password" value={m.str("password")} onChange={(e) => m.set("password", e.target.value)} autoComplete="new-password" /></Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!m.v.secure} onCheckedChange={(x) => m.set("secure", x)} aria-label="TLS from the start" /> TLS from the start (port 465). Off means STARTTLS on 587.</label>
        <p className="text-xs text-muted-foreground">The server must allow each sales person&apos;s address as the sender (Microsoft 365: &quot;Send As&quot; on a relay account, or per-user SMTP AUTH).</p>
      </SettingCard>

      <SettingCard icon={BellRing} tone="amber" title="Alerts and approvals" description="Everything here starts off. Switch on what matches your process." footer={<><Button onClick={() => a.save((d) => ({ ...d, gmAmberBelowPct: num(String(d.gmAmberBelowPct ?? "")), quietDays: num(String(d.quietDays ?? "")) }))} disabled={a.pending}>Save alerts</Button><Button asChild variant="outline"><Link href="/admin/approval-rules">Approval rules</Link></Button><span className="text-xs text-muted-foreground">Price approvals are rules of their own; both example rules are off until you switch them on.</span></>}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Expected GM amber below (%)" htmlFor="al-gm" error={a.errors.gmAmberBelowPct} hint="Home tiles and business-unit rows turn amber under this. Blank = off."><Input id="al-gm" inputMode="decimal" value={a.str("gmAmberBelowPct")} onChange={(e) => a.set("gmAmberBelowPct", e.target.value)} placeholder="off" /></Field>
          <Field label="Quiet deal after (days)" htmlFor="al-quiet" error={a.errors.quietDays} hint="Pipeline review flags a deal with no change for this long. Blank = off."><Input id="al-quiet" inputMode="numeric" value={a.str("quietDays")} onChange={(e) => a.set("quietDays", e.target.value)} placeholder="off" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([["closeDatePassed", "Flag deals past their close date"], ["stuck", "Flag deals stuck longer than the stage norm"], ["commitWithoutProposal", "Flag Commit deals without a proposal"], ["noNextStep", "Flag deals with no next step"]] as const).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={!!a.v[k]} onCheckedChange={(x) => a.set(k, x)} aria-label={label} /> {label}</label>
          ))}
        </div>
        <FormError message={null} />
      </SettingCard>

      <SettingCard icon={Sparkles} tone="red" title="Assistant" description="With an OpenAI key the deal page drafts the presales scope, the BOQ summary and the proposal email, and writes a deal brief for pipeline calls." footer={<><Button onClick={() => i.save((d) => ({ ...d, apiKey: d.apiKey === "" && ai.apiKeySet ? undefined : d.apiKey }))} disabled={i.pending}>Save assistant</Button><Button variant="outline" onClick={() => test("ai")} disabled={testing === "ai" || !ai.apiKeySet}>Test</Button><span className="text-xs text-muted-foreground">{ai.apiKeySet ? "On. Deal text is sent to OpenAI when someone clicks a draft button." : "Off until a key is saved."}</span></>}>
        <Field label="OpenAI API key" htmlFor="ai-key" error={i.errors.apiKey} hint={ai.apiKeySet ? "A key is stored; leave blank to keep it, or paste a new one." : "Starts with sk-. Stored on this server only."}><Input id="ai-key" type="password" value={i.str("apiKey")} onChange={(e) => i.set("apiKey", e.target.value)} autoComplete="new-password" /></Field>
        <Field label="Model" htmlFor="ai-model" error={i.errors.model}><Input id="ai-model" value={i.str("model")} onChange={(e) => i.set("model", e.target.value)} /></Field>
      </SettingCard>
    </div>
  );
}
