import { requireUser } from "@/lib/auth";
import { AuthFrame } from "@/components/auth/auth-card";
import { ChangePasswordForm } from "@/components/auth/password-forms";

export const metadata = { title: "Password" };
export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await requireUser();
  return (
    <AuthFrame>
      <ChangePasswordForm forced={!!user.mustChangePassword} />
    </AuthFrame>
  );
}
