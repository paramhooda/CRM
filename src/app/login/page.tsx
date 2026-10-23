import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginForm } from "./login-form";
import { Logo } from "@/components/crm/logo";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const showDemo = process.env.DEMO_LOGINS !== "false";
  const demo = showDemo
    ? await Promise.all(
        (["SALES_HEAD", "SALES", "PRESALES", "PURCHASE", "ADMIN"] as const).map((role) =>
          db.user.findFirst({ where: { role, active: true }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, role: true, title: true } }),
        ),
      )
    : [];
  return (
    <main className="flex min-h-screen items-center justify-center bg-page px-4 py-10">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Logo height={36} />
          <p className="text-[13px] text-ink-3">CRM · Systems integration and managed services</p>
        </div>
        <LoginForm next={next} demo={demo.filter((d): d is NonNullable<typeof d> => !!d)} />
        <p className="mt-6 text-center text-xs text-ink-3">Protected system. Access is logged and audited.</p>
      </div>
    </main>
  );
}
