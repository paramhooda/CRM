import type { Metadata } from "next";
import { requireActor } from "@/server/auth/actor";
import { PageHeader } from "@/components/crm/page-header";
import { ROLE_LABEL } from "@/contracts/users";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ change?: string }> }) {
  const actor = await requireActor();
  const { change } = await searchParams;
  return (
    <>
      <PageHeader title="My account" description={`${actor.fullName} · ${ROLE_LABEL[actor.role]} · ${actor.email}`} />
      <div className="max-w-md">
        {(actor.mustChangePassword || change) && (
          <p className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm">Choose a new password to continue. The one you signed in with was set by an administrator.</p>
        )}
        <ChangePasswordForm />
      </div>
    </>
  );
}
