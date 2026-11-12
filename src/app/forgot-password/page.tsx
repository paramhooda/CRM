import Link from "next/link";
import { AuthFrame } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/password-forms";
import { emailReady } from "@/server/settings";

export const metadata = { title: "Forgot password" };
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  return (
    <AuthFrame>
      {(await emailReady()) ? (
        <ForgotPasswordForm />
      ) : (
        <div className="flex flex-col gap-3">
          <h1 className="text-base font-semibold">Forgot password</h1>
          <p className="text-[13px] text-ink-2">Ask your CRM administrator to reset your password. You&apos;ll choose your own when you next sign in.</p>
          <Link href="/login" className="text-xs text-primary hover:underline">Back to sign in</Link>
        </div>
      )}
    </AuthFrame>
  );
}
