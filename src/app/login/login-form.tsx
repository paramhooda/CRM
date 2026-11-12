"use client";
import { useActionState, useRef } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { login, type LoginState } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { ROLE_LABEL } from "@/lib/constants";
import { Avatar } from "@/components/crm/badges";

type Demo = { name: string; email: string; role: keyof typeof ROLE_LABEL; title: string | null };

export function LoginForm({ next, demo, demoPassword, canReset }: { next?: string; demo: Demo[]; demoPassword?: string; canReset: boolean }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  const formRef = useRef<HTMLFormElement>(null);

  function signInAs(email: string) {
    const f = formRef.current!;
    (f.elements.namedItem("email") as HTMLInputElement).value = email;
    (f.elements.namedItem("password") as HTMLInputElement).value = demoPassword ?? "";
    f.requestSubmit();
  }

  return (
    <div className="-m-5">
      <form ref={formRef} action={action} className="flex flex-col gap-3.5 p-5">
        <h1 className="text-base font-semibold">Sign in</h1>
        <input type="hidden" name="next" value={next ?? ""} />
        <Field label="Work email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="username" required placeholder="name@progression.com" />
        </Field>
        <Field label="Password" htmlFor="password">
          <Input id="password" name="password" type="password" autoComplete="current-password" required />
        </Field>
        {state.error && (
          <p role="alert" className="rounded-md px-2.5 py-1.5 text-xs" style={{ background: "var(--t-red-bg)", color: "var(--t-red)" }}>
            {state.error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Sign in
        </Button>
        <Link href="/forgot-password" className="self-center text-xs text-ink-3 hover:text-primary">
          {canReset ? "Forgot password?" : "Can't sign in?"}
        </Link>
      </form>
      {demo.length > 0 && demoPassword && (
        <div className="border-t border-border p-5 pt-4">
          <p className="mb-2 text-xs font-medium text-ink-2">Demo accounts · one-click sign in</p>
          <div className="flex flex-col gap-1">
            {demo.map((d) => (
              <button
                key={d.email}
                type="button"
                disabled={pending}
                onClick={() => signInAs(d.email)}
                className="group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-hover disabled:opacity-60 cursor-pointer"
              >
                <Avatar name={d.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{d.name}</span>
                  <span className="block truncate text-xs text-ink-3">{ROLE_LABEL[d.role]} · {d.email}</span>
                </span>
                <ArrowRight className="size-3.5 text-ink-3 opacity-0 transition group-hover:opacity-100" />
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">All demo users share the password {demoPassword}</p>
        </div>
      )}
    </div>
  );
}
