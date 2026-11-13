"use server";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { isManager, opportunityScope } from "@/lib/authz";
import { recordEvent } from "@/lib/audit";
import { CLOSED_STAGES, type StageKey } from "@/lib/constants";
import { DOCUMENT_KIND_META, type DocumentKindKey } from "@/lib/documents";
import type { ActionResult } from "@/lib/validation";
import { safeAction } from "@/server/action-error";

/** Remove a document: whoever added it, while the deal is open; a manager at any time. */
export const deleteDocument = safeAction("deleteDocument", async function deleteDocument(id: string): Promise<ActionResult> {
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
});

/**
 * Which line items a supplier or OEM quote covers: whoever added it, the deal's purchase person, or a manager, while
 * the deal is open. One quote can cover several lines; purchase can't complete pricing until every priced line has one.
 */
export const setDocumentLines = safeAction("setDocumentLines", async function setDocumentLines(id: string, lineIds: string[]): Promise<ActionResult> {
  const user = await requireUser();
  const doc = await db.opportunityDocument.findFirst({
    where: { id, opportunity: opportunityScope(user) },
    select: { id: true, kind: true, fileName: true, uploadedById: true, opportunity: { select: { id: true, stage: true, purchaseOwnerId: true } } },
  });
  if (!doc) return { ok: false, error: "Document not found." };
  if (!["SUPPLIER_QUOTE", "OEM_QUOTE"].includes(doc.kind)) return { ok: false, error: "Only supplier and OEM quotes cover line items." };
  if (CLOSED_STAGES.includes(doc.opportunity.stage as StageKey)) return { ok: false, error: "This deal is closed." };
  if (!isManager(user) && doc.uploadedById !== user.id && doc.opportunity.purchaseOwnerId !== user.id)
    return { ok: false, error: "Only purchase, the person who added it, or a manager can change this." };
  const ids = [...new Set((Array.isArray(lineIds) ? lineIds : []).filter((x) => typeof x === "string"))].slice(0, 200);
  const lines = await db.opportunityLineItem.findMany({ where: { id: { in: ids }, opportunityId: doc.opportunity.id }, select: { id: true, lineNo: true } });
  await db.$transaction(async (tx) => {
    await tx.documentLine.deleteMany({ where: { documentId: id } });
    if (lines.length) await tx.documentLine.createMany({ data: lines.map((l) => ({ documentId: id, lineItemId: l.id })) });
    await recordEvent(tx, {
      entityType: "Opportunity", entityId: doc.opportunity.id, action: "DOCUMENT_LINES", userId: user.id,
      newValue: `${doc.fileName} covers ${lines.length ? `line${lines.length > 1 ? "s" : ""} ${lines.map((l) => l.lineNo).sort((a, b) => a - b).join(", ")}` : "no lines"}`,
    });
  });
  revalidatePath(`/opportunities/${doc.opportunity.id}`);
  return { ok: true };
});
