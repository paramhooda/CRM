"use client";
// Forms submit through onSubmit (not a form action) so fields keep their values when the server rejects them.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { FormAlert } from "./auth-card";
import { changePassword, requestPasswordReset, resetPassword } from "@/server/actions/account";
import { PASSWORD_HINT } from "@/lib/password";

function NewPasswordFields({ error }: { error?: string }) {
  return (
    <>
      <Field label="New password" htmlFor="next" hint={PASSWORD_HINT} error={error}>
        <Input id="next" name="next" type="password" autoComplete="new-password" required minLength={10} maxLength={72} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
    </>
  );
}

function readNew(f: FormData): { next: string; mismatch: boolean } {
  const next = String(f.get("next") ?? "");
  return { next, mismatch: next !== String(f.get("confirm") ?? "") };
}

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<{ msg?: string; field?: Record<string, string> }>({});
  const submit = (f: FormData) => {
    const { next, mismatch } = readNew(f);
    if (mismatch) return setErr({ msg: "The two new passwords don't match." });
    start(async () => {
      const r = await changePassword({ current: String(f.get("current") ?? ""), next }).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
      if (!r.ok) return setErr({ msg: r.error, field: "fieldErrors" in r ? r.fieldErrors : undefined });
      toast.success("Password changed");
      router.replace("/dashboard");
      router.refresh();
    });
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-base font-semibold">{forced ? "Choose your own password" : "Change password"}</h1>
        <p className="mt-1 text-xs text-ink-3">
          {forced ? "Your password was set by an administrator. Pick one only you know to continue." : "You stay signed in here; other devices are signed out."}
        </p>
      </div>
      <Field label={forced ? "Password you were given" : "Current password"} htmlFor="current" error={err.field?.current}>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </Field>
      <NewPasswordFields error={err.field?.next} />
      {err.msg && <FormAlert>{err.msg}</FormAlert>}
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save password
      </Button>
      {!forced && <Link href="/dashboard" className="text-center text-xs text-ink-3 hover:text-primary">Cancel</Link>}
    </form>
  );
}

export function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string>();
  const submit = (f: FormData) =>
    start(async () => {
      const r = await requestPasswordReset(String(f.get("email") ?? "")).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
      if (!r.ok) return setErr(r.error);
      setSent(true);
    });
  if (sent) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-base font-semibold">Check your email</h1>
        <p className="text-[13px] text-ink-2">If that email belongs to an active account, a link to reset the password is on its way. It works for 30 minutes.</p>
        <Link href="/login" className="text-xs text-primary hover:underline">Back to sign in</Link>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="flex flex-col gap-3.5">
      <div>
        <h1 className="text-base font-semibold">Forgot password</h1>
        <p className="mt-1 text-xs text-ink-3">We&apos;ll email you a link to choose a new password.</p>
      </div>
      <Field label="Work email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </Field>
      {err && <FormAlert>{err}</FormAlert>}
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Send reset link
      </Button>
      <Link href="/login" className="text-center text-xs text-ink-3 hover:text-primary">Back to sign in</Link>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<{ msg?: string; field?: string }>({});
  const submit = (f: FormData) => {
    const { next, mismatch } = readNew(f);
    if (mismatch) return setErr({ msg: "The two new passwords don't match." });
    start(async () => {
      const r = await resetPassword({ token, next }).catch(() => ({ ok: false as const, error: "Could not reach the server. Try again." }));
      if (!r.ok) return setErr({ msg: r.error, field: "fieldErrors" in r ? r.fieldErrors?.next : undefined });
      setDone(true);
    });
  };
  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-base font-semibold">Password changed</h1>
        <p className="text-[13px] text-ink-2">Sign in with your new password. Any other signed-in devices have been signed out.</p>
        <Button asChild variant="primary" size="lg"><Link href="/login">Sign in</Link></Button>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(new FormData(e.currentTarget)); }} className="flex flex-col gap-3.5">
      <h1 className="text-base font-semibold">Choose a new password</h1>
      <NewPasswordFields error={err.field} />
      {err.msg && <FormAlert>{err.msg}</FormAlert>}
      <Button type="submit" variant="primary" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} Save password
      </Button>
    </form>
  );
}
