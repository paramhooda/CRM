import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, Forbidden, NotFound, ValidationError } from "../errors";
import { recordEvent } from "../audit";
import { canEditDeal, dealWhere, isManager } from "../authz/scope";
import { loadDeal, viewerFor } from "./deals";
import { isOpen } from "@/domain/stages";
import { canUploadDocument } from "@/domain/workflow";

export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;
const ALLOWED_EXT = new Set(["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "png", "jpg", "jpeg", "zip", "msg", "eml", "txt", "csv"]);

const select = {
  id: true, fileName: true, contentType: true, sizeBytes: true, description: true, uploadedAt: true, deletedAt: true, dealId: true,
  kind: { select: { id: true, name: true, restrictedToSales: true, requiredAtWon: true } },
  uploadedBy: { select: { id: true, fullName: true } },
} as const;

const salesSide = (actor: Actor) => actor.role !== "PRESALES" && actor.role !== "PURCHASE";

/** May the actor add files to the deal? Anyone working it while it is live; admins always (`domain/workflow`). */
async function mayUpload(actor: Actor, deal: Awaited<ReturnType<typeof loadDeal>>) {
  return canUploadDocument(await viewerFor(actor, deal), deal.stage, !!deal.deletedAt);
}

export async function listDocuments(actor: Actor, dealId: string) {
  await loadDeal(actor, dealId, { includeDeleted: true });
  const rows = await db.dealDocument.findMany({ where: { dealId, deletedAt: null, ...(salesSide(actor) ? {} : { kind: { restrictedToSales: false } }) }, select, orderBy: { uploadedAt: "desc" } });
  return { rows };
}

export async function uploadDocument(actor: Actor, dealId: string, input: { documentKindId: string; description: string | null; file: File }, requestId: string) {
  const deal = await loadDeal(actor, dealId);
  if (!(await mayUpload(actor, deal))) throw new Forbidden("You can't add documents to this deal.");
  const kind = await db.documentKind.findFirst({ where: { id: input.documentKindId, isActive: true } });
  if (!kind) throw new ValidationError("Pick a document kind.", { documentKindId: "Pick a document kind." });
  if (kind.restrictedToSales && !salesSide(actor)) throw new Forbidden("That kind of document is for sales to attach.");
  const name = input.file.name?.trim() || "document";
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (!ALLOWED_EXT.has(ext)) throw new ValidationError(`.${ext || "?"} files are not accepted. Use PDF, Office, image, text, zip or email files.`, { file: "File type not accepted." });
  if (input.file.size === 0) throw new ValidationError("The file is empty.", { file: "Empty file." });
  if (input.file.size > MAX_DOCUMENT_BYTES) throw new ValidationError("Files can be up to 20 MB.", { file: "Too large." });
  const content = Buffer.from(await input.file.arrayBuffer());
  const row = await db.$transaction(async (tx) => {
    const d = await tx.dealDocument.create({ data: { dealId, documentKindId: kind.id, fileName: name.slice(0, 200), contentType: input.file.type || "application/octet-stream", sizeBytes: content.byteLength, content, description: input.description, uploadedById: actor.id }, select });
    await recordEvent(tx, { entityType: "document", entityId: d.id, dealId, action: "CREATE", userId: actor.id, requestId, newValue: `${kind.name}: ${d.fileName}` });
    return d;
  });
  return row;
}

export async function downloadDocument(actor: Actor, id: string) {
  const d = await db.dealDocument.findFirst({ where: { id, deletedAt: null, deal: await dealWhere(actor, { includeDeleted: true }) }, include: { kind: true } });
  if (!d || (d.kind.restrictedToSales && !salesSide(actor))) throw new NotFound("That document doesn't exist or isn't yours to see.");
  return d;
}

export async function deleteDocument(actor: Actor, id: string, requestId: string) {
  const d = await db.dealDocument.findFirst({ where: { id, deletedAt: null, deal: await dealWhere(actor) }, select });
  if (!d) throw new NotFound();
  const deal = await loadDeal(actor, d.dealId);
  const mine = d.uploadedBy.id === actor.id;
  const allowed = isManager(actor) || (await canEditDeal(actor, deal)) || (mine && isOpen(deal.stage));
  if (!allowed) throw new Forbidden("You can't remove this document.");
  if (deal.stage === "CLOSED_WON" && d.kind.requiredAtWon && !isManager(actor)) throw new Conflict("The PO of a won deal stays on record.", "LOCKED");
  await db.$transaction(async (tx) => {
    await tx.dealDocument.update({ where: { id }, data: { deletedAt: new Date(), deletedById: actor.id } });
    await recordEvent(tx, { entityType: "document", entityId: id, dealId: d.dealId, action: "DELETE", userId: actor.id, requestId, oldValue: `${d.kind.name}: ${d.fileName}` });
  });
}
