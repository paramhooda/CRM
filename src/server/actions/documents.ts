"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, opportunityScope } from "@/lib/authz";
import { recordEvent } from "@/lib/audit";
import { CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { DOCUMENT_KIND_META, type DocumentKindKey } from "@/lib/documents";
import type { ActionResult } from "@/lib/validation";

/** Remove a document: whoever added it, while the deal is open; a manager at any time. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const doc = await db.opportunityDocument.findFirst({
    where: { id, opportunity: opportunityScope(user) },
    select: { id: true, kind: true, fileName: true, uploadedById: true, opportunity: { select: { id: true, stage: true } } },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  const closed = CLOSED_STAGES.includes(doc.opportunity.stage as StageKey);
  if (!isManager(user) && (doc.uploadedById !== user.id || closed))
    return { ok: false, error: closed ? "Documents on closed deals are kept. Ask a sales manager." : "Only the person who added it, or a manager, can remove it." };
  await db.$transaction(async (tx) => {
    await tx.opportunityDocument.delete({ where: { id } });
    await recordEvent(tx, {
      entityType: "Opportunity", entityId: doc.opportunity.id, action: "DOCUMENT_REMOVED", userId: user.id,
      newValue: `${DOCUMENT_KIND_META[doc.kind as DocumentKindKey].label} · ${doc.fileName}`,
    });
  });
  revalidatePath(`/opportunities/${doc.opportunity.id}`);
  return { ok: true };
}
