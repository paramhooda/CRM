import "server-only";
import { db } from "../db";
import type { Actor } from "../auth/actor";
import { Conflict, ValidationError } from "../errors";
import { recordEvent } from "../audit";
import { assertCanEditDeal, assertPermission } from "../authz/scope";
import { nextCode } from "../sequence";
import type { CreateQuoteInput } from "@/contracts/quotes";
import { priceBlockers } from "@/domain/stages";
import { quoteFileName, quoteLines, quoteSubtotal, validUntil } from "@/domain/quote";
import { activeRules, approvalStateFor, dealFacts, loadDeal, rulesMatchFor } from "./deals";
import { storeDocument } from "./documents";
import { getSetting } from "./settings";
import { renderQuotePdf } from "../pdf/quote";

const quoteSelect = { id: true, quoteNo: true, revision: true, validUntil: true, notes: true, subtotal: true, documentId: true, createdAt: true, createdBy: { select: { id: true, fullName: true } }, document: { select: { fileName: true } } } as const;
const out = (q: { subtotal: { toString(): string }; validUntil: Date } & Record<string, unknown>) => ({ ...q, subtotal: q.subtotal.toString(), validUntil: q.validUntil.toISOString().slice(0, 10) });

export async function listQuotes(actor: Actor, dealId: string) {
  assertPermission(actor, "deals.viewSales");
  await loadDeal(actor, dealId, { includeDeleted: true });
  const rows = await db.quote.findMany({ where: { dealId }, select: quoteSelect, orderBy: { revision: "desc" } });
  return { rows: rows.map(out) };
}

/**
 * Generates the quotation PDF from the deal's lines and stores it as a Quotation document. Only once the prices are
 * final: every line priced and costed, and any approval given. Each new quote is the next revision on the deal.
 */
export async function createQuote(actor: Actor, dealId: string, input: CreateQuoteInput, requestId: string) {
  assertPermission(actor, "deals.viewSales");
  const deal = await loadDeal(actor, dealId);
  await assertCanEditDeal(actor, deal);
  const rules = await activeRules();
  const facts = dealFacts(deal, approvalStateFor(deal, rules), rulesMatchFor(deal, rules).map((m) => m.rule.name));
  const blockers = priceBlockers(facts);
  if (blockers.length) throw new Conflict(blockers[0]!, "QUOTE_BLOCKED");
  const kind = await db.documentKind.findFirst({ where: { name: "Quotation", isActive: true } });
  if (!kind) throw new ValidationError("The Quotation document kind is missing; an administrator adds it under Master data.");
  const company = await getSetting("company");
  const now = new Date();
  const lines = quoteLines(deal.lines.map((l) => ({ lineNo: l.lineNo, description: l.description, hsnSac: l.product?.hsnSac ?? null, quantity: l.quantity, unit: l.unit, revenueModel: l.revenueModel, termMonths: l.termMonths, unitSalesPrice: l.unitSalesPrice })));
  const subtotal = quoteSubtotal(lines);
  const sender = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { fullName: true, title: true, email: true } });
  const row = await db.$transaction(async (tx) => {
    const quoteNo = await nextCode(tx, "QT", now);
    const revision = (await tx.quote.count({ where: { dealId } })) + 1;
    const pdf = await renderQuotePdf({
      quoteNo, revision, date: now.toISOString().slice(0, 10), validUntil: validUntil(now, input.validityDays),
      company: { name: company.name, addressLines: [company.addressLine, [company.city, company.state, company.pincode].filter(Boolean).join(", ")].filter((x): x is string => !!x), gstin: company.gstin ?? null, phone: company.phone ?? null, email: company.email ?? null, website: company.website ?? null, terms: company.quoteTerms ?? null },
      customer: { name: deal.account.name, addressLines: [deal.account.addressLine, [deal.account.city, deal.account.state, deal.account.pincode].filter(Boolean).join(", ")].filter((x): x is string => !!x), gstin: deal.account.gstin, contact: deal.primaryContact ? `${deal.primaryContact.firstName} ${deal.primaryContact.lastName}${deal.primaryContact.designation ? `, ${deal.primaryContact.designation}` : ""}` : null },
      deal: { code: deal.code, name: deal.name },
      lines, subtotal, notes: input.notes ?? null,
      sender: { name: sender.fullName, title: sender.title, email: sender.email },
    });
    const document = await storeDocument(tx, { dealId, kindId: kind.id, kindName: kind.name, fileName: quoteFileName(quoteNo, deal.name), contentType: "application/pdf", content: pdf, description: `Quotation ${quoteNo}${revision > 1 ? ` (revision ${revision})` : ""}`, actorId: actor.id, requestId });
    const q = await tx.quote.create({ data: { dealId, quoteNo, revision, validUntil: new Date(validUntil(now, input.validityDays)), notes: input.notes ?? null, subtotal, documentId: document.id, createdById: actor.id }, select: quoteSelect });
    await recordEvent(tx, { entityType: "quote", entityId: q.id, dealId, action: "CREATE", userId: actor.id, requestId, newValue: `${quoteNo} (revision ${revision}), INR ${subtotal}` });
    return q;
  });
  return out(row);
}
