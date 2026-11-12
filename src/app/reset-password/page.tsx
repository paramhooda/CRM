import { AuthFrame } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/password-forms";

export const metadata = { title: "Reset password", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthFrame>
      <ResetPasswordForm token={token ?? ""} />
    </AuthFrame>
  );
}
