import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/server/auth/actor";
import { listRules } from "@/server/services/approvals";
import { listUsers } from "@/server/services/users";
import { PageHeader } from "@/components/crm/page-header";
import { RulesTable } from "./rules-table";

export const metadata: Metadata = { title: "Approval rules" };

export default async function ApprovalRulesPage() {
  const actor = await requireActor();
  if (actor.role !== "ADMIN") redirect("/");
  const [{ rows }, users] = await Promise.all([listRules(actor), listUsers(actor, false)]);
  return (
    <>
      <PageHeader title="Approval rules" description="When a deal's prices match a rule, the approvers must sign off before the proposal goes out. Steps run in order." />
      <RulesTable rows={rows.map((r) => ({ ...r, steps: r.steps.map((s) => ({ ...s, approverRole: s.approverRole === "ADMIN" || s.approverRole === "SALES_HEAD" ? s.approverRole : null })) }))} people={users.rows.filter((u) => u.role === "ADMIN" || u.role === "SALES_HEAD").map((u) => ({ id: u.id, fullName: u.fullName }))} />
    </>
  );
}
