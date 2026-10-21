"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { accountScope, opportunityScope } from "@/lib/authz";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { activitySchema, zodErrors, type ActionResult } from "@/lib/validation";

export async function logActivity(input: Record<string, unknown>): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, ...zodErrors(parsed.error) };
  const v = parsed.data;
  let accountId = v.accountId ?? null;
  if (v.opportunityId) {
    const opp = await db.opportunity.findFirst({ where: { AND: [{ id: v.opportunityId }, opportunityScope(user)] }, select: { accountId: true } });
    if (!opp) return { ok: false, error: "Opportunity not found." };
    accountId = opp.accountId;
  } else if (accountId) {
    const acc = await db.account.findFirst({ where: { AND: [{ id: accountId }, accountScope(user)] }, select: { id: true } });
    if (!acc) return { ok: false, error: "Account not found." };
  }
  const isTask = v.type === "TASK";
  const now = new Date();
  const occurredAt = isTask ? now : v.occurredAt ?? now;
  if (!isTask && occurredAt.getTime() > now.getTime() + 60_000) return { ok: false, error: "Logged activities cannot be in the future. Create a task instead." };
  await db.$transaction(async (tx) => {
    await tx.activity.create({
      data: {
        type: v.type, subject: v.subject, body: v.body ?? null, occurredAt, dueAt: isTask ? v.dueAt ?? null : null,
        completedAt: isTask ? null : occurredAt, ownerId: user.id, opportunityId: v.opportunityId ?? null, accountId,
        contactId: v.contactId ?? null,
      },
    });
    if (v.opportunityId && !isTask) {
      const opp = await tx.opportunity.findUniqueOrThrow({ where: { id: v.opportunityId }, select: { lastActivityAt: true } });
      if (!opp.lastActivityAt || opp.lastActivityAt < occurredAt) {
        await tx.opportunity.update({ where: { id: v.opportunityId }, data: { lastActivityAt: occurredAt } });
      }
      await recomputeOpportunity(tx, v.opportunityId);
    }
  });
  if (v.opportunityId) revalidatePath(`/opportunities/${v.opportunityId}`);
  if (accountId) revalidatePath(`/accounts/${accountId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function completeTask(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const t = await db.activity.findUnique({ where: { id } });
  if (!t || t.type !== "TASK") return { ok: false, error: "Task not found." };
  if (t.ownerId !== user.id && user.role !== "ADMIN" && user.role !== "SALES_HEAD") return { ok: false, error: "Not your task." };
  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.activity.update({ where: { id }, data: { completedAt: t.completedAt ? null : now } });
    if (t.opportunityId && !t.completedAt) {
      await tx.opportunity.update({ where: { id: t.opportunityId }, data: { lastActivityAt: now } });
      await recomputeOpportunity(tx, t.opportunityId);
    }
  });
  if (t.opportunityId) revalidatePath(`/opportunities/${t.opportunityId}`);
  return { ok: true };
}
