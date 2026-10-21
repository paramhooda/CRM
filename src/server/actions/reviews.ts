"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { can, opportunityScope } from "@/lib/authz";
import { toNumber } from "@/lib/format";
import type { ActionResult } from "@/lib/validation";

/** Close a pipeline review: stores a checkpoint and a health snapshot that the next review diffs against. */
export async function markReviewed(notes: string): Promise<ActionResult> {
  const user = await requireUser();
  if (!can.reviewPipeline(user)) return { ok: false, error: "Not allowed." };
  const opps = await db.opportunity.findMany({
    where: { AND: [opportunityScope(user), { closedAt: null }] },
    select: { id: true, healthLabel: true, amount: true, stage: true },
  });
  const snapshot = Object.fromEntries(opps.map((o) => [o.id, { h: o.healthLabel, a: toNumber(o.amount), s: o.stage }]));
  await db.pipelineReview.create({ data: { reviewedById: user.id, notes: notes.slice(0, 2000) || null, snapshot } });
  revalidatePath("/reviews");
  revalidatePath("/dashboard");
  return { ok: true };
}
