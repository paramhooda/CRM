import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LoginForm } from "./login-form";
import { AuthFrame } from "@/components/auth/auth-card";
import { DEMO_PASSWORD, demoLoginsOn } from "@/lib/demo";
import { emailReady } from "@/server/settings";
import { safeNext } from "@/lib/lockout";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next } = await searchParams;
  const showDemo = demoLoginsOn();
  const demo = showDemo
    ? await Promise.all(
        (["SALES_HEAD", "SALES", "PRESALES", "PURCHASE", "ADMIN"] as const).map((role) =>
          db.user.findFirst({ where: { role, active: true }, orderBy: { createdAt: "asc" }, select: { name: true, email: true, role: true, title: true } }),
        ),
      )
    : [];
  return (
    <AuthFrame>
      <LoginForm
        next={next ? safeNext(next) : undefined}
        demo={demo.filter((d): d is NonNullable<typeof d> => !!d)}
        demoPassword={showDemo ? DEMO_PASSWORD : undefined}
        canReset={await emailReady().catch(() => false)}
      />
    </AuthFrame>
  );
}
