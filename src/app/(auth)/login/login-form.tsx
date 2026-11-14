"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/crm/form";
import { useForm } from "@/client/use-form";
import { api, errorMessage } from "@/client/api";
import { loginSchema } from "@/contracts/auth";
import { cn } from "@/lib/utils";

/** The seeded demo people, one per role. Shown only when the server says the demo data is loaded. */
export const DEMO_LOGINS = [
  { role: "Admin", name: "System Administrator", email: "admin@progression.com", blurb: "Users, master data, every record" },
  { role: "Sales head", name: "Vivek Malhotra", email: "vivek.malhotra@progression.com", blurb: "The whole team's pipeline, approvals, reviews" },
  { role: "Sales", name: "Rakesh Pawar", email: "rakesh.pawar@progression.com", blurb: "Own accounts, deals and leads" },
  { role: "Presales", name: "Rakesh Yadav", email: "rakesh.yadav@progression.com", blurb: "BOQ requests and lines, no prices" },
  { role: "Purchase", name: "Meera Iyer", email: "meera.iyer@progression.com", blurb: "Pricing requests and costs" },
] as const;
const DEMO_PASSWORD = "Progression@123";

export function LoginForm({ next, demo = false }: { next?: string; demo?: boolean }) {
  const router = useRouter();
  const f = useForm({ email: "", password: "" }, loginSchema);
  const [busy, setBusy] = useState<string | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const go = (mustChangePassword: boolean) => {
    router.replace(mustChangePassword ? "/account?change=1" : next && next.startsWith("/") ? next : "/");
    router.refresh();
  };
  const demoSignIn = async (email: string) => {
    setBusy(email);
    setDemoError(null);
    try {
      const r = await api.post<{ mustChangePassword: boolean }>("/auth/login", { email, password: DEMO_PASSWORD });
      go(r.mustChangePassword);
    } catch (e) {
      setDemoError(errorMessage(e));
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void f.submit(async (v) => {
            const r = await api.post<{ mustChangePassword: boolean }>("/auth/login", v);
            go(r.mustChangePassword);
          });
        }}
      >
        <Field label="Email" htmlFor="email" error={f.errors.email} required>
          <Input id="email" type="email" autoComplete="email" autoFocus value={f.values.email} onChange={(e) => f.set("email", e.target.value)} aria-invalid={!!f.errors.email} />
        </Field>
        <Field label="Password" htmlFor="password" error={f.errors.password} required>
          <Input id="password" type="password" autoComplete="current-password" value={f.values.password} onChange={(e) => f.set("password", e.target.value)} aria-invalid={!!f.errors.password} />
        </Field>
        <FormError message={f.formError} />
        <Button type="submit" disabled={f.pending || !!busy} className="mt-1 w-full">{f.pending ? "Signing in…" : "Sign in"}</Button>
      </form>
      {demo && (
        <section aria-label="Demo logins" className="border-t border-border pt-5">
          <div className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Try a role</div>
          <p className="mt-1 text-sm text-muted-foreground">Demo data is loaded. One click signs you in as that person.</p>
          <div className="mt-3 grid gap-2">
            {DEMO_LOGINS.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => demoSignIn(d.email)}
                disabled={!!busy || f.pending}
                className={cn("flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left shadow-card transition-colors hover:border-border-strong hover:bg-muted/40 disabled:opacity-60", busy === d.email && "border-ring")}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-selected text-xs font-semibold text-selected-foreground">{d.name.split(" ").map((s) => s[0]).join("").slice(0, 2)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{d.role} <span className="font-normal text-muted-foreground">· {d.name}</span></span>
                  <span className="block truncate text-xs text-muted-foreground">{d.blurb}</span>
                </span>
                <span className="text-xs text-muted-foreground">{busy === d.email ? "Signing in…" : "Sign in →"}</span>
              </button>
            ))}
          </div>
          {demoError && <p className="mt-2 text-xs text-destructive" role="alert">{demoError}</p>}
        </section>
      )}
    </div>
  );
}
