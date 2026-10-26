"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
import { recordChanges } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { recomputeOpportunity } from "@/lib/opportunity-service";
import { fmtDate, inr } from "@/lib/format";
import { fcLabel, healthLabel, stageLabel } from "@/lib/review";
import type { ActionResult } from "@/lib/validation";
import { dealFieldErrors } from "@/lib/stage-rules";
import type { StageKey } from "@/lib/constants";

const DAY = 86_400_000;

const completeSchema = z.object({
  /** "all" or the sales people covered by this review */
  who: z.union([z.literal("all"), z.array(z.string().min(1)).min(1).max(100)]),
  notes: z.string().trim().max(4000).optional(),
  actions: z
    .array(
      z.object({
        subject: z.string().trim().min(3, "Describe the action").max(200),
        ownerId: z.string().min(1),
        dueAt: z.coerce.date(),
        opportunityId: z.string().optional().nullable(),
      }),
    )
    .max(30)
    .default([]),
});

/**
 * Complete a pipeline review for exactly who was reviewed (one person, a team or everyone). It becomes the
 * "since last review" baseline for those people, and every agreed action becomes a task for its owner.
 */
export async function completeReview(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  if (!can.reviewPipeline(user)) return { ok: false, error: "Not allowed." };
  const parsed = completeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the review details." };
  const v = parsed.data;
  // A sales person can only record a review of their own pipeline
  const subjectIds = user.role === "SALES" ? [user.id] : v.who === "all" ? [] : v.who;
  const people = await db.user.findMany({ where: { active: true, role: { in: ["SALES", "SALES_HEAD"] } }, select: { id: true } });
  const allowed = new Set(people.map((p) => p.id));
  if (subjectIds.some((id) => !allowed.has(id))) return { ok: false, error: "Unknown sales person." };
  for (const a of v.actions) {
    if (!allowed.has(a.ownerId) && a.ownerId !== user.id) return { ok: false, error: "Actions can be assigned to sales people only." };
    if (user.role === "SALES" && a.ownerId !== user.id) return { ok: false, error: "You can only assign actions to yourself." };
  }
  const oppIds = v.actions.map((a) => a.opportunityId).filter((x): x is string => !!x);
  if (oppIds.length) {
    const visible = await db.opportunity.count({ where: { AND: [{ id: { in: oppIds } }, opportunityScope(user)] } });
    if (visible !== new Set(oppIds).size) return { ok: false, error: "A linked deal is not accessible." };
  }

  const now = new Date();
  const review = await db.$transaction(async (tx) => {
    const r = await tx.pipelineReview.create({ data: { reviewedById: user.id, reviewedAt: now, subjectIds, notes: v.notes || null } });
    for (const a of v.actions) {
      await tx.activity.create({
        data: {
          type: "TASK", subject: a.subject, body: `Agreed in pipeline review on ${fmtDate(now)}`, occurredAt: now, dueAt: a.dueAt,
          ownerId: a.ownerId, opportunityId: a.opportunityId || null, reviewId: r.id,
        },
      });
    }
    const owners = [...new Set(v.actions.map((a) => a.ownerId))];
    await notify(tx, owners, {
      type: "SYSTEM",
      title: "New actions from pipeline review",
      body: `${user.name} recorded a review with actions for you`,
      link: "/dashboard",
      exclude: user.id,
    });
    await tx.auditLog.create({ data: { entityType: "PipelineReview", entityId: r.id, action: "CREATE", newValue: `${v.actions.length} actions`, changedById: user.id, changedAt: now } });
    return r;
  });
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
  return { ok: true, data: { id: review.id } };
}

const quickSchema = z.object({
  nextStep: z.string().trim().max(300).optional().nullable(),
  nextStepDate: z.coerce.date().optional().nullable(),
  expectedCloseDate: z.coerce.date().optional(),
  forecastCategory: z.enum(["COMMIT", "UPSIDE", "PIPELINE", "OMITTED"]).optional(),
});

