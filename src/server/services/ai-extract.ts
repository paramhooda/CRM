import "server-only";
import ExcelJS from "exceljs";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Forbidden, ValidationError } from "../errors";
import { aiEnabled, complete, completeJson, type ContentPart } from "../ai";
import { boqExtractSchema, extractPrompt, matchBoqLines, matchPrices, priceExtractSchema } from "@/domain/ai-extract";
import { loadDeal, viewerFor } from "./deals";
import { throttle } from "./ai";

export type ExtractKind = "boq" | "prices";
const MAX_FILES = 6;
const MAX_BYTES = 10 * 1024 * 1024;
const IMAGE = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const SHEET = new Set(["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]);
const TEXT = new Set(["text/plain", "text/csv", "message/rfc822"]);

/** A spreadsheet as plain rows, one sheet after another; the model reads text better than cells. */
async function sheetToText(buf: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out: string[] = [];
  wb.eachSheet((ws) => {
    out.push(`## Sheet: ${ws.name}`);
    ws.eachRow((row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => (v && typeof v === "object" && "result" in (v as object) ? String((v as { result: unknown }).result ?? "") : v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "")));
      if (cells.some((c) => c.trim())) out.push(cells.join(" | "));
    });
  });
  return out.join("\n").slice(0, 60_000);
}

async function toParts(files: File[]): Promise<ContentPart[]> {
  const parts: ContentPart[] = [];
  for (const f of files) {
    if (f.size === 0) throw new ValidationError(`${f.name} is empty.`);
    if (f.size > MAX_BYTES) throw new ValidationError(`${f.name} is over 10 MB.`);
    const buf = Buffer.from(await f.arrayBuffer());
    const type = f.type || "";
    const ext = f.name.includes(".") ? f.name.split(".").pop()!.toLowerCase() : "";
    if (IMAGE.has(type) || ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) parts.push({ type: "image_url", image_url: { url: `data:${type || "image/png"};base64,${buf.toString("base64")}` } });
    else if (type === "application/pdf" || ext === "pdf") parts.push({ type: "file", file: { filename: f.name, file_data: `data:application/pdf;base64,${buf.toString("base64")}` } });
    else if (SHEET.has(type) || ext === "xlsx") parts.push({ type: "text", text: `File ${f.name}:\n${await sheetToText(buf)}` });
    else if (TEXT.has(type) || ["txt", "csv", "eml", "md"].includes(ext)) parts.push({ type: "text", text: `File ${f.name}:\n${buf.toString("utf8").slice(0, 60_000)}` });
    else throw new ValidationError(`${f.name}: use a PDF, Excel (.xlsx), CSV, text, email (.eml) or an image.`);
  }
  return parts;
}

/**
 * Reads line items (kind "boq") or vendor prices (kind "prices") out of uploaded documents with the assistant and
 * matches them to the catalogue or the deal's lines. Nothing is written: the grid shows the result for review.
 */
export async function extractFromFiles(actor: Actor, dealId: string, kind: ExtractKind, files: File[], requestId: string) {
  void requestId;
  const deal = await loadDeal(actor, dealId);
  const viewer = await viewerFor(actor, deal);
  if (kind === "boq" && !(viewer.canEdit || viewer.isAssignedPresales || actor.role === "ADMIN")) throw new Forbidden("Only the assigned presales engineer or the deal owner builds the BOQ.");
  if (kind === "prices" && !(viewer.isAssignedPurchase || actor.role === "ADMIN")) throw new Forbidden("Only the assigned buyer reads vendor quotes into the deal.");
  if (!files.length) throw new ValidationError("Add at least one file.", { files: "Add a file." });
  if (files.length > MAX_FILES) throw new ValidationError(`Up to ${MAX_FILES} files at a time.`, { files: "Too many." });
  if (!(await aiEnabled())) return complete({ system: "", user: "", maxTokens: 0 }); // throws AI_OFF
  throttle(actor.id);
  const [products, businessUnits, subBusinessUnits, oems] = await Promise.all([
    db.product.findMany({ where: { deletedAt: null, isActive: true }, select: { id: true, code: true, name: true, unit: true, revenueModel: true, defaultTermMonths: true, businessUnitId: true, subBusinessUnitId: true, oemId: true, oem: { select: { name: true } }, subBusinessUnit: { select: { name: true } } }, orderBy: { name: "asc" } }),
    db.businessUnit.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    db.subBusinessUnit.findMany({ where: { isActive: true }, select: { id: true, name: true, businessUnitId: true } }),
    db.oem.findMany({ where: { isActive: true }, select: { id: true, name: true, isOwnIp: true } }),
  ]);
  const parts = await toParts(files);
  const system = extractPrompt(kind, {
    products: products.map((p) => ({ code: p.code, name: p.name, oem: p.oem.name, subBusinessUnit: p.subBusinessUnit.name, unit: p.unit })),
    oems: oems.map((o) => o.name),
    businessUnits: businessUnits.map((b) => ({ name: b.name, subs: subBusinessUnits.filter((s) => s.businessUnitId === b.id).map((s) => s.name) })),
    lines: deal.lines.map((l) => ({ lineNo: l.lineNo, description: l.description, quantity: l.quantity.toString(), unit: l.unit })),
  });
  const answer = await completeJson(system, [{ type: "text", text: kind === "boq" ? "Extract the line items from these documents." : "Extract the quoted unit costs from these vendor quotes." }, ...parts]);
  if (kind === "boq") {
    const parsed = boqExtractSchema.safeParse(answer);
    if (!parsed.success) throw new ValidationError("The assistant's answer did not fit; try again or add the lines by hand.");
    return { kind, lines: matchBoqLines(parsed.data, { products, businessUnits, subBusinessUnits, oems }), notes: parsed.data.notes ?? null, files: files.map((f) => f.name) };
  }
  const parsed = priceExtractSchema.safeParse(answer);
  if (!parsed.success) throw new ValidationError("The assistant's answer did not fit; try again or enter the costs by hand.");
  return { kind, ...matchPrices(parsed.data, deal.lines.map((l) => ({ id: l.id, lineNo: l.lineNo, description: l.description }))), notes: parsed.data.notes ?? null, files: files.map((f) => f.name) };
}
