import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listUsers } from "@/server/services/users";
import { PageHeader } from "@/components/crm/page-header";
import { UsersTable } from "./users-table";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ includeInactive?: string }> }) {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const { includeInactive } = await searchParams;
  const { rows } = await listUsers(actor, includeInactive === "true");
  return (
    <>
      <PageHeader title="Users" description="Who can sign in, their role and who they report to. Deactivate rather than delete; history keeps the name." />
      <UsersTable rows={rows.map((r) => ({ ...r, lockedUntil: r.lockedUntil?.toISOString() ?? null, lastLoginAt: r.lastLoginAt?.toISOString() ?? null }))} includeInactive={includeInactive === "true"} />
    </>
  );
}