/** In-call update of the fields a review usually agrees on. Audited; a pushed close date counts as a slip. */
export async function quickUpdateDeal(id: string, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const before = await db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] } });
  if (!before) return { ok: false, error: "Opportunity not found." };
  if (!can.editOpportunity(user, before)) return { ok: false, error: "Only the owner or a manager can update this deal." };
  if (["WON", "LOST", "DROPPED"].includes(before.stage)) return { ok: false, error: "Closed deals cannot be changed here." };
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the values entered." };
  const v = parsed.data;
  const data = {
    nextStep: v.nextStep === undefined ? before.nextStep : v.nextStep || null,
    nextStepDate: v.nextStepDate === undefined ? before.nextStepDate : v.nextStepDate,
    expectedCloseDate: v.expectedCloseDate ?? before.expectedCloseDate,
    forecastCategory: v.forecastCategory ?? before.forecastCategory,
  };
  const errors = dealFieldErrors(before.stage as StageKey, before, data);
  if (Object.keys(errors).length) return { ok: false, error: Object.values(errors)[0]!, fieldErrors: errors };
  const now = new Date();
  await db.$transaction(async (tx) => {
    const slip = data.expectedCloseDate.getTime() - before.expectedCloseDate.getTime() > DAY ? 1 : 0;
    await tx.opportunity.update({
      where: { id },
      data: { ...data, closeDateSlipCount: before.closeDateSlipCount + slip, lastActivityAt: now, updatedById: user.id },
    });
    await recordChanges(tx, {
      entityType: "Opportunity", entityId: id, before, after: { ...before, ...data },
      fields: ["nextStep", "nextStepDate", "expectedCloseDate", "forecastCategory"], userId: user.id, at: now,
    });
    await recomputeOpportunity(tx, id, now);
  });
  revalidatePath("/reviews");
  revalidatePath(`/opportunities/${id}`);
  return { ok: true };
}

const FIELD_LABEL: Record<string, string> = {
  stage: "Stage", amount: "Amount", expectedCloseDate: "Close date", forecastCategory: "Forecast", healthLabel: "Health",
  nextStep: "Next step", nextStepDate: "Next step date", salesOwnerId: "Owner", probability: "Probability",
};

/** Change history and recent activity for the review side panel (Salesforce "opportunity history"). */
export async function getDealTimeline(id: string) {
  const user = await requireUser();
  const opp = await db.opportunity.findFirst({ where: { AND: [{ id }, opportunityScope(user)] }, select: { id: true } });
  if (!opp) return null;
  const [audits, activities] = await Promise.all([
    db.auditLog.findMany({
      where: { entityType: "Opportunity", entityId: id, OR: [{ action: "CREATE" }, { field: { in: Object.keys(FIELD_LABEL) } }] },
      orderBy: { changedAt: "desc" },
      take: 40,
      select: { id: true, action: true, field: true, oldValue: true, newValue: true, changedAt: true, changedBy: { select: { name: true } } },
    }),
    db.activity.findMany({
      where: { opportunityId: id },
      orderBy: { occurredAt: "desc" },
      take: 8,
      select: { id: true, type: true, subject: true, occurredAt: true, dueAt: true, completedAt: true, owner: { select: { name: true } } },
    }),
  ]);
  const users = new Map(
    (await db.user.findMany({ where: { id: { in: audits.filter((a) => a.field === "salesOwnerId").flatMap((a) => [a.oldValue, a.newValue]).filter((x): x is string => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
  );
  const fmt = (field: string | null, v: string | null) => {
    if (v === null || v === "") return "—";
    switch (field) {
      case "stage": return stageLabel(v);
      case "forecastCategory": return fcLabel(v);
      case "healthLabel": return healthLabel(v);
      case "amount": return inr(Number(v));
      case "expectedCloseDate":
      case "nextStepDate": return fmtDate(v);
      case "salesOwnerId": return users.get(v) ?? "—";
      case "probability": return `${v}%`;
      default: return v;
    }
  };
  return {
    history: audits.map((a) => ({
      id: a.id,
      at: a.changedAt.toISOString(),
      by: a.changedBy?.name ?? "System",
      text: a.action === "CREATE" ? "Created the opportunity" : `${FIELD_LABEL[a.field ?? ""] ?? a.field}: ${fmt(a.field, a.oldValue)} → ${fmt(a.field, a.newValue)}`,
      field: a.field,
    })),
    activities: activities.map((a) => ({
      id: a.id, type: a.type, subject: a.subject, at: (a.occurredAt ?? a.dueAt)?.toISOString() ?? null, owner: a.owner.name,
      open: a.type === "TASK" && !a.completedAt, dueAt: a.dueAt?.toISOString() ?? null,
    })),
  };
}
