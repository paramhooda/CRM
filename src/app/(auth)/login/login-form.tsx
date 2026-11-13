"use client";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FormError } from "@/components/crm/form";
import { useForm } from "@/client/use-form";
import { api } from "@/client/api";
import { loginSchema } from "@/contracts/auth";

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const f = useForm({ email: "", password: "" }, loginSchema);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void f.submit(async (v) => {
          const r = await api.post<{ mustChangePassword: boolean }>("/auth/login", v);
          router.replace(r.mustChangePassword ? "/account?change=1" : next && next.startsWith("/") ? next : "/");
          router.refresh();
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
      <Button type="submit" disabled={f.pending} className="mt-1 w-full">{f.pending ? "Signing in…" : "Sign in"}</Button>
    </form>
  );
}
