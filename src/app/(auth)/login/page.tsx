import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getActor } from "@/server/auth/actor";
import { Logo } from "@/components/crm/logo";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const actor = await getActor();
  const { next } = await searchParams;
  if (actor) redirect(next && next.startsWith("/") ? next : "/");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center"><Logo height={36} /></div>
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="mb-5 mt-1 text-sm text-muted-foreground">Progression CRM</p>
          <LoginForm next={next} />
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">Forgotten your password? Ask an administrator to reset it.</p>
      </div>
    </div>
  );
}
